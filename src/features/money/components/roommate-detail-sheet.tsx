import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Radii, Spacing } from '@/constants/theme';
import { getPairActivity } from '@/features/money/activity';
import { getNetBetweenMembers } from '@/features/money/balances';
import { ActivityRow } from '@/features/money/components/activity-row';
import { formatBalanceLine, formatCentsAsCurrency } from '@/features/money/display';
import {
  centsToDollarsInput,
  dollarsToCents,
  isValidSettlementAmount,
} from '@/features/money/money-math';
import { useHouseholdStore } from '@/features/household/store';
import type { HouseholdMember } from '@/features/household/types';
import { useMoneyStore } from '@/features/money/store';
import type { ActivityEntry } from '@/features/money/types';
import { useTheme } from '@/hooks/use-theme';

type RoommateDetailSheetProps = {
  visible: boolean;
  onClose: () => void;
  member: HouseholdMember | undefined;
  /** Tapping an activity entry closes this sheet and hands the entry back up — money-screen.tsx owns the expense/bill/settlement detail sheets, this one doesn't. */
  onSelectActivity: (entry: ActivityEntry) => void;
};

/**
 * Tapping a roommate balance opens this: the activity that produced it, plus
 * a Settle Up control. HouseholdOS never moves money — this only records
 * that a payment happened, which is why the copy always says "Record",
 * never "Pay" or "Send".
 */
export function RoommateDetailSheet({
  visible,
  onClose,
  member,
  onSelectActivity,
}: RoommateDetailSheetProps) {
  const theme = useTheme();
  const members = useHouseholdStore((state) => state.members);
  const expenses = useMoneyStore((state) => state.expenses);
  const settlements = useMoneyStore((state) => state.settlements);
  const recordSettlement = useMoneyStore((state) => state.recordSettlement);
  const currentUser = members.find((candidate) => candidate.isCurrentUser);

  const [amountText, setAmountText] = useState('');

  const netCents =
    member && currentUser
      ? getNetBetweenMembers(currentUser.id, member.id, expenses, settlements)
      : 0;

  useEffect(() => {
    if (!visible) return;
    setAmountText(netCents !== 0 ? centsToDollarsInput(Math.abs(netCents)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, member?.id]);

  if (!member || !currentUser) return null;

  const activity = getPairActivity(currentUser.id, member.id, expenses, settlements);
  const memberName = member.name;

  // netCents > 0: member owes you, so a settlement flows member -> you.
  // netCents < 0: you owe member, so a settlement flows you -> member.
  const fromMemberId = netCents > 0 ? member.id : currentUser.id;
  const toMemberId = netCents > 0 ? currentUser.id : member.id;
  const payerLabel = netCents > 0 ? memberName : 'You';
  const payeeLabel = netCents > 0 ? 'you' : memberName;

  const amountCents = dollarsToCents(amountText) ?? 0;
  const canRecord =
    netCents !== 0 && isValidSettlementAmount(amountCents, fromMemberId, toMemberId);

  function handleRecordPayment() {
    if (!canRecord) return;
    recordSettlement({
      fromMemberId,
      toMemberId,
      amountCents,
      date: new Date().toISOString().slice(0, 10),
    });
    onClose();
  }

  function handleActivityPress(entry: ActivityEntry) {
    onClose();
    onSelectActivity(entry);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ThemedText type="label" themeColor="muted">
        {memberName}
      </ThemedText>
      <ThemedText
        type="stat"
        themeColor={netCents === 0 ? 'muted' : netCents > 0 ? 'success' : 'danger'}
      >
        {netCents === 0 ? 'Settled up' : formatCentsAsCurrency(Math.abs(netCents))}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {formatBalanceLine(memberName, netCents)}
      </ThemedText>

      {netCents !== 0 && (
        <View style={styles.settleSection}>
          <ThemedText type="label" themeColor="muted">
            Settle up
          </ThemedText>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            placeholder="$0.00"
            placeholderTextColor={theme.muted}
            keyboardType="decimal-pad"
            style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {`Record that ${payerLabel} paid ${payeeLabel} ${formatCentsAsCurrency(amountCents)}`}
          </ThemedText>
          <PrimaryButton
            label="Record Payment"
            onPress={canRecord ? handleRecordPayment : undefined}
            style={canRecord ? undefined : styles.disabled}
          />
        </View>
      )}

      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          Activity
        </ThemedText>
        {activity.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <Card>
            {activity.map((entry) => (
              <ActivityRow
                key={entry.id}
                entry={entry}
                members={members}
                currentUserId={currentUser.id}
                onPress={() => handleActivityPress(entry)}
              />
            ))}
          </Card>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  settleSection: {
    gap: Spacing.two,
  },
  input: {
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 20,
  },
  disabled: {
    opacity: 0.5,
  },
});
