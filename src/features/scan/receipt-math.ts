// Relative imports (not the `@/` tsconfig alias) on purpose — this file, like
// money-math.ts/balances.ts/receipt-validator.ts, is exercised directly by
// the plain Node test runner (`node --experimental-strip-types --test`),
// which only understands real relative module paths, not TS/Metro's path
// alias resolution.
import { splitEqualCents, sumShareCents } from '../money/money-math.ts';
import type { ParticipantShare } from '../money/types.ts';

// -----------------------------------------------------------------------------
// Milestone 7 — Checkpoint F: pure receipt reconciliation math (plan sections
// 10 and 11). No React/React Native imports, no DB access, no AI calls —
// exercised directly by `node --experimental-strip-types --test`, same
// convention as money-math.ts/balances.ts. This is deliberately just the
// math: the future Receipt Review screen (checkpoint G) will call into this
// as the user edits assignments, and the future confirm_receipt RPC
// (checkpoint H, not yet approved/implemented) is what actually persists
// anything — this module never touches Money or Kitchen.
//
// Per-item allocation reuses `splitEqualCents` from money-math.ts UNCHANGED
// (plan section 11: "no new equal-split logic, this function is reused as
// is") — cross-feature import, not a duplicate copy, since both live in the
// same JS bundle (unlike the Deno Edge Function mirrors, which are separate
// copies only because of the Node/Deno boundary).
// -----------------------------------------------------------------------------

/** One receipt line as the review session holds it: already-edited name/price, and who it's currently split between. Item-level discounts (if any) are assumed already netted into `totalPriceCents` by the caller — this module only knows about one receipt-level `discountCents` (plan section 10.5). */
export type ReceiptLineAssignment = {
  itemId: string;
  totalPriceCents: number;
  /** Members splitting this item. Empty means "not assigned yet" — the item still counts toward `itemsSubtotalCents` (plan step 1: "included" means not removed, independent of assignment), but contributes nothing to any member's share, which is exactly what makes an unassigned item surface as a reconciliation shortfall rather than needing separate bookkeeping. */
  assignedMemberIds: string[];
};

export type ReconcileReceiptSharesInput = {
  items: ReceiptLineAssignment[];
  /** The receipt's stated grand total — the one number every other figure must reconcile to exactly (plan step 7). */
  totalCents: number;
  /** Printed/parsed subtotal, if the receipt had one — used only for the item-sum sanity check (plan step 4), not as an allocation input. */
  subtotalCents?: number;
  /** Receipt-level discount only. Allocated proportionally to each member's pre-tax subtotal share (plan step 5). */
  discountCents?: number;
  /** Allocated proportionally to each member's pre-tax, POST-discount share (plan step 6). */
  taxCents?: number;
};

export type ReconcileReceiptSharesResult = {
  /** Sum of every included item's totalPriceCents, regardless of assignment. */
  itemsSubtotalCents: number;
  /** `itemsSubtotalCents - subtotalCents`. Undefined when the receipt had no parsed subtotal to check against — there's nothing to reconcile. */
  subtotalDiscrepancyCents: number | undefined;
  /** Item ids with no assignee yet — still included in `itemsSubtotalCents`, contributing $0 to every member's share until fixed. */
  unassignedItemIds: string[];
  discountAllocations: ParticipantShare[];
  taxAllocations: ParticipantShare[];
  /** Final per-member shares: pretaxItemShare − allocatedDiscount + allocatedTax (plan step 7). Only meaningful to persist once `isReconciled` is true. */
  memberShares: ParticipantShare[];
  /** `sum(memberShares) - totalCents`. Zero exactly when everything reconciles. */
  totalDiscrepancyCents: number;
  /**
   * True only when every item has an assignee AND the final shares sum
   * exactly to totalCents — mirrors the sticky-footer Confirm gate (plan
   * section 13: "disabled until reconciled and every included item has at
   * least one assignee"). Never fudged to force this true; a real receipt
   * whose own printed numbers don't add up stays unreconciled until the user
   * corrects an item price or one of the receipt-level fields, per plan step
   * 4's "never silently absorb the difference."
   */
  isReconciled: boolean;
  /** Human-readable reasons `isReconciled` is false. Empty when reconciled. */
  warnings: string[];
};

