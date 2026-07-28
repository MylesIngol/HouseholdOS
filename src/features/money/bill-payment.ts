import type { Bill, Expense, ParticipantShare, RecurringBillTemplate } from './types';

// -----------------------------------------------------------------------------
// Pure state-transition logic for the two Bill actions that need careful
// guarding: marking a bill paid (must create debt exactly once) and
// generating a recurring bill's next occurrence. Kept free of Zustand and any
// runtime import of sibling modules so it's directly exercised by
// `node --experimental-strip-types --test`, same as money-math.ts/balances.ts.
// store.ts is a thin wrapper that calls these and applies the result via `set`.
// -----------------------------------------------------------------------------

export type MarkBillPaidResult = { bills: Bill[]; expenses: Expense[] };

/**
 * Returns the updated bills/expenses after marking `billId` paid, or
 * `undefined` if the bill doesn't exist or is already paid — that guard is
 * what makes the action idempotent: calling it again on an already-paid bill
 * is a no-op and can never create a second Expense for the same bill.
 */
export function applyMarkBillPaid(
  bills: Bill[],
  expenses: Expense[],
  billId: string,
  paidByMemberId: string,
  paymentDate: string,
  newExpenseId: string,
  now: string,
): MarkBillPaidResult | undefined {
  const bill = bills.find((candidate) => candidate.id === billId);
  if (!bill || bill.status === 'paid') return undefined;

  const expense: Expense = {
    id: newExpenseId,
    description: bill.name,
    amountCents: bill.amountCents,
    category: 'bill',
    paidByMemberId,
    date: paymentDate,
    participants: bill.participants,
    splitMode: bill.splitMode,
    shares: bill.shares,
    notes: bill.notes,
    createdAt: now,
    updatedAt: now,
  };

  const updatedBills = bills.map((candidate) =>
    candidate.id === billId
      ? {
          ...candidate,
          status: 'paid' as const,
          paidAt: paymentDate,
          linkedExpenseId: expense.id,
          updatedAt: now,
        }
      : candidate,
  );

  return { bills: updatedBills, expenses: [expense, ...expenses] };
}

/** Next month, same day-of-month as the template — based on the latest known occurrence if one exists, otherwise today. */
export function computeNextOccurrenceDueDate(
  latestDueDate: string | undefined,
  dayOfMonth: number,
  referenceDate: Date = new Date(),
): string {
  const base = latestDueDate ? new Date(`${latestDueDate}T00:00:00`) : referenceDate;
  return new Date(base.getFullYear(), base.getMonth() + 1, dayOfMonth).toISOString().slice(0, 10);
}

export function buildNextOccurrence(
  template: RecurringBillTemplate,
  existingOccurrences: Bill[],
  shares: ParticipantShare[],
  newBillId: string,
  now: string,
): Bill {
  const latest = existingOccurrences.reduce<Bill | undefined>(
    (latestBill, bill) => (!latestBill || bill.dueDate > latestBill.dueDate ? bill : latestBill),
    undefined,
  );

  return {
    id: newBillId,
    name: template.name,
    amountCents: template.amountCents,
    dueDate: computeNextOccurrenceDueDate(latest?.dueDate, template.dayOfMonth),
    responsibleMemberId: template.responsibleMemberId,
    participants: template.participants,
    splitMode: 'equal',
    shares,
    recurrence: 'monthly',
    recurringBillId: template.id,
    status: 'upcoming',
    notes: template.notes,
    createdAt: now,
    updatedAt: now,
  };
}
