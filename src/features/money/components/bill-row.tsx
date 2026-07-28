import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Row } from '@/components/ui/row';
import { Spacing } from '@/constants/theme';
import { formatCentsAsCurrency, formatDueDateLabel } from '@/features/money/display';
import { useMoneyStore } from '@/features/money/store';
import type { Bill } from '@/features/money/types';
import { useTheme } from '@/hooks/use-theme';

type BillRowProps = {
  bill: Bill;
  /** Tapping the row (outside the Mark paid link) opens it for editing — only ever called for upcoming bills, so this is always safe. */
  onPress?: () => void;
};

/** An upcoming bill with a one-tap "Mark paid" — the only place a bill's debt gets created, guarded so tapping it twice can't duplicate anything. */
export function BillRow({ bill, onPress }: BillRowProps) {
  const theme = useTheme();
  const members = useMoneyStore((state) => state.members);
  const markBillPaid = useMoneyStore((state) => state.markBillPaid);
  const currentUser = members.find((member) => member.isCurrentUser);

  function handleMarkPaid() {
    const paidByMemberId = bill.responsibleMemberId ?? currentUser?.id;
    if (!paidByMemberId) return;
    markBillPaid(bill.id, paidByMemberId);
  }

  return (
    <Row
      title={bill.name}
      subtitle={formatDueDateLabel(bill.dueDate)}
      onPress={onPress}
      trailing={
        <View style={styles.trailing}>
          <ThemedText type="smallBold">{formatCentsAsCurrency(bill.amountCents)}</ThemedText>
          <Pressable onPress={handleMarkPaid} hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              Mark paid
            </ThemedText>
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  trailing: {
    alignItems: 'flex-end',
    gap: Spacing.half,
  },
});
