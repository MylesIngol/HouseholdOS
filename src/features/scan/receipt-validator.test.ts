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
