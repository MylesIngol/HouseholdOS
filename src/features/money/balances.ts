import type { Bill, Expense, HouseholdMember, Settlement } from './types';

// -----------------------------------------------------------------------------
// Pure balance engine. No React/React Native imports — exercised directly by
// `node --experimental-strip-types --test`. Balances are always *derived*
// from expenses + settlements here, never stored, so they can't drift out of
// sync with the transaction history that produced them.
//
// Debt simplification is intentionally limited to netting each *pair* of
// roommates against each other (Bella owes you $35, you owe Bella $20 ->
// "Bella owes you $15"). Nothing here restructures unrelated debts (A owes
// B, B owes C never becomes A owes C) — that's out of scope for this
// milestone by design.
// -----------------------------------------------------------------------------

export type RoommateBalance = {
  memberId: string;
  name: string;
  initials?: string;
  /** Positive: this member owes the current user. Negative: the current user owes this member. Zero: settled (only present when there's history). */
  netCents: number;
};

export type MoneySummary = {
  youOweCents: number;
  youAreOwedCents: number;
};

type Ledger = Map<string, Map<string, number>>;

/**
 * A directed ledger of "who owes whom, from raw transaction history."
 * Expense shares add debt from participant -> payer. Settlements record a
 * payment by adding a same-size *reverse* entry (payee -> payer), which is
 * what nets the original debt down when the two are combined in
 * `netBetween` — the raw entries themselves are never decremented in place,
 * so gross history is still inspectable if needed later.
 */
function buildLedger(expenses: Expense[], settlements: Settlement[]): Ledger {
  const ledger: Ledger = new Map();

  function add(oweFrom: string, oweTo: string, cents: number) {
    if (oweFrom === oweTo || cents <= 0) return;
    if (!ledger.has(oweFrom)) ledger.set(oweFrom, new Map());
    const row = ledger.get(oweFrom)!;
    row.set(oweTo, (row.get(oweTo) ?? 0) + cents);
  }

  for (const expense of expenses) {
    for (const share of expense.shares) {
      if (share.memberId === expense.paidByMemberId) continue; // the payer's own share is never debt to themselves
      add(share.memberId, expense.paidByMemberId, share.amountCents);
    }
  }

  for (const settlement of settlements) {
    add(settlement.toMemberId, settlement.fromMemberId, settlement.amountCents);
  }

  return ledger;
}

/** Positive: `a` owes `b`. Negative: `b` owes `a`. */
function netBetween(ledger: Ledger, a: string, b: string): number {
  const aOwesB = ledger.get(a)?.get(b) ?? 0;
  const bOwesA = ledger.get(b)?.get(a) ?? 0;
  return aOwesB - bOwesA;
}

function hasHistory(ledger: Ledger, a: string, b: string): boolean {
  return (ledger.get(a)?.get(b) ?? 0) !== 0 || (ledger.get(b)?.get(a) ?? 0) !== 0;
}

/**
 * One entry per other household member who has ever had a shared expense or
 * settlement with `currentUserId` — members with zero relationship history
 * are omitted entirely. A member whose net has settled to exactly zero is
 * still included with `netCents: 0` ("Settled up") rather than dropped,
 * so they don't appear to vanish after paying off a balance.
 */
export function getRoommateBalances(
  currentUserId: string,
  members: HouseholdMember[],
  expenses: Expense[],
  settlements: Settlement[],
): RoommateBalance[] {
  const ledger = buildLedger(expenses, settlements);

  return members
    .filter((member) => member.id !== currentUserId)
    .filter((member) => hasHistory(ledger, member.id, currentUserId))
    .map((member) => ({
      memberId: member.id,
      name: member.name,
      initials: member.initials,
      netCents: netBetween(ledger, member.id, currentUserId),
    }));
}

/**
 * The main Money screen should read balances through here, not through
 * `getRoommateBalances` directly. Non-settled balances always show; settled
 * ("$0, but there's history") relationships are capped so a household with
 * several fully-settled roommates doesn't clutter the main view with rows
 * that carry no actionable information.
 */
export function getVisibleRoommateBalances(
  balances: RoommateBalance[],
  maxSettled: number = 1,
): RoommateBalance[] {
  const active = balances
    .filter((balance) => balance.netCents !== 0)
    .sort((a, b) => Math.abs(b.netCents) - Math.abs(a.netCents));
  const settled = balances.filter((balance) => balance.netCents === 0);

  return [...active, ...settled.slice(0, maxSettled)];
}

export function getMoneySummary(
  currentUserId: string,
  members: HouseholdMember[],
  expenses: Expense[],
  settlements: Settlement[],
): MoneySummary {
  const balances = getRoommateBalances(currentUserId, members, expenses, settlements);

  return balances.reduce<MoneySummary>(
    (summary, balance) => {
      if (balance.netCents > 0) {
        return { ...summary, youAreOwedCents: summary.youAreOwedCents + balance.netCents };
      }
      if (balance.netCents < 0) {
        return { ...summary, youOweCents: summary.youOweCents + Math.abs(balance.netCents) };
      }
      return summary;
    },
    { youOweCents: 0, youAreOwedCents: 0 },
  );
}

/** Bills not yet paid, soonest due first — shared by Home and the Money screen so "upcoming" is defined in exactly one place. */
export function getUpcomingBills(bills: Bill[]): Bill[] {
  return bills
    .filter((bill) => bill.status === 'upcoming')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function getCurrentMember(members: HouseholdMember[]): HouseholdMember | undefined {
  return members.find((member) => member.isCurrentUser);
}

/** The amount currently owed between two specific members — what a Settle Up flow should default its input to. Positive: `otherMemberId` owes `currentUserId`. */
export function getNetBetweenMembers(
  currentUserId: string,
  otherMemberId: string,
  expenses: Expense[],
  settlements: Settlement[],
): number {
  const ledger = buildLedger(expenses, settlements);
  return netBetween(ledger, otherMemberId, currentUserId);
}