/**
 * A trivial amount of slack is tolerated on the subtotal sanity check only
 * (plan step 4's "more than a trivial tolerance") — real receipts are
 * sometimes photographed with a slightly unclear last digit. This does NOT
 * apply to the final total-vs-shares check (`totalDiscrepancyCents`), which
 * must be exactly zero; that one is what actually gets persisted as debt.
 */
const SUBTOTAL_TOLERANCE_CENTS = 1;

/**
 * Largest-remainder (Hare quota) proportional allocation: each member gets
 * `floor(totalCents * weightCents / sumWeights)`, and the leftover cents go
 * one at a time to whichever members have the largest fractional remainder,
 * tied-broken by ascending memberId — the same determinism rule already used
 * for recurring-bill equal-split remainders (generate_next_bill_occurrence,
 * `order by household_member_id`). Unlike `splitEqualCents`, this handles
 * arbitrary (not just equal) weights, which is what proportional tax/discount
 * allocation needs (plan steps 5 and 6).
 *
 * Precondition: `weights` sums to > 0 whenever `totalCents !== 0` — there is
 * no principled way to allocate a non-zero amount across all-zero weights.
 * Callers in this module only ever call this with a positive weight sum
 * (every member with a zero pre-tax subtotal is naturally excluded upstream
 * by having contributed nothing to `itemsSubtotalCents`... except when NO
 * member has been assigned anything yet, in which case this returns all
 * zeros rather than throwing, so a mid-edit review session never crashes).
 */
export function allocateProportionalCents(
  totalCents: number,
  weights: ParticipantShare[],
): ParticipantShare[] {
  if (totalCents === 0 || weights.length === 0) {
    return weights.map((w) => ({ memberId: w.memberId, amountCents: 0 }));
  }

  const sumWeights = weights.reduce((sum, w) => sum + w.amountCents, 0);
  if (sumWeights <= 0) {
    return weights.map((w) => ({ memberId: w.memberId, amountCents: 0 }));
  }

  const floored = weights.map((w) => {
    const exact = (totalCents * w.amountCents) / sumWeights;
    const flooredAmount = Math.floor(exact);
    return { memberId: w.memberId, amountCents: flooredAmount, remainder: exact - flooredAmount };
  });

  const allocated = floored.reduce((sum, entry) => sum + entry.amountCents, 0);
  let remainingCents = totalCents - allocated;

  const order = [...floored].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
  });

  const bonus = new Set<string>();
  for (const entry of order) {
    if (remainingCents <= 0) break;
    bonus.add(entry.memberId);
    remainingCents -= 1;
  }

  return floored.map((entry) => ({
    memberId: entry.memberId,
    amountCents: entry.amountCents + (bonus.has(entry.memberId) ? 1 : 0),
  }));
}

function mergeShares(...shareLists: ParticipantShare[][]): ParticipantShare[] {
  const byMember = new Map<string, number>();
  for (const shares of shareLists) {
    for (const share of shares) {
      byMember.set(share.memberId, (byMember.get(share.memberId) ?? 0) + share.amountCents);
    }
  }
  return [...byMember.entries()].map(([memberId, amountCents]) => ({ memberId, amountCents }));
}

function subtractShares(base: ParticipantShare[], toSubtract: ParticipantShare[]): ParticipantShare[] {
  const subtractByMember = new Map(toSubtract.map((s) => [s.memberId, s.amountCents]));
  return base.map((share) => ({
    memberId: share.memberId,
    amountCents: share.amountCents - (subtractByMember.get(share.memberId) ?? 0),
  }));
}

