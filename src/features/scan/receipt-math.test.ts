import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allocateProportionalCents, reconcileReceiptShares } from './receipt-math.ts';

function shareFor(shares: { memberId: string; amountCents: number }[], memberId: string): number | undefined {
  return shares.find((s) => s.memberId === memberId)?.amountCents;
}

test('allocateProportionalCents: exact even division leaves no remainder to distribute', () => {
  const result = allocateProportionalCents(100, [
    { memberId: 'a', amountCents: 1 },
    { memberId: 'b', amountCents: 1 },
  ]);
  assert.equal(shareFor(result, 'a'), 50);
  assert.equal(shareFor(result, 'b'), 50);
});

test('allocateProportionalCents: the larger fractional remainder wins the leftover cent', () => {
  // 100 split 1:2 -> 33.333 / 66.667, floors to 33/66 (99), 1 cent left over
  // goes to b, which has the larger fractional remainder.
  const result = allocateProportionalCents(100, [
    { memberId: 'a', amountCents: 1 },
    { memberId: 'b', amountCents: 2 },
  ]);
  assert.equal(shareFor(result, 'a'), 33);
  assert.equal(shareFor(result, 'b'), 67);
});

test('allocateProportionalCents: tied fractional remainders break by ascending memberId, input order independent', () => {
  // 10 split evenly 4 ways -> 2.5 each, floors to 2 (8 total), 2 cents left
  // over. All four remainders are tied, so the two lowest memberIds win.
  const result = allocateProportionalCents(10, [
    { memberId: 'c', amountCents: 1 },
    { memberId: 'a', amountCents: 1 },
    { memberId: 'd', amountCents: 1 },
    { memberId: 'b', amountCents: 1 },
  ]);
  assert.equal(shareFor(result, 'a'), 3);
  assert.equal(shareFor(result, 'b'), 3);
  assert.equal(shareFor(result, 'c'), 2);
  assert.equal(shareFor(result, 'd'), 2);
});

test('allocateProportionalCents: zero total allocates zero to everyone', () => {
  const result = allocateProportionalCents(0, [
    { memberId: 'a', amountCents: 5 },
    { memberId: 'b', amountCents: 5 },
  ]);
  assert.deepEqual(
    result.sort((x, y) => x.memberId.localeCompare(y.memberId)),
    [
      { memberId: 'a', amountCents: 0 },
      { memberId: 'b', amountCents: 0 },
    ],
  );
});

test('allocateProportionalCents: all-zero weights fall back to zero for everyone rather than throwing', () => {
  const result = allocateProportionalCents(500, [
    { memberId: 'a', amountCents: 0 },
    { memberId: 'b', amountCents: 0 },
  ]);
  assert.equal(shareFor(result, 'a'), 0);
  assert.equal(shareFor(result, 'b'), 0);
});

test('allocateProportionalCents: empty weights list returns an empty result', () => {
  assert.deepEqual(allocateProportionalCents(100, []), []);
});

test('reconcileReceiptShares: single item, single assignee, no tax or discount reconciles exactly', () => {
  const result = reconcileReceiptShares({
    items: [{ itemId: 'item-1', totalPriceCents: 1000, assignedMemberIds: ['a'] }],
    totalCents: 1000,
  });

  assert.equal(result.itemsSubtotalCents, 1000);
  assert.equal(result.subtotalDiscrepancyCents, undefined);
  assert.deepEqual(result.unassignedItemIds, []);
  assert.deepEqual(result.memberShares, [{ memberId: 'a', amountCents: 1000 }]);
  assert.equal(result.totalDiscrepancyCents, 0);
  assert.equal(result.isReconciled, true);
  assert.deepEqual(result.warnings, []);
});

