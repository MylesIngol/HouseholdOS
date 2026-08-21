// Explicit .ts extensions on relative imports (not the usual bare-specifier
// style) -- this module is exercised directly by the plain Node test
// runner, which needs real resolvable paths, same constraint as every other
// Node-tested pure module in this codebase (receipt-math.ts, money-math.ts).
import type { Receipt } from './receipt-validator.ts';
import { reconcileReceiptShares, type ReconcileReceiptSharesResult } from './receipt-math.ts';

// -----------------------------------------------------------------------------
// Milestone 7 — Checkpoint G: the Receipt Review screen's editable in-memory
// state, and the pure (no React) functions that build/derive it. Kept
// separate from the screen component itself so the conversion logic is easy
// to reason about and test in isolation — same split already used for
// receipt-math.ts vs its future caller.
//
// This is genuinely just review-session state: nothing here reads from or
// writes to Supabase. Money/Kitchen only ever see a confirmed receipt's
// OUTPUTS, via the future confirm_receipt RPC (checkpoint H, not yet
// approved) — this module has no awareness of that RPC at all.
// -----------------------------------------------------------------------------

export type ReviewItem = {
  /** Stable for the lifetime of one review session (index-based at creation) — not a database id, nothing here is persisted yet. */
  id: string;
  cleanedName: string;
  totalPriceCents: number;
  /** Members splitting this item. Empty means unassigned — reconcileReceiptShares treats that as a blocking condition, not a special case this module needs to track separately. */
  assignedMemberIds: string[];
  addToKitchen: boolean;
  category?: string;
  /** Carried through for the future confirm_receipt RPC (plan section 14 lists barcode as part of the per-item state it needs) — not displayed or edited in this checkpoint. */
  barcode?: string;
};

/**
 * Builds the initial editable review state from a validated Receipt.
 * Per plan section 11's "default rule for a new product with no history:
 * default to Everyone" — every item starts assigned to the whole household.
 * The remembered-assignment lookup (household_product_memory, matched by
 * barcode or normalized name) is explicitly out of this checkpoint's scope;
 * this always uses the Everyone default for now.
 */
export function receiptToReviewItems(receipt: Receipt, householdMemberIds: string[]): ReviewItem[] {
  return receipt.items.map((item, index) => ({
    id: `item-${index}`,
    cleanedName: item.cleanedName,
    totalPriceCents: item.totalPriceCents,
    assignedMemberIds: [...householdMemberIds],
    // isLikelyFood is undefined for a genuinely ambiguous line -- default to
    // including it rather than excluding it, matching the same "default
    // toward inclusion, let the user opt out" philosophy plan section 11
    // uses for assignees (a wrongly-included item is a one-tap fix; a
    // wrongly-excluded one is easy to miss entirely).
    addToKitchen: item.isLikelyFood ?? true,
    category: item.category,
    barcode: item.barcode,
  }));
}

/** Runs the current review items + payer-independent receipt figures through receipt-math.ts's reconcileReceiptShares — the ONLY source of truth for member totals and reconciliation state, per explicit instruction. */
export function reconcileReviewSession(receipt: Receipt, items: ReviewItem[]): ReconcileReceiptSharesResult {
  return reconcileReceiptShares({
    items: items.map((item) => ({
      itemId: item.id,
      totalPriceCents: item.totalPriceCents,
      assignedMemberIds: item.assignedMemberIds,
    })),
    totalCents: receipt.totalCents,
    subtotalCents: receipt.subtotalCents,
    discountCents: receipt.discountCents,
    taxCents: receipt.taxCents,
  });
}
