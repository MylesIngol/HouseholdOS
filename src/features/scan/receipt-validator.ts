// Validates an UNTRUSTED parsed JSON payload (Claude's structured-output
// response) into a Receipt this app can actually trust — type-checked,
// integer-cents-checked, non-negative-checked, per plan section 9. Even
// though Anthropic's structured outputs (output_config.format) already
// guarantee schema-valid JSON, this validator is the second, independent
// layer of trust: it enforces this app's OWN domain rules (integer cents,
// non-negative amounts, non-empty names) rather than assuming the model's
// idea of "valid" matches ours, and it's what makes "never pass unvalidated
// AI output through as trusted data" (plan section 5/9) actually true.
//
// Deliberately dependency-free and framework-free so it can run under the
// plain Node test runner with zero live AI calls (plan section 19) — see
// receipt-validator.test.ts. Mirrored (not imported) in
// supabase/functions/process-receipt/validator.ts, which runs on Deno and
// isn't bundled with the app — same reasoning as scan/barcode.ts's mirror
// in the lookup-barcode function.
//
// Per-item problems drop just that item (with a warning) rather than
// failing the whole receipt — most receipts are still useful with one bad
// line removed. Receipt-level problems (missing/invalid total, no items
// left after filtering) fail the whole thing, since there's nothing safe
// left to show a Review screen.

export type ReceiptItem = {
  rawText: string;
  cleanedName: string;
  quantity?: number;
  unitPriceCents?: number;
  totalPriceCents: number;
  category?: string;
  isLikelyFood?: boolean;
  barcode?: string;
  confidence?: number;
};

export type Receipt = {
  merchantName?: string;
  /** ISO date string (yyyy-mm-dd). */
  purchaseDate?: string;
  subtotalCents?: number;
  taxCents?: number;
  discountCents?: number;
  totalCents: number;
  items: ReceiptItem[];
  warnings: string[];
};

export type ValidationResult = { ok: true; receipt: Receipt } | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BARCODE_PATTERN = /^[0-9]{8,14}$/;

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function validateItem(raw: unknown, index: number, warnings: string[]): ReceiptItem | undefined {
  if (!isPlainObject(raw)) {
    warnings.push(`Dropped item ${index + 1}: not a valid object.`);
    return undefined;
  }

  const rawText = isNonEmptyString(raw.rawText) ? raw.rawText.trim() : undefined;
  const cleanedNameCandidate = isNonEmptyString(raw.cleanedName) ? raw.cleanedName.trim() : undefined;
  const cleanedName = cleanedNameCandidate ?? rawText;

  if (!rawText || !cleanedName) {
    warnings.push(`Dropped item ${index + 1}: missing a name.`);
    return undefined;
  }

  if (!isNonNegativeInt(raw.totalPriceCents)) {
    warnings.push(`Dropped "${cleanedName}": missing or invalid price.`);
    return undefined;
  }

  const item: ReceiptItem = {
    rawText,
    cleanedName,
    totalPriceCents: raw.totalPriceCents,
  };

  if (typeof raw.quantity === 'number' && Number.isFinite(raw.quantity) && raw.quantity > 0) {
    item.quantity = raw.quantity;
  }
  if (isNonNegativeInt(raw.unitPriceCents)) item.unitPriceCents = raw.unitPriceCents;
  if (isNonEmptyString(raw.category)) item.category = raw.category.trim();
  if (typeof raw.isLikelyFood === 'boolean') item.isLikelyFood = raw.isLikelyFood;
  if (isNonEmptyString(raw.barcode) && BARCODE_PATTERN.test(raw.barcode.trim())) {
    item.barcode = raw.barcode.trim();
  }
  if (typeof raw.confidence === 'number' && raw.confidence >= 0 && raw.confidence <= 1) {
    item.confidence = raw.confidence;
  }

  return item;
}

export function validateReceipt(raw: unknown): ValidationResult {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Model response was not a valid object.' };
  }

  if (!isNonNegativeInt(raw.totalCents) || raw.totalCents <= 0) {
    return { ok: false, error: 'Could not determine a valid total for this receipt.' };
  }

  if (!Array.isArray(raw.items)) {
    return { ok: false, error: 'Model response had no items array.' };
  }

  const warnings: string[] = [];
  const items = raw.items
    .map((item, index) => validateItem(item, index, warnings))
    .filter((item): item is ReceiptItem => item !== undefined);

  if (items.length === 0) {
    return { ok: false, error: 'Could not extract any usable items from this receipt.' };
  }

  const receipt: Receipt = {
    totalCents: raw.totalCents,
    items,
    warnings,
  };

  if (isNonEmptyString(raw.merchantName)) receipt.merchantName = raw.merchantName.trim();

  if (raw.purchaseDate !== undefined) {
    if (isValidIsoDate(raw.purchaseDate)) {
      receipt.purchaseDate = raw.purchaseDate;
    } else {
      warnings.push('Ignored an invalid purchase date from the model.');
    }
  }

  if (isNonNegativeInt(raw.subtotalCents)) receipt.subtotalCents = raw.subtotalCents;
  if (isNonNegativeInt(raw.taxCents)) receipt.taxCents = raw.taxCents;
  if (isNonNegativeInt(raw.discountCents)) receipt.discountCents = raw.discountCents;

  if (Array.isArray(raw.warnings)) {
    for (const warning of raw.warnings) {
      if (isNonEmptyString(warning)) warnings.push(warning.trim());
    }
  }

  return { ok: true, receipt };
}
