import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Row } from '@/components/ui/row';
import { Spacing } from '@/constants/theme';
import { useHouseholdMembers, useMyHousehold } from '@/features/household/queries';
import type { HouseholdMember } from '@/features/household/types';
import {
  formatCompletedLabel,
  getOccurrenceAssigneeLabel,
  getOccurrenceCompleterLabel,
} from '@/features/tasks/display';
import { getChoreHistory } from '@/features/tasks/selectors';
import type { ChoreOccurrence } from '@/features/tasks/types';

type HistorySheetProps = {
  visible: boolean;
  onClose: () => void;
  occurrences: ChoreOccurrence[];
};

function historySubtitle(occurrence: ChoreOccurrence, members: HouseholdMember[]): string {
  const assignee = getOccurrenceAssigneeLabel(occurrence, members);
  const completer = getOccurrenceCompleterLabel(occurrence, members);
  if (completer && completer !== assignee) {
    return `Assigned to ${assignee} · Completed by ${completer}`;
  }
  return `Completed by ${completer ?? assignee}`;
}

/**
 * Read-only. No streaks, scores, or performance framing — just what was
 * completed, when, who it was assigned to, and who actually did it.
 */
export function HistorySheet({ visible, onClose, occurrences }: HistorySheetProps) {
  const { data: household } = useMyHousehold();
  const { data: members = [] } = useHouseholdMembers(household?.id);
  const history = getChoreHistory(occurrences);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ThemedText type="label" themeColor="muted">
        History
      </ThemedText>

      {history.length === 0 ? (
        <EmptyState title="Nothing completed yet" />
      ) : (
        <View style={styles.list}>
          <Card>
            {history.map((occurrence) => (
              <Row
                key={occurrence.id}
                title={occurrence.title}
                subtitle={historySubtitle(occurrence, members)}
                trailing={
                  <ThemedText type="small" themeColor="muted">
                    {formatCompletedLabel(occurrence.completedAt)}
                  </ThemedText>
                }
              />
            ))}
          </Card>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
});
