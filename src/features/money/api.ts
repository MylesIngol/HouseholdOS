import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

import type {
  Bill,
  BillRecurrence,
  BillStatus,
  Expense,
  ExpenseCategory,
  NewBillInput,
  NewExpenseInput,
  NewSettlementInput,
  ParticipantShare,
  Settlement,
  SplitMode,
} from './types';

// Thin wrappers over supabase-js, same shape as kitchen/tasks's api.ts.
// Every write here goes through a SECURITY DEFINER RPC (parent + shares must
// commit atomically — plan section 5) except settlements, which is plain
// RLS-gated CRUD on a single table with no child rows.

type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
type ExpenseShareRow = Database['public']['Tables']['expense_shares']['Row'];
type SettlementRow = Database['public']['Tables']['settlements']['Row'];
type BillRow = Database['public']['Tables']['bills']['Row'];
type BillShareRow = Database['public']['Tables']['bill_shares']['Row'];

function toShareJson(shares: ParticipantShare[]) {
  return shares.map((share) => ({ member_id: share.memberId, amount_cents: share.amountCents }));
}

function mapExpense(row: ExpenseRow, shareRows: ExpenseShareRow[]): Expense {
  const shares: ParticipantShare[] = shareRows.map((share) => ({
    memberId: share.household_member_id,
    amountCents: share.amount_cents,
  }));
  return {
    id: row.id,
    description: row.description,
    amountCents: row.amount_cents,
    category: row.category as ExpenseCategory,
    paidByMemberId: row.paid_by_household_member_id,
    date: row.date,
    participants: shares.map((share) => share.memberId),
    splitMode: row.split_mode as SplitMode,
    shares,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSettlement(row: SettlementRow): Settlement {
  return {
    id: row.id,
    fromMemberId: row.from_household_member_id,
    toMemberId: row.to_household_member_id,
    amountCents: row.amount_cents,
    date: row.date,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

function mapBill(row: BillRow, shareRows: BillShareRow[]): Bill {
  const shares: ParticipantShare[] = shareRows.map((share) => ({
    memberId: share.household_member_id,
    amountCents: share.amount_cents,
  }));
  return {
    id: row.id,
    name: row.name,
    amountCents: row.amount_cents,
    dueDate: row.due_date,
    responsibleMemberId: row.responsible_household_member_id ?? undefined,
    participants: shares.map((share) => share.memberId),
    splitMode: row.split_mode as SplitMode,
    shares,
    recurrence: row.recurrence as BillRecurrence,
    recurringBillId: row.recurring_bill_id ?? undefined,
    status: row.status as BillStatus,
    paidAt: row.paid_at ?? undefined,
    linkedExpenseId: row.linked_expense_id ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchExpenses(householdId: string): Promise<Expense[]> {
  const [expensesRes, sharesRes] = await Promise.all([
    supabase
      .from('expenses')
      .select('*')
      .eq('household_id', householdId)
      .order('date', { ascending: false }),
    supabase.from('expense_shares').select('*').eq('household_id', householdId),
  ]);

  if (expensesRes.error) throw expensesRes.error;
  if (sharesRes.error) throw sharesRes.error;

  const sharesByExpense = new Map<string, ExpenseShareRow[]>();
  for (const row of (sharesRes.data ?? []) as ExpenseShareRow[]) {
    const list = sharesByExpense.get(row.expense_id) ?? [];
    list.push(row);
    sharesByExpense.set(row.expense_id, list);
  }

  return (expensesRes.data ?? []).map((row) => mapExpense(row, sharesByExpense.get(row.id) ?? []));
}

export async function fetchSettlements(householdId: string): Promise<Settlement[]> {
  const { data, error } = await supabase
    .from('settlements')
    .select('*')
    .eq('household_id', householdId)
    .order('date', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapSettlement);
}

export async function fetchBills(householdId: string): Promise<Bill[]> {
  const [billsRes, sharesRes] = await Promise.all([
    supabase
      .from('bills')
      .select('*')
      .eq('household_id', householdId)
      .order('due_date', { ascending: true }),
    supabase.from('bill_shares').select('*').eq('household_id', householdId),
  ]);

  if (billsRes.error) throw billsRes.error;
  if (sharesRes.error) throw sharesRes.error;

  const sharesByBill = new Map<string, BillShareRow[]>();
  for (const row of (sharesRes.data ?? []) as BillShareRow[]) {
    const list = sharesByBill.get(row.bill_id) ?? [];
    list.push(row);
    sharesByBill.set(row.bill_id, list);
  }

  return (billsRes.data ?? []).map((row) => mapBill(row, sharesByBill.get(row.id) ?? []));
}

export async function createExpense(householdId: string, input: NewExpenseInput): Promise<void> {
  const { error } = await supabase.rpc('create_expense', {
    p_household_id: householdId,
    p_description: input.description.trim(),
    p_amount_cents: input.amountCents,
    p_category: input.category,
    p_paid_by_member_id: input.paidByMemberId,
    p_date: input.date,
    p_split_mode: input.splitMode,
    p_shares: toShareJson(input.shares),
    p_notes: input.notes?.trim() || null,
  });
  if (error) throw error;
}

export async function updateExpense(
  id: string,
  patch: Omit<NewExpenseInput, 'participants'>,
): Promise<void> {
  const { error } = await supabase.rpc('update_expense', {
    p_expense_id: id,
    p_description: patch.description.trim(),
    p_amount_cents: patch.amountCents,
    p_category: patch.category,
    p_paid_by_member_id: patch.paidByMemberId,
    p_date: patch.date,
    p_split_mode: patch.splitMode,
    p_shares: toShareJson(patch.shares),
    p_notes: patch.notes?.trim() || null,
  });
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_expense', { p_expense_id: id });
  if (error) throw error;
}

export async function recordSettlement(
  householdId: string,
  input: NewSettlementInput,
): Promise<void> {
  const { error } = await supabase.from('settlements').insert({
    household_id: householdId,
    from_household_member_id: input.fromMemberId,
    to_household_member_id: input.toMemberId,
    amount_cents: input.amountCents,
    date: input.date,
    note: input.note?.trim() || null,
  });
  if (error) throw error;
}

export async function deleteSettlement(id: string): Promise<void> {
  const { error } = await supabase.from('settlements').delete().eq('id', id);
  if (error) throw error;
}

export async function createBill(householdId: string, input: NewBillInput): Promise<void> {
  const { error } = await supabase.rpc('create_bill', {
    p_household_id: householdId,
    p_name: input.name.trim(),
    p_amount_cents: input.amountCents,
    p_due_date: input.dueDate,
    p_responsible_member_id: input.responsibleMemberId ?? null,
    p_split_mode: input.splitMode,
    p_shares: toShareJson(input.shares),
    p_recurrence: input.recurrence,
    p_notes: input.notes?.trim() || null,
  });
  if (error) throw error;
}

export async function updateBill(
  id: string,
  patch: Omit<NewBillInput, 'participants' | 'recurrence'>,
): Promise<void> {
  const { error } = await supabase.rpc('update_bill', {
    p_bill_id: id,
    p_name: patch.name.trim(),
    p_amount_cents: patch.amountCents,
    p_due_date: patch.dueDate,
    p_responsible_member_id: patch.responsibleMemberId ?? null,
    p_split_mode: patch.splitMode,
    p_shares: toShareJson(patch.shares),
    p_notes: patch.notes?.trim() || null,
  });
  if (error) throw error;
}

export async function deleteBill(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_bill', { p_bill_id: id });
  if (error) throw error;
}

export async function markBillPaid(
  billId: string,
  paidByMemberId: string,
  date?: string,
): Promise<void> {
  const { error } = await supabase.rpc('mark_bill_paid', {
    p_bill_id: billId,
    p_paid_by_member_id: paidByMemberId,
    p_payment_date: date ?? null,
  });
  if (error) throw error;
}

/** Not wired to any UI yet (mirrors the previous store's generateNextOccurrence, which no screen called either) — kept available for when a "generate next month's bill" action is added. */
export async function generateNextBillOccurrence(recurringBillId: string): Promise<void> {
  const { error } = await supabase.rpc('generate_next_bill_occurrence', {
    p_recurring_bill_id: recurringBillId,
  });
  if (error) throw error;
}
