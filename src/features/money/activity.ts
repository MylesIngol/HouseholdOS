import type { ActivityEntry, Bill, Expense, Settlement } from './types';

// -----------------------------------------------------------------------------
// Derives a unified, chronological activity feed from the underlying records.
// Purely selection/ordering here — how each entry reads on screen lives in
// display.ts (`getActivitySummary`), same separation as the rest of Money.
// -----------------------------------------------------------------------------

function buildActivity(
  expenses: Expense[],
  settlements: Settlement[],
  bills: Bill[],
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  for (const expense of expenses) {
    entries.push({
      type: 'expense_added',
      id: `expense-added-${expense.id}`,
      date: expense.date,
      expense,
    });
  }

  for (const settlement of settlements) {
    entries.push({
      type: 'settlement',
      id: `settlement-${settlement.id}`,
      date: settlement.date,
      settlement,
    });
  }

  for (const bill of bills) {
    entries.push({
      type: 'bill_added',
      id: `bill-added-${bill.id}`,
      date: bill.createdAt.slice(0, 10),
      bill,
    });
    if (bill.status === 'paid' && bill.paidAt) {
      entries.push({ type: 'bill_paid', id: `bill-paid-${bill.id}`, date: bill.paidAt, bill });
    }
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export function getRecentActivity(
  expenses: Expense[],
  settlements: Settlement[],
  bills: Bill[],
  limit: number = 6,
): ActivityEntry[] {
  return buildActivity(expenses, settlements, bills).slice(0, limit);
}

/**
 * Only the expenses/settlements that actually fed the balance between these
 * two specific members — an expense a third roommate paid for, where these
 * two just happen to both be participants, doesn't affect their pairwise
 * balance and is deliberately excluded here.
 */
export function getPairActivity(
  currentUserId: string,
  otherMemberId: string,
  expenses: Expense[],
  settlements: Settlement[],
): ActivityEntry[] {
  const relevantExpenses = expenses.filter((expense) => {
    const payer = expense.paidByMemberId;
    if (payer !== currentUserId && payer !== otherMemberId) return false;
    const other = payer === currentUserId ? otherMemberId : currentUserId;
    return payer !== other && expense.participants.includes(other);
  });

  const relevantSettlements = settlements.filter(
    (settlement) =>
      (settlement.fromMemberId === currentUserId && settlement.toMemberId === otherMemberId) ||
      (settlement.fromMemberId === otherMemberId && settlement.toMemberId === currentUserId),
  );

  const entries: ActivityEntry[] = [
    ...relevantExpenses.map((expense) => ({
      type: 'expense_added' as const,
      id: `expense-added-${expense.id}`,
      date: expense.date,
      expense,
    })),
    ...relevantSettlements.map((settlement) => ({
      type: 'settlement' as const,
      id: `settlement-${settlement.id}`,
      date: settlement.date,
      settlement,
    })),
  ];

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}
