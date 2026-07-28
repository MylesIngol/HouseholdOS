import assert from 'node:assert/strict';
import test from 'node:test';

import {
  centsToDollarsInput,
  dollarsToCents,
  isValidCustomSplit,
  isValidSettlementAmount,
  resolveShares,
  splitEqualCents,
  sumShareCents,
} from './money-math.ts';

test('equal $100 split among 4 people divides evenly with no remainder', () => {
  const shares = splitEqualCents(10000, ['a', 'b', 'c', 'd']);
  assert.deepEqual(
    shares.map((s) => s.amountCents),
    [2500, 2500, 2500, 2500],
  );
  assert.equal(sumShareCents(shares), 10000);
});

test('$10 split among 3 people distributes the remainder cent and still totals exactly $10.00', () => {
  const shares = splitEqualCents(1000, ['a', 'b', 'c']);
  assert.deepEqual(
    shares.map((s) => s.amountCents),
    [334, 333, 333],
  );
  assert.equal(sumShareCents(shares), 1000);
});

test('equal split with a single participant assigns them the whole amount', () => {
  const shares = splitEqualCents(999, ['a']);
  assert.deepEqual(shares, [{ memberId: 'a', amountCents: 999 }]);
});

test('equal split with zero participants returns no shares', () => {
  assert.deepEqual(splitEqualCents(500, []), []);
});

test('valid custom split: shares sum exactly to the total', () => {
  const valid = isValidCustomSplit(
    10000,
    ['a', 'b', 'c'],
    [
      { memberId: 'a', amountCents: 5000 },
      { memberId: 'b', amountCents: 3000 },
      { memberId: 'c', amountCents: 2000 },
    ],
  );
  assert.equal(valid, true);
});

test('invalid custom split: shares do not sum to the total', () => {
  const invalid = isValidCustomSplit(
    10000,
    ['a', 'b', 'c'],
    [
      { memberId: 'a', amountCents: 5000 },
      { memberId: 'b', amountCents: 3000 },
      { memberId: 'c', amountCents: 2500 },
    ],
  );
  assert.equal(invalid, false);
});

test('invalid custom split: missing a participant', () => {
  const invalid = isValidCustomSplit(
    10000,
    ['a', 'b', 'c'],
    [
      { memberId: 'a', amountCents: 7000 },
      { memberId: 'b', amountCents: 3000 },
    ],
  );
  assert.equal(invalid, false);
});

test('invalid custom split: negative share', () => {
  const invalid = isValidCustomSplit(
    1000,
    ['a', 'b'],
    [
      { memberId: 'a', amountCents: 1500 },
      { memberId: 'b', amountCents: -500 },
    ],
  );
  assert.equal(invalid, false);
});

test('resolveShares equal mode matches splitEqualCents', () => {
  const shares = resolveShares('equal', 1000, ['a', 'b', 'c']);
  assert.equal(sumShareCents(shares), 1000);
});

test('resolveShares custom mode uses the provided per-member amounts', () => {
  const shares = resolveShares(
    'custom',
    1000,
    ['a', 'b'],
    [
      { memberId: 'a', amountCents: 600 },
      { memberId: 'b', amountCents: 400 },
    ],
  );
  assert.deepEqual(shares, [
    { memberId: 'a', amountCents: 600 },
    { memberId: 'b', amountCents: 400 },
  ]);
});

test('dollarsToCents parses whole dollars, decimals, and rejects garbage', () => {
  assert.equal(dollarsToCents('12'), 1200);
  assert.equal(dollarsToCents('12.4'), 1240);
  assert.equal(dollarsToCents('12.40'), 1240);
  assert.equal(dollarsToCents('0.01'), 1);
  assert.equal(dollarsToCents(''), undefined);
  assert.equal(dollarsToCents('abc'), undefined);
  assert.equal(dollarsToCents('12.999'), undefined);
  assert.equal(dollarsToCents('-5'), undefined);
});

test('centsToDollarsInput round-trips with dollarsToCents', () => {
  assert.equal(centsToDollarsInput(1240), '12.40');
  assert.equal(dollarsToCents(centsToDollarsInput(1240)), 1240);
});

test('settlement amount must be positive and not to yourself', () => {
  assert.equal(isValidSettlementAmount(2500, 'a', 'b'), true);
  assert.equal(isValidSettlementAmount(0, 'a', 'b'), false);
  assert.equal(isValidSettlementAmount(-100, 'a', 'b'), false);
  assert.equal(isValidSettlementAmount(2500, 'a', 'a'), false);
});
