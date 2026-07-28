import type {
  ActivityEntry,
  Bill,
  BillRecurrence,
  Expense,
  ExpenseCategory,
  HouseholdMember,
  SplitMode,
} from './types';

// -----------------------------------------------------------------------------
// Formatting/presentation helpers — kept separate from money-math.ts and
// balances.ts (which only calculate) so calculation logic never has to think
// about currency symbols, locales, or human-readable copy.
// -----------------------------------------------------------------------------

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function formatCentsAsCurrency(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

export function getMemberInitials(member: HouseholdMember): string {
  if (member.initials) return member.initials;
  return member.name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function getCategoryLabel(category: ExpenseCategory): string {
  switch (category) {
    case 'groceries':
      return 'Groceries';
    case 'household_supplies':
      return 'Household Supplies';
    case 'utilities':
      return 'Utilities';
    case 'dining':
      return 'Dining';
    case 'transportation':
      return 'Transportation';
    case 'bill':
      return 'Bill';
    case 'other':
      return 'Other';
  }
}

export function getSplitModeLabel(mode: SplitMode): string {
  return mode === 'equal' ? 'Split equally' : 'Custom split';
}

export function getRecurrenceLabel(recurrence: BillRecurrence): string {
  return recurrence === 'monthly' ? 'Monthly' : 'One-time';
}

/** "Bella owes you $15" / "You owe Karyn $20" / "Settled up" — the one line that should make a balance instantly readable. */
export function formatBalanceLine(memberName: string, netCents: number): string {
  if (netCents === 0) return 'Settled up';
  if (netCents > 0) return `${memberName} owes you`;
  return `You owe ${memberName}`;
}

function daysBetween(targetIso: string, referenceDate: Date): number {
  const target = new Date(`${targetIso}T00:00:00`);
  const reference = new Date(referenceDate);
  reference.setHours(0, 0, 0, 0);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - reference.getTime()) / msPerDay);
}

function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** For bills: "Due today", "Due tomorrow", "Due in 4 days", "Overdue", or a short date once it's far enough out. */
export function formatDueDateLabel(dueDate: string, referenceDate: Date = new Date()): string {
  const days = daysBetween(dueDate, referenceDate);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 6) return `Due in ${days} days`;
  return `Due ${formatShortDate(dueDate)}`;
}

/** For activity/history: "Today", "Yesterday", "3 days ago", or a short date for anything older. */
export function formatActivityDateLabel(date: string, referenceDate: Date = new Date()): string {
  const days = daysBetween(date, referenceDate);
  if (days === 0) return 'Today';
  if (days === -1) return 'Yesterday';
  if (days < -1 && days >= -6) return `${Math.abs(days)} days ago`;
  return formatShortDate(date);
}

export function getExpenseSplitSummary(expense: Expense, members: HouseholdMember[]): string {
  const payer = members.find((member) => member.id === expense.paidByMemberId);
  const payerLabel = payer?.isCurrentUser ? 'You' : (payer?.name ?? 'Someone');
  const count = expense.participants.length;
  return `Paid by ${payerLabel} · Split ${count === 1 ? 'with no one else' : `between ${count} people`}`;
}

export function getBillStatusLabel(bill: Bill): string {
  return bill.status === 'paid' ? 'Paid' : formatDueDateLabel(bill.dueDate);
}

/**
 * Deleting an expense always affects balances; if it's also the expense that
 * marked a bill paid, deleting it reverts that bill to unpaid too — this
 * warning has to say so explicitly before the user confirms, never silently.
 */
export function getDeleteExpenseWarning(expense: Expense, bills: Bill[]): string {
  const linkedBill = bills.find((bill) => bill.linkedExpenseId === expense.id);
  if (linkedBill) {
    return `Deleting this expense will remove its effect from roommate balances and mark the ${linkedBill.name} bill as unpaid again.`;
  }
  return "Deleting this expense will remove its effect from roommate balances. This can't be undone.";
}

export type ActivityTone = 'neutral' | 'success' | 'warning';

export type ActivitySummary = {
  title: string;
  /** An amount for most entries; a due-date label for a freshly-added bill, since there's no debt yet to show an amount for. */
  subtitle: string;
  tone: ActivityTone;
};

function memberLabel(memberId: string, members: HouseholdMember[], currentUserId: string): string {
  if (memberId === currentUserId) return 'You';
  return members.find((member) => member.id === memberId)?.name ?? 'Someone';
}

/** Human-readable, human-friendly copy for one activity entry — never exposes IDs or internal fields. */
export function getActivitySummary(
  entry: ActivityEntry,
  members: HouseholdMember[],
  currentUserId: string,
): ActivitySummary {
  switch (entry.type) {
    case 'expense_added': {
      const payer = memberLabel(entry.expense.paidByMemberId, members, currentUserId);
      return {
        title: `${payer} added ${entry.expense.description}`,
        subtitle: formatCentsAsCurrency(entry.expense.amountCents),
        tone: 'neutral',
      };
    }
    case 'settlement': {
      const isPaymentToYou = entry.settlement.toMemberId === currentUserId;
      const other = memberLabel(
        isPaymentToYou ? entry.settlement.fromMemberId : entry.settlement.toMemberId,
        members,
        currentUserId,
      );
      return {
        title: isPaymentToYou ? `${other} paid you` : `You paid ${other}`,
        subtitle: formatCentsAsCurrency(entry.settlement.amountCents),
        tone: 'success',
      };
    }
    case 'bill_added':
      return {
        title: `${entry.bill.name} bill added`,
        subtitle: formatDueDateLabel(entry.bill.dueDate),
        tone: 'neutral',
      };
    case 'bill_paid':
      return {
        title: `${entry.bill.name} marked paid`,
        subtitle: formatCentsAsCurrency(entry.bill.amountCents),
        tone: 'success',
      };
  }
}
