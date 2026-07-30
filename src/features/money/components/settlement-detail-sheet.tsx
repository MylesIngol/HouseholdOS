import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Spacing } from '@/constants/theme';
import { useHouseholdStore } from '@/features/household/store';
import { formatActivityDateLabel, formatCentsAsCurrency } from '@/features/money/display';
import { useMoneyStore } from '@/features/money/store';
import type { Settlement } from '@/features/money/types';
import { useTheme } from '@/hooks/use-theme';

type SettlementDetailSheetProps = {
  visible: boolean;
  onClose: () => void;
  settlement: Settlement | undefined;
};

/**
 * Read-only view of a recorded payment, plus delete. No in-place editing —
 * a settlement is a single amount, so "delete this one, then record the
 * correct one via Settle Up" is exactly as fast as an edit form would be.
 */
export function SettlementDetailSheet({
  visible,
  onClose,
  settlement,
}: SettlementDetailSheetProps) {
  const theme = useTheme();
  const members = useHouseholdStore((state) => state.members);
  const deleteSettlement = useMoneyStore((state) => state.deleteSettlement);
  const currentUser = members.find((member) => member.isCurrentUser);

  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setConfirmOpen(false);
  }, [visible, settlement?.id]);

  if (!settlement || !currentUser) return null;

  const fromLabel =
    settlement.fromMemberId === currentUser.id
      ? 'You'
      : (members.find((member) => member.id === settlement.fromMemberId)?.name ?? 'Someone');
  const toLabel =
    settlement.toMemberId === currentUser.id
      ? 'you'
      : (members.find((member) => member.id === settlement.toMemberId)?.name ?? 'someone');

  function handleDelete() {
    if (!settlement) return;
    deleteSettlement(settlement.id);
    onClose();
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ThemedText type="label" themeColor="muted">
        Payment
      </ThemedText>
      <ThemedText type="stat">{formatCentsAsCurrency(settlement.amountCents)}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {`${fromLabel} paid ${toLabel}`}
      </ThemedText>
      <ThemedText type="small" themeColor="muted">
        {formatActivityDateLabel(settlement.date)}
      </ThemedText>
      {settlement.note && (
        <ThemedText type="small" themeColor="textSecondary">
          {settlement.note}
        </ThemedText>
      )}

      {!confirmOpen ? (
        <Pressable onPress={() => setConfirmOpen(true)} hitSlop={8}>
          <ThemedText type="linkPrimary" style={{ color: theme.danger }}>
            Delete this payment record
          </ThemedText>
        </Pressable>
      ) : (
        <View style={styles.field}>
          <ThemedText type="small" themeColor="textSecondary">
            Deleting this will restore the balance it reduced. You can re-record it via Settle Up if
            the amount was wrong.
          </ThemedText>
          <View style={styles.confirmActions}>
            <Pressable onPress={() => setConfirmOpen(false)} hitSlop={8}>
              <ThemedText type="small" themeColor="muted">
                Cancel
              </ThemedText>
            </Pressable>
            <Pressable onPress={handleDelete} hitSlop={8}>
              <ThemedText type="linkPrimary" style={{ color: theme.danger }}>
                Delete
              </ThemedText>
            </Pressable>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
});
