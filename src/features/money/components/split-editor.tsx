import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PillSelector } from '@/components/ui/pill-selector';
import { Radii, Spacing } from '@/constants/theme';
import { MemberMultiSelect } from '@/features/money/components/member-multi-select';
import { formatCentsAsCurrency } from '@/features/money/display';
import { dollarsToCents, splitEqualCents, sumShareCents } from '@/features/money/money-math';
import type { HouseholdMember } from '@/features/household/types';
import type { SplitMode } from '@/features/money/types';
import { useTheme } from '@/hooks/use-theme';

const SPLIT_MODE_OPTIONS: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'Equal' },
  { value: 'custom', label: 'Custom' },
];

type SplitEditorProps = {
  members: HouseholdMember[];
  totalCents: number;
  participantIds: string[];
  onChangeParticipantIds: (ids: string[]) => void;
  splitMode: SplitMode;
  onChangeSplitMode: (mode: SplitMode) => void;
  /** memberId -> raw dollar text the user typed, so partial input like "12." isn't clobbered. */
  customAmounts: Record<string, string>;
  onChangeCustomAmount: (memberId: string, text: string) => void;
};

/**
 * Shared by both the expense and bill sheets: who's splitting this, and how.
 * 'equal' always shows a live read-only preview; 'custom' shows one amount
 * field per participant plus a running total so the user can see whether it
 * reconciles with the total before saving is even attempted.
 */
export function SplitEditor({
  members,
  totalCents,
  participantIds,
  onChangeParticipantIds,
  splitMode,
  onChangeSplitMode,
  customAmounts,
  onChangeCustomAmount,
}: SplitEditorProps) {
  const theme = useTheme();
  const participants = members.filter((member) => participantIds.includes(member.id));

  const equalShares = splitMode === 'equal' ? splitEqualCents(totalCents, participantIds) : [];

  const customTotalCents = participants.reduce((sum, member) => {
    const cents = dollarsToCents(customAmounts[member.id] ?? '');
    return sum + (cents ?? 0);
  }, 0);
  const customReconciles =
    splitMode === 'custom' && customTotalCents === totalCents && totalCents > 0;

  return (
    <View style={styles.container}>
      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          Split
        </ThemedText>
        <PillSelector options={SPLIT_MODE_OPTIONS} value={splitMode} onChange={onChangeSplitMode} />
      </View>

      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          Split between
        </ThemedText>
        <MemberMultiSelect
          members={members}
          selectedIds={participantIds}
          onChange={onChangeParticipantIds}
        />
      </View>

      {participants.length === 0 ? (
        <ThemedText type="small" themeColor="muted">
          Pick at least one person to split with.
        </ThemedText>
      ) : splitMode === 'equal' ? (
        <View style={styles.previewList}>
          {participants.map((member) => {
            const share = equalShares.find((s) => s.memberId === member.id);
            return (
              <View key={member.id} style={styles.previewRow}>
                <ThemedText type="small">{member.isCurrentUser ? 'You' : member.name}</ThemedText>
                <ThemedText type="smallBold">
                  {formatCentsAsCurrency(share?.amountCents ?? 0)}
                </ThemedText>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.previewList}>
          {participants.map((member) => (
            <View key={member.id} style={styles.customRow}>
              <ThemedText type="small" style={styles.customName}>
                {member.isCurrentUser ? 'You' : member.name}
              </ThemedText>
              <TextInput
                value={customAmounts[member.id] ?? ''}
                onChangeText={(text) => onChangeCustomAmount(member.id, text)}
                placeholder="0.00"
                placeholderTextColor={theme.muted}
                keyboardType="decimal-pad"
                style={[
                  styles.customInput,
                  { backgroundColor: theme.backgroundElement, color: theme.text },
                ]}
              />
            </View>
          ))}
          <View style={styles.previewRow}>
            <ThemedText type="small" themeColor="muted">
              Total
            </ThemedText>
            <ThemedText
              type="smallBold"
              style={{ color: customReconciles ? theme.success : theme.danger }}
            >
              {formatCentsAsCurrency(customTotalCents)} of {formatCentsAsCurrency(totalCents)}
            </ThemedText>
          </View>
        </View>
      )}
    </View>
  );
}

/** Re-exported so sheets can gate Save without re-deriving the same math. */
export function isSplitReadyToSave(
  splitMode: SplitMode,
  totalCents: number,
  participantIds: string[],
  customAmounts: Record<string, string>,
): boolean {
  if (participantIds.length === 0 || totalCents <= 0) return false;
  if (splitMode === 'equal') return true;

  const shares = participantIds.map((memberId) => dollarsToCents(customAmounts[memberId] ?? ''));
  if (shares.some((cents) => cents === undefined)) return false;

  return (
    sumShareCents(
      participantIds.map((memberId, index) => ({ memberId, amountCents: shares[index]! })),
    ) === totalCents
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.two,
  },
  previewList: {
    gap: Spacing.two,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  customName: {
    flex: 1,
  },
  customInput: {
    width: 96,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    textAlign: 'right',
  },
});
