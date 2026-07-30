import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Spacing } from '@/constants/theme';
import { useHouseholdMembers, useMyHousehold } from '@/features/household/queries';
import { formatActivityDateLabel, formatCentsAsCurrency } from '@/features/money/display';
import { useExpenses } from '@/features/money/queries';
import type { Bill, Expense } from '@/features/money/types';

type BillDetailSheetProps = {
  visible: boolean;
  onClose: () => void;
  bill: Bill | undefined;
  onViewLinkedExpense: (expense: Expense) => void;
};

/**
 * A paid bill is read-only — its actual financial effect lives entirely in
 * its linked Expense, so this sheet never offers Edit/Delete on the Bill
 * itself. Correcting a paid bill's amount, payer, or split happens by
 * editing (or deleting) that Expense, one tap away via "View linked expense".
 */
export function BillDetailSheet({
  visible,
  onClose,
  bill,
  onViewLinkedExpense,
}: BillDetailSheetProps) {
  const { data: household } = useMyHousehold();
  const { data: members = [] } = useHouseholdMembers(household?.id);
  const { data: expenses = [] } = useExpenses();

  if (!bill) return null;

  const linkedExpense = bill.linkedExpenseId
    ? expenses.find((expense) => expense.id === bill.linkedExpenseId)
    : undefined;
  const payer = linkedExpense
    ? members.find((member) => member.id === linkedExpense.paidByMemberId)
    : undefined;
  const payerLabel = payer ? (payer.isCurrentUser ? 'You' : payer.name) : undefined;

  function handleViewLinkedExpense() {
    if (!linkedExpense) return;
    onClose();
    onViewLinkedExpense(linkedExpense);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ThemedText type="label" themeColor="muted">
        {bill.name}
      </ThemedText>
      <ThemedText type="stat">{formatCentsAsCurrency(bill.amountCents)}</ThemedText>
      <ThemedText type="small" themeColor="success">
        Paid{bill.paidAt ? ` · ${formatActivityDateLabel(bill.paidAt)}` : ''}
      </ThemedText>
      {payerLabel && (
        <ThemedText type="small" themeColor="textSecondary">
          Paid by {payerLabel}
        </ThemedText>
      )}
      {bill.notes && (
        <ThemedText type="small" themeColor="textSecondary">
          {bill.notes}
        </ThemedText>
      )}

      <View style={styles.field}>
        <ThemedText type="small" themeColor="muted">
          This bill is read-only now that it&apos;s paid. To correct the amount, payer, or split,
          edit the linked expense below.
        </ThemedText>
        {linkedExpense && (
          <Pressable onPress={handleViewLinkedExpense} hitSlop={8}>
            <ThemedText type="linkPrimary">View linked expense</ThemedText>
          </Pressable>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
});
