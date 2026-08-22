import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateReceipt } from './receipt-validator.ts';

test('accepts a well-formed receipt with all optional fields present', () => {
  const result = validateReceipt({
    merchantName: 'Trader Joe\'s',
    purchaseDate: '2026-08-01',
    subtotalCents: 1500,
    taxCents: 120,
    discountCents: 0,
    totalCents: 1620,
    items: [
      {
        rawText: '2 BANANAS 0.69/LB',
        cleanedName: 'Bananas',
        quantity: 2,
        unitPriceCents: 69,
        totalPriceCents: 138,
        category: 'produce',
        isLikelyFood: true,
        barcode: '4011',
        confidence: 0.92,
      },
    ],
    warnings: ['Handwriting near the top was hard to read.'],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.merchantName, 'Trader Joe\'s');
  assert.equal(result.receipt.purchaseDate, '2026-08-01');
  assert.equal(result.receipt.totalCents, 1620);
  assert.equal(result.receipt.items.length, 1);
  assert.equal(result.receipt.items[0]?.cleanedName, 'Bananas');
  assert.deepEqual(result.receipt.warnings, ['Handwriting near the top was hard to read.']);
});

test('accepts a minimal receipt with only the required fields', () => {
  const result = validateReceipt({
    totalCents: 500,
    items: [{ rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500 }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.merchantName, undefined);
  assert.equal(result.receipt.purchaseDate, undefined);
  assert.equal(result.receipt.items.length, 1);
});

test('rejects a response that is not an object', () => {
  const result = validateReceipt('not an object');
  assert.equal(result.ok, false);
});

test('rejects a response with no totalCents', () => {
  const result = validateReceipt({ items: [{ rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500 }] });
  assert.equal(result.ok, false);
});

test('rejects a response where totalCents is zero or negative', () => {
  const zero = validateReceipt({
    totalCents: 0,
    items: [{ rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500 }],
  });
  assert.equal(zero.ok, false);

  const negative = validateReceipt({
    totalCents: -100,
    items: [{ rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500 }],
  });
  assert.equal(negative.ok, false);
});

test('rejects a response where totalCents is not an integer', () => {
  const result = validateReceipt({
    totalCents: 19.99,
    items: [{ rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500 }],
  });
  assert.equal(result.ok, false);
});

test('rejects a response with no items array', () => {
  const result = validateReceipt({ totalCents: 500 });
  assert.equal(result.ok, false);
});

test('drops an item missing a usable name and keeps the rest', () => {
  const result = validateReceipt({
    totalCents: 1000,
    items: [
      { rawText: '', cleanedName: '', totalPriceCents: 500 },
      { rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500 },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.items.length, 1);
  assert.equal(result.receipt.items[0]?.cleanedName, 'Milk');
  assert.equal(result.receipt.warnings.length, 1);
});

test('falls back to rawText for cleanedName when cleanedName is missing', () => {
  const result = validateReceipt({
    totalCents: 500,
    items: [{ rawText: 'MILK 2%', totalPriceCents: 500 }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.items[0]?.cleanedName, 'MILK 2%');
});

test('drops an item with a missing or invalid totalPriceCents and keeps the rest', () => {
  const result = validateReceipt({
    totalCents: 1000,
    items: [
      { rawText: 'BAD', cleanedName: 'Bad', totalPriceCents: -5 },
      { rawText: 'ALSO BAD', cleanedName: 'Also Bad', totalPriceCents: 19.99 },
      { rawText: 'MISSING', cleanedName: 'Missing' },
      { rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500 },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.items.length, 1);
  assert.equal(result.receipt.items[0]?.cleanedName, 'Milk');
  assert.equal(result.receipt.warnings.length, 3);
});

test('drops a non-object item entry and keeps the rest', () => {
  const result = validateReceipt({
    totalCents: 500,
    items: ['not an object', { rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500 }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.items.length, 1);
});

test('fails the whole receipt when every item is dropped', () => {
  const result = validateReceipt({
    totalCents: 500,
    items: [{ rawText: '', cleanedName: '', totalPriceCents: 500 }],
  });
  assert.equal(result.ok, false);
});

test('ignores an invalid purchaseDate but keeps the rest of the receipt, with a warning', () => {
  const result = validateReceipt({
    totalCents: 500,
    purchaseDate: 'not a date',
    items: [{ rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500 }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.purchaseDate, undefined);
  assert.equal(result.receipt.warnings.some((w) => w.includes('purchase date')), true);
});

test('accepts a valid ISO purchaseDate', () => {
  const result = validateReceipt({
    totalCents: 500,
    purchaseDate: '2026-08-09',
    items: [{ rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500 }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.purchaseDate, '2026-08-09');
});

test('drops a barcode that does not match the expected digit pattern', () => {
  const result = validateReceipt({
    totalCents: 500,
    items: [
      { rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500, barcode: 'not-a-barcode' },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.items[0]?.barcode, undefined);
});

test('keeps a valid numeric barcode', () => {
  const result = validateReceipt({
    totalCents: 500,
    items: [{ rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500, barcode: '041570014735' }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.items[0]?.barcode, '041570014735');
});

test('ignores an out-of-range confidence value', () => {
  const result = validateReceipt({
    totalCents: 500,
    items: [{ rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500, confidence: 1.5 }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.items[0]?.confidence, undefined);
});

test('ignores a non-positive quantity', () => {
  const result = validateReceipt({
    totalCents: 500,
    items: [{ rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500, quantity: 0 }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.items[0]?.quantity, undefined);
});

test('collects string entries from a top-level warnings array', () => {
  const result = validateReceipt({
    totalCents: 500,
    items: [{ rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500 }],
    warnings: ['Receipt was slightly blurry.', 42, null],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.receipt.warnings, ['Receipt was slightly blurry.']);
});

// Regression fixture for the exact H Mart receipt that surfaced the
// "Checkout Bag Tax became an ordinary item" bug:
//   GREEN ONION          $0.99
//   BF TOP BLADE        $13.24
//   BF TOP BLADE        $17.24
//   Checkout Bag Tax     $0.15
//   TAX                   $0.47
//   BALANCE              $32.09
// The model correctly inferred subtotalCents=3147 (0.99+13.24+17.24), but
// without this sanitization, "Checkout Bag Tax" would remain in items,
// inflating the items-subtotal to 3162 and tripping the reconciliation's
// subtotal-discrepancy check.
test('H Mart receipt: folds Checkout Bag Tax into tax and drops it as an item, reconciling exactly', () => {
  const result = validateReceipt({
    merchantName: 'H Mart',
    subtotalCents: 3147,
    // The model already correctly folded the printed "TAX $0.47" line into
    // this top-level field (it was never emitted as an items[] entry) —
    // the bug was specifically "Checkout Bag Tax" leaking into items
    // despite taxCents being read correctly.
    taxCents: 47,
    discountCents: 0,
    totalCents: 3209,
    items: [
      { rawText: 'GREEN ONION', cleanedName: 'Green Onion', totalPriceCents: 99 },
      { rawText: 'BF TOP BLADE', cleanedName: 'Beef Top Blade', totalPriceCents: 1324 },
      { rawText: 'BF TOP BLADE', cleanedName: 'Beef Top Blade', totalPriceCents: 1724 },
      { rawText: 'Checkout Bag Tax', cleanedName: 'Checkout Bag Tax', totalPriceCents: 15 },
      { rawText: 'BALANCE', cleanedName: 'Balance', totalPriceCents: 3209 },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.receipt.items.length, 3);
  assert.deepEqual(
    result.receipt.items.map((item) => [item.cleanedName, item.totalPriceCents]),
    [
      ['Green Onion', 99],
      ['Beef Top Blade', 1324],
      ['Beef Top Blade', 1724],
    ],
  );

  const itemsSubtotal = result.receipt.items.reduce((sum, item) => sum + item.totalPriceCents, 0);
  assert.equal(itemsSubtotal, 3147);
  assert.equal(result.receipt.subtotalCents, 3147);
  // 47 (printed TAX, already in taxCents) + 15 (Checkout Bag Tax, folded in
  // because it was mis-emitted as an item) = 62.
  assert.equal(result.receipt.taxCents, 62);
  assert.equal(result.receipt.discountCents, 0);
  assert.equal(result.receipt.totalCents, 3209);
});

test('is conservative: products merely containing "bag" are kept as items', () => {
  const result = validateReceipt({
    totalCents: 1000,
    items: [
      { rawText: 'BAG OF CHIPS', cleanedName: 'Bag of Chips', totalPriceCents: 399 },
      { rawText: 'SANDWICH BAGS', cleanedName: 'Sandwich Bags', totalPriceCents: 299 },
      { rawText: 'TRASH BAGS', cleanedName: 'Trash Bags', totalPriceCents: 302 },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.items.length, 3);
  assert.deepEqual(
    result.receipt.items.map((item) => item.cleanedName),
    ['Bag of Chips', 'Sandwich Bags', 'Trash Bags'],
  );
  assert.equal(result.receipt.taxCents, undefined);
});

test('drops summary and payment lines without folding them into tax', () => {
  const result = validateReceipt({
    totalCents: 1000,
    taxCents: 80,
    items: [
      { rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500 },
      { rawText: 'SUBTOTAL', cleanedName: 'Subtotal', totalPriceCents: 500 },
      { rawText: 'BALANCE', cleanedName: 'Balance', totalPriceCents: 1000 },
      { rawText: 'VISA', cleanedName: 'Visa', totalPriceCents: 1000 },
      { rawText: 'CHANGE DUE', cleanedName: 'Change Due', totalPriceCents: 0 },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.items.length, 1);
  assert.equal(result.receipt.items[0]?.cleanedName, 'Milk');
  // Unchanged — summary/payment lines are dropped, not folded into tax.
  assert.equal(result.receipt.taxCents, 80);
});

test('folds a standalone Bag Fee line into taxCents when there was no prior taxCents', () => {
  const result = validateReceipt({
    totalCents: 1010,
    items: [
      { rawText: 'MILK', cleanedName: 'Milk', totalPriceCents: 500 },
      { rawText: 'BREAD', cleanedName: 'Bread', totalPriceCents: 500 },
      { rawText: 'BAG FEE', cleanedName: 'Bag Fee', totalPriceCents: 10 },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.items.length, 2);
  assert.equal(result.receipt.taxCents, 10);
});

test('fails the whole receipt when every item is a receipt-level line', () => {
  const result = validateReceipt({
    totalCents: 500,
    items: [
      { rawText: 'TAX', cleanedName: 'Tax', totalPriceCents: 40 },
      { rawText: 'SUBTOTAL', cleanedName: 'Subtotal', totalPriceCents: 460 },
    ],
  });
  assert.equal(result.ok, false);
});
