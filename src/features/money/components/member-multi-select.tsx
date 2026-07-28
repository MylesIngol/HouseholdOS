import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import type { HouseholdMember } from '@/features/money/types';
import { useTheme } from '@/hooks/use-theme';

type MemberMultiSelectProps = {
  members: HouseholdMember[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

/**
 * Toggleable member pills for participant selection — distinct from the
 * shared single-select `PillSelector` since choosing expense/bill
 * participants means picking any number of people, not exactly one.
 */
export function MemberMultiSelect({ members, selectedIds, onChange }: MemberMultiSelectProps) {
  const theme = useTheme();

  function toggle(memberId: string) {
    if (selectedIds.includes(memberId)) {
      onChange(selectedIds.filter((id) => id !== memberId));
    } else {
      onChange([...selectedIds, memberId]);
    }
  }

  return (
    <View style={styles.row}>
      {members.map((member) => {
        const selected = selectedIds.includes(member.id);
        return (
          <Pressable
            key={member.id}
            onPress={() => toggle(member.id)}
            style={[
              styles.pill,
              { backgroundColor: selected ? theme.accent : theme.backgroundElement },
            ]}
          >
            <ThemedText
              type="smallBold"
              style={{ color: selected ? theme.onAccent : theme.textSecondary }}
            >
              {member.isCurrentUser ? 'You' : member.name}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.full,
  },
});
