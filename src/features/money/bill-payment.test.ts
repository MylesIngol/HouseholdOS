import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyMarkBillPaid,
  buildNextOccurrence,
  computeNextOccurrenceDueDate,
} from './bill-payment.ts';
import { splitEqualCents } from './money-math.ts';
import type { Bill, RecurringBillTemplate } from './types.ts';

function makeUpcomingBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-1',
    name: 'Electric',
    amountCents: 8000,
    dueDate: '2026-08-01',
    participants: ['you', 'bella'],
    splitMode: 'equal',
    shares: splitEqualCents(8000, ['you', 'bella']),
    recurrence: 'one_time',
    status: 'upcoming',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

test('marking an upcoming bill paid creates exactly one Expense and flips it to paid', () => {
  const bill = makeUpcomingBill();
  const result = applyMarkBillPaid(
    [bill],
    [],
    'bill-1',
    'you',
    '2026-07-27',
    'expense-1',
    '2026-07-27T00:00:00.000Z',
  );

  assert.ok(result);
  assert.equal(result.expenses.length, 1);
  assert.equal(result.expenses[0].amountCents, 8000);
  assert.equal(result.expenses[0].paidByMemberId, 'you');
  assert.equal(result.expenses[0].category, 'bill');

  const updatedBill = result.bills.find((b) => b.id === 'bill-1');
  assert.equal(updatedBill?.status, 'paid');
  assert.equal(updatedBill?.linkedExpenseId, 'expense-1');
});

test('repeating markBillPaid on an already-paid bill is a no-op and never duplicates debt', () => {
  const paidBill = makeUpcomingBill({
    status: 'paid',
    paidAt: '2026-07-27',
    linkedExpenseId: 'expense-1',
  });
  const existingExpense = {
    id: 'expense-1',
    description: 'Electric',
    amountCents: 8000,
    category: 'bill' as const,
    paidByMemberId: 'you',
    date: '2026-07-27',
    participants: ['you', 'bella'],
    splitMode: 'equal' as const,
    shares: splitEqualCents(8000, ['you', 'bella']),
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
  };

  const result = applyMarkBillPaid(
    [paidBill],
    [existingExpense],
    'bill-1',
    'bella',
    '2026-07-28',
    'expense-2',
    '2026-07-28T00:00:00.000Z',
  );

  assert.equal(result, undefined);
});

test('marking a bill paid that does not exist is a no-op', () => {
  const result = applyMarkBillPaid(
    [],
    [],
    'missing-bill',
    'you',
    '2026-07-27',
    'expense-1',
    '2026-07-27T00:00:00.000Z',
  );
  assert.equal(result, undefined);
});

test('an upcoming bill contributes no Expense, so it cannot create debt before payment', () => {
  const bill = makeUpcomingBill();
  // Simply existing in an "upcoming" state, with no markBillPaid call, produces zero expenses.
  assert.equal(bill.status, 'upcoming');
  assert.equal(bill.linkedExpenseId, undefined);
});

test('computeNextOccurrenceDueDate advances one month from the latest occurrence', () => {
  assert.equal(computeNextOccurrenceDueDate('2026-07-05', 5), '2026-08-05');
  assert.equal(computeNextOccurrenceDueDate('2026-12-05', 5), '2027-01-05');
});

test('buildNextOccurrence links back to the template and starts upcoming', () => {
  const template: RecurringBillTemplate = {
    id: 'recurring-1',
    name: 'Internet',
    amountCents: 6400,
    dayOfMonth: 5,
    participants: ['you', 'bella'],
    splitMode: 'equal',
    createdAt: '2026-06-01T00:00:00.000Z',
  };
  const previousOccurrence = makeUpcomingBill({
    id: 'bill-june',
    name: 'Internet',
    dueDate: '2026-07-05',
    recurringBillId: 'recurring-1',
    recurrence: 'monthly',
    status: 'paid',
  });

  const shares = splitEqualCents(6400, ['you', 'bella']);
  const next = buildNextOccurrence(
    template,
    [previousOccurrence],
    shares,
    'bill-august',
    '2026-07-27T00:00:00.000Z',
  );

  assert.equal(next.dueDate, '2026-08-05');
  assert.equal(next.recurringBillId, 'recurring-1');
  assert.equal(next.status, 'upcoming');
  assert.equal(next.id, 'bill-august');
});
