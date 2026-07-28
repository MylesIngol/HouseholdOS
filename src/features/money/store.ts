import { create } from 'zustand';

import { applyMarkBillPaid, buildNextOccurrence } from './bill-payment';
import { isValidSettlementAmount, splitEqualCents } from './money-math';
import {
  bills as seedBills,
  expenses as seedExpenses,
  householdMembers as seedMembers,
  recurringBills as seedRecurringBills,
  settlements as seedSettlements,
} from './mock-data';
import type {
  Bill,
  Expense,
  HouseholdMember,
  NewBillInput,
  NewExpenseInput,
  NewSettlementInput,
  RecurringBillTemplate,
  Settlement,
} from './types';

// Local-only state for this milestone — kept as the single source of truth
// for Money domain data (not TanStack Query — nothing async to cache yet),
// same discipline as Kitchen's store: only source records live here, every
// balance/total/activity view is a pure selector call over this data, so
// nothing derived can drift out of sync with what actually happened.

function generateId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

type MoneyState = {
  members: HouseholdMember[];
  expenses: Expense[];
  settlements: Settlement[];
  bills: Bill[];
  recurringBills: RecurringBillTemplate[];

  addExpense: (input: NewExpenseInput) => void;
  updateExpense: (
    id: string,
    patch: Partial<Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>>,
  ) => void;
  /**
   * Permanently removes an expense. If a paid Bill's debt came from this
   * exact expense (`linkedExpenseId`), that Bill reverts to 'upcoming' and
   * its `paidAt`/`linkedExpenseId` are cleared — a paid bill's debt must
   * never be left pointing at an expense that no longer exists. The caller
   * (the UI) is responsible for warning about this before calling.
   */
  deleteExpense: (id: string) => void;

  recordSettlement: (input: NewSettlementInput) => void;
  /** No editing — a settlement is simple enough that "delete and re-record via Settle Up" is the correction path. */
  deleteSettlement: (id: string) => void;

  addBill: (input: NewBillInput) => void;
  /** Paid bills are read-only history — this silently no-ops if the bill isn't 'upcoming', mirroring the `markBillPaid` guard pattern. */
  updateBill: (
    id: string,
    patch: Partial<
      Pick<
        Bill,
        | 'name'
        | 'amountCents'
        | 'dueDate'
        | 'responsibleMemberId'
        | 'participants'
        | 'splitMode'
        | 'shares'
        | 'notes'
      >
    >,
  ) => void;
  /** Paid bills can't be deleted through this action (see `updateBill`) — a paid bill's history lives in its linked Expense instead. */
  deleteBill: (id: string) => void;
  /**
   * The only place a Bill's debt is ever created. Guarded by `status` —
   * calling this again on an already-paid bill is a no-op, so the action
   * can never be repeated into duplicate debt.
   */
  markBillPaid: (billId: string, paidByMemberId: string, date?: string) => void;
  /**
   * Manually generates the next month's occurrence for a recurring bill.
   * No scheduler/background job — this only runs when a user asks for it
   * (e.g. after the current occurrence is paid).
   */
  generateNextOccurrence: (recurringBillId: string) => void;
};