test('reconcileReceiptShares: multiple items accumulate per member, discount and tax allocate correctly', () => {
  // item1 -> a only (5000), item2 -> b only (3000), item3 -> split a/b (2000
  // -> 1000/1000). Pretax: a=6000, b=4000.
  // discount 1000 proportional to pretax (6000:4000) -> a=600, b=400.
  // post-discount: a=5400, b=3600. tax 900 proportional to THAT (still
  // 6:4 ratio) -> a=540, b=360.
  // final: a = 6000-600+540 = 5940, b = 4000-400+360 = 3960. Sum = 9900.
  const result = reconcileReceiptShares({
    items: [
      { itemId: 'item-1', totalPriceCents: 5000, assignedMemberIds: ['a'] },
      { itemId: 'item-2', totalPriceCents: 3000, assignedMemberIds: ['b'] },
      { itemId: 'item-3', totalPriceCents: 2000, assignedMemberIds: ['a', 'b'] },
    ],
    totalCents: 9900,
    subtotalCents: 10000,
    discountCents: 1000,
    taxCents: 900,
  });

  assert.equal(result.itemsSubtotalCents, 10000);
  assert.equal(result.subtotalDiscrepancyCents, 0);
  assert.deepEqual(result.unassignedItemIds, []);
  assert.equal(shareFor(result.discountAllocations, 'a'), 600);
  assert.equal(shareFor(result.discountAllocations, 'b'), 400);
  assert.equal(shareFor(result.taxAllocations, 'a'), 540);
  assert.equal(shareFor(result.taxAllocations, 'b'), 360);
  assert.equal(shareFor(result.memberShares, 'a'), 5940);
  assert.equal(shareFor(result.memberShares, 'b'), 3960);
  assert.equal(result.totalDiscrepancyCents, 0);
  assert.equal(result.isReconciled, true);
  assert.deepEqual(result.warnings, []);
});

test('reconcileReceiptShares: an unassigned item blocks reconciliation even when totals still happen to match', () => {
  const result = reconcileReceiptShares({
    items: [
      { itemId: 'item-1', totalPriceCents: 5000, assignedMemberIds: ['a'] },
      { itemId: 'item-2', totalPriceCents: 3000, assignedMemberIds: ['b'] },
      { itemId: 'item-3', totalPriceCents: 2000, assignedMemberIds: [] },
    ],
    totalCents: 8000, // exactly the sum of the two assigned items -- no dollar-amount discrepancy
  });

  assert.deepEqual(result.unassignedItemIds, ['item-3']);
  assert.equal(result.totalDiscrepancyCents, 0);
  assert.equal(result.isReconciled, false);
  assert.ok(result.warnings.some((w) => w.includes('1 item has no one assigned')));
});

test('reconcileReceiptShares: a subtotal mismatch beyond tolerance blocks reconciliation even when the total balances', () => {
  const result = reconcileReceiptShares({
    items: [{ itemId: 'item-1', totalPriceCents: 1000, assignedMemberIds: ['a'] }],
    totalCents: 1000,
    subtotalCents: 1050, // 50 cents off the actual item sum
  });

  assert.equal(result.subtotalDiscrepancyCents, -50);
  assert.equal(result.totalDiscrepancyCents, 0);
  assert.equal(result.isReconciled, false);
  assert.ok(result.warnings.some((w) => w.toLowerCase().includes('subtotal')));
});

test('reconcileReceiptShares: a 1-cent subtotal discrepancy is within tolerance and does not block', () => {
  const result = reconcileReceiptShares({
    items: [{ itemId: 'item-1', totalPriceCents: 1000, assignedMemberIds: ['a'] }],
    totalCents: 1000,
    subtotalCents: 1001,
  });

  assert.equal(result.subtotalDiscrepancyCents, -1);
  assert.equal(result.isReconciled, true);
  assert.deepEqual(result.warnings, []);
});

test('reconcileReceiptShares: a total that does not match the assigned shares blocks reconciliation and is never silently absorbed', () => {
  const result = reconcileReceiptShares({
    items: [{ itemId: 'item-1', totalPriceCents: 1000, assignedMemberIds: ['a'] }],
    totalCents: 1200, // receipt claims more than the items actually add up to
  });

  assert.equal(result.totalDiscrepancyCents, -200);
  assert.equal(result.isReconciled, false);
  assert.ok(result.warnings.some((w) => w.includes('under the receipt total')));
});
