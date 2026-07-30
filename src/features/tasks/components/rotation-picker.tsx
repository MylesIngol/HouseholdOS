import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import type { HouseholdMember } from '@/features/household/types';
import { useTheme } from '@/hooks/use-theme';

type RotationPickerProps = {
  members: HouseholdMember[];
  /** Ordered member ids — rotation always advances through this exact order. */
  order: string[];
  onChange: (order: string[]) => void;
};

/**
 * An ordered multi-select: tap a member to add them to the end of the
 * rotation, tap again to remove them. No drag-to-reorder — order of
 * selection is the rotation order, which is simple, deterministic, and
 * avoids building a reordering UI for what's normally a 2-4 person list.
 */
export function RotationPicker({ members, order, onChange }: RotationPickerProps) {
  const theme = useTheme();

  function toggle(memberId: string) {
    if (order.includes(memberId)) {
      onChange(order.filter((id) => id !== memberId));
    } else {
      onChange([...order, memberId]);
    }
  }

  return (
    <View style={styles.row}>
      {members.map((member) => {
        const position = order.indexOf(member.id);
        const selected = position !== -1;
        const label = member.isCurrentUser ? 'You' : member.name;
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
              {selected ? `${position + 1}. ${label}` : label}
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