export const useMoneyStore = create<MoneyState>((set, get) => ({
  members: seedMembers,
  expenses: seedExpenses,
  settlements: seedSettlements,
  bills: seedBills,
  recurringBills: seedRecurringBills,

  addExpense: (input) => {
    const description = input.description.trim();
    if (!description || input.amountCents <= 0 || input.participants.length === 0) return;

    const now = new Date().toISOString();
    const expense: Expense = {
      id: generateId(),
      description,
      amountCents: input.amountCents,
      category: input.category,
      paidByMemberId: input.paidByMemberId,
      date: input.date,
      participants: input.participants,
      splitMode: input.splitMode,
      shares: input.shares,
      notes: input.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({ expenses: [expense, ...state.expenses] }));
  },

  updateExpense: (id, patch) => {
    set((state) => ({
      expenses: state.expenses.map((expense) =>
        expense.id === id ? { ...expense, ...patch, updatedAt: new Date().toISOString() } : expense,
      ),
    }));
  },

  deleteExpense: (id) => {
    set((state) => {
      const linkedBill = state.bills.find((bill) => bill.linkedExpenseId === id);
      const now = new Date().toISOString();
      return {
        expenses: state.expenses.filter((expense) => expense.id !== id),
        bills: linkedBill
          ? state.bills.map((bill) =>
              bill.id === linkedBill.id
                ? {
                    ...bill,
                    status: 'upcoming',
                    paidAt: undefined,
                    linkedExpenseId: undefined,
                    updatedAt: now,
                  }
                : bill,
            )
          : state.bills,
      };
    });
  },

  recordSettlement: (input) => {
    if (!isValidSettlementAmount(input.amountCents, input.fromMemberId, input.toMemberId)) return;

    const now = new Date().toISOString();
    const settlement: Settlement = {
      id: generateId(),
      fromMemberId: input.fromMemberId,
      toMemberId: input.toMemberId,
      amountCents: input.amountCents,
      date: input.date,
      note: input.note?.trim() || undefined,
      createdAt: now,
    };
    set((state) => ({ settlements: [settlement, ...state.settlements] }));
  },

  deleteSettlement: (id) => {
    set((state) => ({
      settlements: state.settlements.filter((settlement) => settlement.id !== id),
    }));
  },

  addBill: (input) => {
    const name = input.name.trim();
    if (!name || input.amountCents <= 0 || input.participants.length === 0 || !input.dueDate)
      return;

    const now = new Date().toISOString();

    set((state) => {
      let recurringBillId: string | undefined;
      let recurringBills = state.recurringBills;

      if (input.recurrence === 'monthly') {
        const dayOfMonth = new Date(`${input.dueDate}T00:00:00`).getDate();
        const template: RecurringBillTemplate = {
          id: generateId(),
          name,
          amountCents: input.amountCents,
          dayOfMonth,
          responsibleMemberId: input.responsibleMemberId,
          participants: input.participants,
          splitMode: input.splitMode,
          notes: input.notes?.trim() || undefined,
          createdAt: now,
        };
        recurringBillId = template.id;
        recurringBills = [template, ...recurringBills];
      }

      const bill: Bill = {
        id: generateId(),
        name,
        amountCents: input.amountCents,
        dueDate: input.dueDate,
        responsibleMemberId: input.responsibleMemberId,
        participants: input.participants,
        splitMode: input.splitMode,
        shares: input.shares,
        recurrence: input.recurrence,
        recurringBillId,
        status: 'upcoming',
        notes: input.notes?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };

      return { recurringBills, bills: [bill, ...state.bills] };
    });
  },

  updateBill: (id, patch) => {
    const bill = get().bills.find((candidate) => candidate.id === id);
    if (!bill || bill.status !== 'upcoming') return; // paid bills are read-only

    set((state) => ({
      bills: state.bills.map((candidate) =>
        candidate.id === id
          ? { ...candidate, ...patch, updatedAt: new Date().toISOString() }
          : candidate,
      ),
    }));
  },

  deleteBill: (id) => {
    const bill = get().bills.find((candidate) => candidate.id === id);
    if (!bill || bill.status !== 'upcoming') return; // a paid bill's history lives in its linked Expense

    set((state) => ({ bills: state.bills.filter((candidate) => candidate.id !== id) }));
  },

  markBillPaid: (billId, paidByMemberId, date) => {
    const now = new Date().toISOString();
    const paymentDate = date ?? now.slice(0, 10);
    const result = applyMarkBillPaid(
      get().bills,
      get().expenses,
      billId,
      paidByMemberId,
      paymentDate,
      generateId(),
      now,
    );
    if (!result) return; // already paid (or bill not found) — no-op, never duplicates debt

    set({ bills: result.bills, expenses: result.expenses });
  },

  generateNextOccurrence: (recurringBillId) => {
    const template = get().recurringBills.find((candidate) => candidate.id === recurringBillId);
    if (!template) return;

    // Recurring occurrences always regenerate as an equal split, even if an
    // individual month's bill was later edited to a custom split — the
    // template intentionally doesn't carry custom per-member amounts
    // forward, keeping the recurrence model minimal for this milestone.
    const occurrences = get().bills.filter((bill) => bill.recurringBillId === recurringBillId);
    const shares = splitEqualCents(template.amountCents, template.participants);
    const bill = buildNextOccurrence(
      template,
      occurrences,
      shares,
      generateId(),
      new Date().toISOString(),
    );

    set((state) => ({ bills: [bill, ...state.bills] }));
  },
}));
