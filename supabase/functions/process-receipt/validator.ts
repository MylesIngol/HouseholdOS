// Mirrors src/features/scan/receipt-validator.ts exactly — kept as a
// separate copy because this Edge Function (Deno) and the app (Node/RN)
// aren't bundled together, not because the logic is meant to differ. Same
// reasoning as lookup-barcode/index.ts's normalizeBarcode mirror. If you
// change one, change the other — src/features/scan/receipt-validator.test.ts
// is the source of truth for the intended behavior.

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

// Receipt-level lines the model sometimes mis-emits as ordinary items — never
// products a shopper bought, so they must never reach a Review screen as an
// assignable/Add-to-Kitchen-eligible item (plan section 9, "Checkout Bag Tax"
// regression). Matched by EXACT normalized full-line equality only (never a
// substring/contains check) specifically so a real product that happens to
// contain a word like "bag" — "Bag of Chips", "Sandwich Bags" — is never
// dropped; only a line whose ENTIRE text is one of these known labels is
// treated as receipt-level rather than merchandise.
const FEE_OR_TAX_LABELS = new Set(['TAX', 'SALES TAX', 'CHECKOUT BAG TAX', 'BAG TAX', 'BAG FEE']);

const SUMMARY_OR_PAYMENT_LABELS = new Set([
  // Running-total lines — restate a total, never a purchase.
  'SUBTOTAL',
  'SUB TOTAL',
  'BALANCE',
  'BALANCE DUE',
  'BAL DUE',
  'TOTAL',
  'GRAND TOTAL',
  'AMOUNT DUE',
  // Payment/tender/change lines — how the total was paid, not merchandise.
  'CASH',
  'CASH TENDERED',
  'CASH TENDER',
  'CREDIT',
  'CREDIT CARD',
  'DEBIT',
  'DEBIT CARD',
  'CHANGE',
  'CHANGE DUE',
  'TENDER',
  'TENDERED',
  'VISA',
  'MASTERCARD',
  'AMEX',
  'AMERICAN EXPRESS',
  'DISCOVER',
  'GIFT CARD',
  'EBT',
  'EBT CASH',
  'EBT SNAP',
  'PAYMENT',
  'AUTH CODE',
  'APPROVAL CODE',
]);

function normalizeLabel(text: string): string {
  return text.trim().toUpperCase().replace(/\s+/g, ' ').replace(/[:.]+$/, '');
}

/**
 * Strips receipt-level summary/tax/fee/payment lines out of `items` in
 * place, folding mandatory tax/fee amounts (e.g. "Checkout Bag Tax") into
 * `taxCents` rather than dropping the money entirely — the fee was really
 * charged, it's just not a product. Summary lines (SUBTOTAL/TOTAL/BALANCE)
 * and payment/tender lines are simply removed: they don't represent
 * additional money, so folding them into tax would double-count.
 *
 * Deliberately runs AFTER per-item structural validation and AFTER
 * subtotal/tax/discount have been attached to `receipt`, so it can adjust
 * `receipt.taxCents` directly. See the confirm_receipt / receipt-math.ts
 * reconciliation this exists to keep exact: an item like "Checkout Bag Tax"
 * left in `items` inflates the computed items-subtotal past the receipt's
 * own `subtotalCents`, which reconciliation correctly (but symptomatically)
 * flags as a discrepancy.
 */
function sanitizeReceiptChargeLines(receipt: Receipt): void {
  const keptItems: ReceiptItem[] = [];
  let foldedIntoTaxCents = 0;

  for (const item of receipt.items) {
    const normalizedCleaned = normalizeLabel(item.cleanedName);
    const normalizedRaw = normalizeLabel(item.rawText);

    if (FEE_OR_TAX_LABELS.has(normalizedCleaned) || FEE_OR_TAX_LABELS.has(normalizedRaw)) {
      foldedIntoTaxCents += item.totalPriceCents;
      receipt.warnings.push(
        `Folded "${item.cleanedName}" (${(item.totalPriceCents / 100).toFixed(2)}) into tax — a receipt-level charge, not a product.`,
      );
      continue;
    }

    if (
      SUMMARY_OR_PAYMENT_LABELS.has(normalizedCleaned) ||
      SUMMARY_OR_PAYMENT_LABELS.has(normalizedRaw)
    ) {
      receipt.warnings.push(
        `Removed "${item.cleanedName}" from the item list — a receipt summary/payment line, not a product.`,
      );
      continue;
    }

    keptItems.push(item);
  }

  receipt.items = keptItems;
  if (foldedIntoTaxCents > 0) {
    receipt.taxCents = (receipt.taxCents ?? 0) + foldedIntoTaxCents;
  }
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

  sanitizeReceiptChargeLines(receipt);

  if (receipt.items.length === 0) {
    return { ok: false, error: 'Could not extract any usable items from this receipt.' };
  }

  return { ok: true, receipt };
}