export function reconcileReceiptShares(input: ReconcileReceiptSharesInput): ReconcileReceiptSharesResult {
  const warnings: string[] = [];

  const itemsSubtotalCents = input.items.reduce((sum, item) => sum + item.totalPriceCents, 0);

  const unassignedItemIds = input.items
    .filter((item) => item.assignedMemberIds.length === 0)
    .map((item) => item.itemId);
  if (unassignedItemIds.length > 0) {
    warnings.push(
      unassignedItemIds.length === 1
        ? '1 item has no one assigned to it.'
        : `${unassignedItemIds.length} items have no one assigned to them.`,
    );
  }

  // Step 1-3: per item, equal-split across its assignees (splitEqualCents,
  // reused unchanged), then accumulate into each member's pre-tax subtotal.
  const perItemShares = input.items.map((item) =>
    splitEqualCents(item.totalPriceCents, item.assignedMemberIds),
  );
  const pretaxShares = mergeShares(...perItemShares);

  // Step 4: sanity-check the items we parsed against the receipt's own
  // printed subtotal, if it had one. This never blocks the math below from
  // running — it's surfaced as a warning/discrepancy for the caller to gate
  // Confirm on, per plan step 4's "never silently absorb the difference."
  let subtotalDiscrepancyCents: number | undefined;
  if (input.subtotalCents !== undefined) {
    subtotalDiscrepancyCents = itemsSubtotalCents - input.subtotalCents;
    if (Math.abs(subtotalDiscrepancyCents) > SUBTOTAL_TOLERANCE_CENTS) {
      const sign = subtotalDiscrepancyCents > 0 ? 'higher' : 'lower';
      warnings.push(
        `Items total $${(Math.abs(subtotalDiscrepancyCents) / 100).toFixed(2)} ${sign} than the receipt's printed subtotal.`,
      );
    }
  }

  // Step 5: receipt-level discount, allocated proportionally to each
  // member's pre-tax subtotal share.
  const discountCents = input.discountCents ?? 0;
  const discountAllocations = allocateProportionalCents(discountCents, pretaxShares);

  // Step 6: tax, allocated proportionally to each member's pre-tax,
  // POST-discount share — a different weight set than the discount step,
  // per plan step 6.
  const postDiscountShares = subtractShares(pretaxShares, discountAllocations);
  const taxCents = input.taxCents ?? 0;
  const taxAllocations = allocateProportionalCents(taxCents, postDiscountShares);

  // Step 7: finalMemberShare = pretaxItemShare - allocatedDiscount + allocatedTax.
  // discountAllocations/taxAllocations are always computed over exactly
  // pretaxShares' member set (both allocateProportionalCents calls above use
  // a weights list derived from pretaxShares), so mapping over pretaxShares
  // directly is safe — no member can appear in one list and not the others.
  const discountByMember = new Map(discountAllocations.map((d) => [d.memberId, d.amountCents]));
  const taxByMember = new Map(taxAllocations.map((t) => [t.memberId, t.amountCents]));
  const memberShares = pretaxShares.map((share) => ({
    memberId: share.memberId,
    amountCents:
      share.amountCents - (discountByMember.get(share.memberId) ?? 0) + (taxByMember.get(share.memberId) ?? 0),
  }));

  const totalDiscrepancyCents = sumShareCents(memberShares) - input.totalCents;
  if (totalDiscrepancyCents !== 0) {
    const sign = totalDiscrepancyCents > 0 ? 'over' : 'under';
    warnings.push(
      `Assigned shares are $${(Math.abs(totalDiscrepancyCents) / 100).toFixed(2)} ${sign} the receipt total.`,
    );
  }

  // Plan step 4 explicitly frames the subtotal check as a Confirm-blocking
  // condition ("block Confirm until the user fixes an item price or the
  // subtotal"), not just an informational note — so a receipt whose printed
  // subtotal doesn't match its own items stays unreconciled even if the
  // final total-vs-shares math happens to still land on zero.
  const subtotalReconciled =
    subtotalDiscrepancyCents === undefined || Math.abs(subtotalDiscrepancyCents) <= SUBTOTAL_TOLERANCE_CENTS;
  const isReconciled = unassignedItemIds.length === 0 && totalDiscrepancyCents === 0 && subtotalReconciled;

  return {
    itemsSubtotalCents,
    subtotalDiscrepancyCents,
    unassignedItemIds,
    discountAllocations,
    taxAllocations,
    memberShares,
    totalDiscrepancyCents,
    isReconciled,
    warnings,
  };
}
