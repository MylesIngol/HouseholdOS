import assert from 'node:assert/strict';
import { test } from 'node:test';

import { receiptToReviewItems, reconcileReviewSession } from './receipt-review-session.ts';
import type { Receipt } from './receipt-validator.ts';

function fixtureReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    merchantName: 'Trader Joe\'s',
    purchaseDate: '2026-08-01',
    totalCents: 1000,
    items: [
      { rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500, isLikelyFood: true },
      { rawText: 'SPONGE', cleanedName: 'Sponge', totalPriceCents: 500, isLikelyFood: false },
    ],
    warnings: [],
    ...overrides,
  };
}

test('receiptToReviewItems: defaults every item to Everyone (all provided member ids)', () => {
  const items = receiptToReviewItems(fixtureReceipt(), ['a', 'b', 'c']);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0]?.assignedMemberIds, ['a', 'b', 'c']);
  assert.deepEqual(items[1]?.assignedMemberIds, ['a', 'b', 'c']);
});

test('receiptToReviewItems: addToKitchen defaults from isLikelyFood, true when unknown', () => {
  const receipt = fixtureReceipt({
    items: [
      { rawText: 'A', cleanedName: 'A', totalPriceCents: 100, isLikelyFood: true },
      { rawText: 'B', cleanedName: 'B', totalPriceCents: 100, isLikelyFood: false },
      { rawText: 'C', cleanedName: 'C', totalPriceCents: 100 },
    ],
  });
  const items = receiptToReviewItems(receipt, ['a']);
  assert.equal(items[0]?.addToKitchen, true);
  assert.equal(items[1]?.addToKitchen, false);
  assert.equal(items[2]?.addToKitchen, true);
});

test('receiptToReviewItems: assigning distinct ids per item, in receipt order', () => {
  const items = receiptToReviewItems(fixtureReceipt(), ['a']);
  assert.equal(items[0]?.id, 'item-0');
  assert.equal(items[1]?.id, 'item-1');
});

test('reconcileReviewSession: delegates straight to receipt-math with the review items mapped in', () => {
  const receipt = fixtureReceipt({ totalCents: 1000 });
  const items = receiptToReviewItems(receipt, ['a', 'b']);
  const result = reconcileReviewSession(receipt, items);

  // Both items split evenly a/b: 500/2 + 500/2 = 500 each -> sums to 1000.
  assert.equal(result.isReconciled, true);
  assert.equal(result.totalDiscrepancyCents, 0);
});

test('reconcileReviewSession: an item edited down to $0 and unassigned is excluded from the math cleanly', () => {
  const receipt = fixtureReceipt({ totalCents: 500 });
  const items = receiptToReviewItems(receipt, ['a']);
  items[1] = { ...items[1]!, totalPriceCents: 0, assignedMemberIds: [] };

  const result = reconcileReviewSession(receipt, items);
  // item-1 is unassigned, which alone should block reconciliation even
  // though it now contributes $0 either way.
  assert.deepEqual(result.unassignedItemIds, ['item-1']);
  assert.equal(result.isReconciled, false);
});
