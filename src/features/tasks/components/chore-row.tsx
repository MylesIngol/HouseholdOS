import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { Spacing } from '@/constants/theme';
import type { HouseholdMember } from '@/features/household/types';
import { formatDueLabel, getOccurrenceAssigneeLabel } from '@/features/tasks/display';
import { getDueUrgency } from '@/features/tasks/selectors';
import type { ChoreOccurrence } from '@/features/tasks/types';
import { useTheme } from '@/hooks/use-theme';

type ChoreRowProps = {
  occurrence: ChoreOccurrence;
  members: HouseholdMember[];
  /** Tapping the row opens it for editing. */
  onPress?: () => void;
  onComplete: () => void;
  /** My Tasks rows omit "Assigned to You" since it's redundant there; Household rows show who's responsible. */
  showAssignee?: boolean;
};

/** One open chore, with a one-tap Done action — no confirmation, matching the app's normal-completion UX principle. */
export function ChoreRow({
  occurrence,
  members,
  onPress,
  onComplete,
  showAssignee = true,
}: ChoreRowProps) {
  const theme = useTheme();
  const urgency = getDueUrgency(occurrence.dueDate);
  const tone = urgency === 'overdue' ? 'danger' : urgency === 'due_today' ? 'warning' : 'neutral';

  return (
    <Row
      title={occurrence.title}
      subtitle={
        showAssignee ? `Assigned to ${getOccurrenceAssigneeLabel(occurrence, members)}` : undefined
      }
      onPress={onPress}
      align="top"
      trailing={
        <View style={styles.trailing}>
          <Pill label={formatDueLabel(occurrence.dueDate)} tone={tone} />
          <Pressable onPress={onComplete} hitSlop={8} style={styles.doneButton}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              Done
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
    // A fixed minimum width keeps the Pill and Done link from reflowing
    // width between rows with different due-label lengths ("Overdue" vs
    // "Due in 4 days"), so the Done link's horizontal position is also
    // consistent, not just its vertical position.
    minWidth: 92,
  },
  doneButton: {
    paddingVertical: Spacing.half,
  },
});
