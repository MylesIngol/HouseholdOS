import assert from 'node:assert/strict';
import test from 'node:test';

import { addDays, addMonthsClamped, getNextDueDate } from './recurrence.ts';

test('daily recurrence advances by exactly one day', () => {
  assert.equal(addDays('2026-07-27', 1), '2026-07-28');
  assert.equal(getNextDueDate('2026-07-27', 'daily'), '2026-07-28');
});

test('weekly recurrence advances by exactly seven days', () => {
  assert.equal(addDays('2026-07-27', 7), '2026-08-03');
  assert.equal(getNextDueDate('2026-07-27', 'weekly'), '2026-08-03');
});

test('monthly recurrence keeps the same day of month in a normal case', () => {
  assert.equal(addMonthsClamped('2026-07-05', 1), '2026-08-05');
  assert.equal(getNextDueDate('2026-07-05', 'monthly'), '2026-08-05');
});

test('monthly recurrence clamps across a short month (Jan 31 -> Feb 28)', () => {
  assert.equal(addMonthsClamped('2027-01-31', 1), '2027-02-28');
});

test('monthly recurrence clamps across a leap-year February (Jan 31 -> Feb 29)', () => {
  assert.equal(addMonthsClamped('2028-01-31', 1), '2028-02-29');
});

test('monthly recurrence clamps across a 30-day month (Mar 31 -> Apr 30)', () => {
  assert.equal(addMonthsClamped('2026-03-31', 1), '2026-04-30');
});

test('monthly recurrence crosses a year boundary correctly', () => {
  assert.equal(addMonthsClamped('2026-12-15', 1), '2027-01-15');
  assert.equal(getNextDueDate('2026-12-05', 'monthly'), '2027-01-05');
});

test('one-time chores never produce a next due date', () => {
  assert.equal(getNextDueDate('2026-07-27', 'none'), undefined);
});

test('a chore with no due date produces no next due date regardless of recurrence', () => {
  assert.equal(getNextDueDate(undefined, 'weekly'), undefined);
});
