import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMoneySummary,
  getNetBetweenMembers,
  getRoommateBalances,
  getVisibleRoommateBalances,
} from './balances.ts';
import { splitEqualCents } from './money-math.ts';
import type { HouseholdMember } from '@/features/household/types';
import type { Expense, Settlement } from './types.ts';

const members: HouseholdMember[] = [
  { id: 'you', userId: 'you', name: 'You', isCurrentUser: true },
  { id: 'bella', userId: 'bella', name: 'Bella', isCurrentUser: false },
  { id: 'karyn', userId: 'karyn', name: 'Karyn', isCurrentUser: false },
  { id: 'nat', userId: 'nat', name: 'Nat', isCurrentUser: false },
];

let nextId = 1;
function makeExpense(
  overrides: Partial<Expense> & Pick<Expense, 'amountCents' | 'paidByMemberId' | 'participants'>,
): Expense {
  const shares = overrides.shares ?? splitEqualCents(overrides.amountCents, overrides.participants);
  return {
    id: `expense-${nextId++}`,
    description: 'Test expense',
    category: 'other',
    date: '2026-07-01',
    splitMode: 'equal',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
    shares,
  };
}

function makeSettlement(
  overrides: Partial<Settlement> & Pick<Settlement, 'fromMemberId' | 'toMemberId' | 'amountCents'>,
): Settlement {
  return {
    id: `settlement-${nextId++}`,
    date: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

test('payer participating in their own expense does not owe themselves', () => {
  // $100 paid by "you", split equally among you/bella/karyn/nat ($25 each).
  const expense = makeExpense({
    amountCents: 10000,
    paidByMemberId: 'you',
    participants: ['you', 'bella', 'karyn', 'nat'],
  });
  const balances = getRoommateBalances('you', members, [expense], []);

  const bella = balances.find((b) => b.memberId === 'bella');
  assert.equal(bella?.netCents, 2500);
  // "you" never appears as a balance relative to yourself.
  assert.ok(!balances.some((b) => b.memberId === 'you'));
});

test('payer excluded from the split: payer is owed the full amount by participants, split among them', () => {
  // "you" fronts $30 entirely for bella + karyn (not a participant yourself).
  const expense = makeExpense({
    amountCents: 3000,
    paidByMemberId: 'you',
    participants: ['bella', 'karyn'],
  });
  const balances = getRoommateBalances('you', members, [expense], []);

  assert.equal(balances.find((b) => b.memberId === 'bella')?.netCents, 1500);
  assert.equal(balances.find((b) => b.memberId === 'karyn')?.netCents, 1500);
});

test('selected-roommate split only creates debt for the selected participants', () => {
  const expense = makeExpense({
    amountCents: 2000,
    paidByMemberId: 'you',
    participants: ['you', 'nat'],
  });
  const balances = getRoommateBalances('you', members, [expense], []);

  assert.equal(balances.find((b) => b.memberId === 'nat')?.netCents, 1000);
  // Bella and Karyn weren't participants, so they have no relationship at all yet.
  assert.ok(!balances.some((b) => b.memberId === 'bella'));
  assert.ok(!balances.some((b) => b.memberId === 'karyn'));
});

test('reciprocal debts net correctly: Myles owes Bella $20, Bella owes Myles $35 -> Bella owes Myles $15', () => {
  const expenseFromBella = makeExpense({
    amountCents: 4000,
    paidByMemberId: 'bella',
    participants: ['you', 'bella'],
  }); // you owe bella $20 from this expense
  const expenseFromYou = makeExpense({
    amountCents: 7000,
    paidByMemberId: 'you',
    participants: ['you', 'bella'],
  }); // bella owes you $35 from this expense

  const net = getNetBetweenMembers('you', 'bella', [expenseFromBella, expenseFromYou], []);
  assert.equal(net, 1500); // positive: bella owes you $15
});

test('partial settlement reduces but does not zero out the balance', () => {
  const expense = makeExpense({
    amountCents: 4000,
    paidByMemberId: 'you',
    participants: ['you', 'bella'],
  }); // bella owes you $20
  const settlement = makeSettlement({
    fromMemberId: 'bella',
    toMemberId: 'you',
    amountCents: 1200,
  }); // bella pays $12

  const net = getNetBetweenMembers('you', 'bella', [expense], [settlement]);
  assert.equal(net, 800); // bella still owes you $8
});

test('full settlement zeroes the balance but the relationship still has history ("Settled up")', () => {
  const expense = makeExpense({
    amountCents: 4000,
    paidByMemberId: 'you',
    participants: ['you', 'bella'],
  }); // bella owes you $20
  const settlement = makeSettlement({
    fromMemberId: 'bella',
    toMemberId: 'you',
    amountCents: 2000,
  });

  const net = getNetBetweenMembers('you', 'bella', [expense], [settlement]);
  assert.equal(net, 0);

  const balances = getRoommateBalances('you', members, [expense], [settlement]);
  const bella = balances.find((b) => b.memberId === 'bella');
  assert.ok(bella, 'bella should still appear with history even at $0');
  assert.equal(bella?.netCents, 0);
});

test('members with zero shared history are omitted from balances entirely', () => {
  const balances = getRoommateBalances('you', members, [], []);
  assert.deepEqual(balances, []);
});

test('getMoneySummary sums positive and negative nets separately', () => {
  const bellaOwesYou = makeExpense({
    amountCents: 3000,
    paidByMemberId: 'you',
    participants: ['you', 'bella'],
  }); // bella owes you $15
  const youOweKaryn = makeExpense({
    amountCents: 4000,
    paidByMemberId: 'karyn',
    participants: ['you', 'karyn'],
  }); // you owe karyn $20

  const summary = getMoneySummary('you', members, [bellaOwesYou, youOweKaryn], []);
  assert.equal(summary.youAreOwedCents, 1500);
  assert.equal(summary.youOweCents, 2000);
});

test('getVisibleRoommateBalances keeps all non-zero balances and caps settled-up rows', () => {
  const balances = [
    { memberId: 'a', name: 'A', netCents: 1500 },
    { memberId: 'b', name: 'B', netCents: -500 },
    { memberId: 'c', name: 'C', netCents: 0 },
    { memberId: 'd', name: 'D', netCents: 0 },
    { memberId: 'e', name: 'E', netCents: 0 },
  ];

  const visible = getVisibleRoommateBalances(balances, 1);
  assert.equal(visible.filter((b) => b.netCents !== 0).length, 2);
  assert.equal(visible.filter((b) => b.netCents === 0).length, 1);
  assert.equal(visible.length, 3);
});
