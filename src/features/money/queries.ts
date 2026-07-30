import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useMyHousehold } from '@/features/household/queries';

import {
  createBill,
  createExpense,
  deleteBill,
  deleteExpense,
  deleteSettlement,
  fetchBills,
  fetchExpenses,
  fetchSettlements,
  generateNextBillOccurrence,
  markBillPaid,
  recordSettlement,
  updateBill,
  updateExpense,
} from './api';
import { moneyKeys } from './query-keys';
import type { NewBillInput, NewExpenseInput, NewSettlementInput } from './types';

export function useExpenses() {
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useQuery({
    queryKey: moneyKeys.expenses(householdId),
    queryFn: () => fetchExpenses(householdId!),
    enabled: !!householdId,
  });
}

export function useSettlements() {
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useQuery({
    queryKey: moneyKeys.settlements(householdId),
    queryFn: () => fetchSettlements(householdId!),
    enabled: !!householdId,
  });
}

export function useBills() {
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useQuery({
    queryKey: moneyKeys.bills(householdId),
    queryFn: () => fetchBills(householdId!),
    enabled: !!householdId,
  });
}

function useInvalidateMoney() {
  const queryClient = useQueryClient();
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return {
    expenses: () => queryClient.invalidateQueries({ queryKey: moneyKeys.expenses(householdId) }),
    settlements: () =>
      queryClient.invalidateQueries({ queryKey: moneyKeys.settlements(householdId) }),
    bills: () => queryClient.invalidateQueries({ queryKey: moneyKeys.bills(householdId) }),
  };
}

export function useAddExpense() {
  const { data: household } = useMyHousehold();
  const householdId = household?.id;
  const invalidate = useInvalidateMoney();

  return useMutation({
    mutationFn: (input: NewExpenseInput) => createExpense(householdId!, input),
    onSuccess: invalidate.expenses,
  });
}

export function useUpdateExpense() {
  const invalidate = useInvalidateMoney();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: NewExpenseInput }) =>
      updateExpense(id, input),
    onSuccess: invalidate.expenses,
  });
}

export function useDeleteExpense() {
  const invalidate = useInvalidateMoney();

  return useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => {
      invalidate.expenses();
      // Deleting an expense that marked a bill paid atomically reopens it.
      invalidate.bills();
    },
  });
}

export function useRecordSettlement() {
  const { data: household } = useMyHousehold();
  const householdId = household?.id;
  const invalidate = useInvalidateMoney();

  return useMutation({
    mutationFn: (input: NewSettlementInput) => recordSettlement(householdId!, input),
    onSuccess: invalidate.settlements,
  });
}

export function useDeleteSettlement() {
  const invalidate = useInvalidateMoney();

  return useMutation({
    mutationFn: (id: string) => deleteSettlement(id),
    onSuccess: invalidate.settlements,
  });
}

export function useAddBill() {
  const { data: household } = useMyHousehold();
  const householdId = household?.id;
  const invalidate = useInvalidateMoney();

  return useMutation({
    mutationFn: (input: NewBillInput) => createBill(householdId!, input),
    onSuccess: invalidate.bills,
  });
}

export function useUpdateBill() {
  const invalidate = useInvalidateMoney();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: NewBillInput }) => updateBill(id, input),
    onSuccess: invalidate.bills,
  });
}

export function useDeleteBill() {
  const invalidate = useInvalidateMoney();

  return useMutation({
    mutationFn: (id: string) => deleteBill(id),
    onSuccess: invalidate.bills,
  });
}

export function useMarkBillPaid() {
  const invalidate = useInvalidateMoney();

  return useMutation({
    mutationFn: ({
      billId,
      paidByMemberId,
      date,
    }: {
      billId: string;
      paidByMemberId: string;
      date?: string;
    }) => markBillPaid(billId, paidByMemberId, date),
    onSuccess: () => {
      invalidate.bills();
      invalidate.expenses();
    },
  });
}

export function useGenerateNextBillOccurrence() {
  const invalidate = useInvalidateMoney();

  return useMutation({
    mutationFn: (recurringBillId: string) => generateNextBillOccurrence(recurringBillId),
    onSuccess: invalidate.bills,
  });
}
