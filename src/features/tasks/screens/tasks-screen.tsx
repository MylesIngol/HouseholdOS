import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { Radii, Spacing } from '@/constants/theme';
import { useHouseholdMembers, useMyHousehold } from '@/features/household/queries';
import { getCurrentUser } from '@/features/household/selectors';
import { ChoreRow } from '@/features/tasks/components/chore-row';
import { ChoreSheet } from '@/features/tasks/components/chore-sheet';
import { HistorySheet } from '@/features/tasks/components/history-sheet';
import {
  useChoreOccurrences,
  useChoreTemplates,
  useCompleteOccurrence,
  useUndoChoreCompletion,
  type CompleteOccurrenceResult,
} from '@/features/tasks/queries';
import { getHouseholdOpenOccurrences, getMyOpenOccurrences } from '@/features/tasks/selectors';
import type { ChoreOccurrence, ChoreTemplate } from '@/features/tasks/types';
import { useTheme } from '@/hooks/use-theme';

type ChoreSheetTarget = 'new' | { template: ChoreTemplate; occurrence: ChoreOccurrence } | null;

export function TasksScreen() {
  const theme = useTheme();
  const { data: household } = useMyHousehold();
  const { data: members = [] } = useHouseholdMembers(household?.id);
  const currentUser = getCurrentUser(members);
  const { data: templates = [] } = useChoreTemplates();
  const { data: occurrences = [] } = useChoreOccurrences();
  const completeOccurrence = useCompleteOccurrence();
  const undoChoreCompletion = useUndoChoreCompletion();
  const [lastCompletion, setLastCompletion] = useState<CompleteOccurrenceResult | undefined>(
    undefined,
  );

  const [choreSheetTarget, setChoreSheetTarget] = useState<ChoreSheetTarget>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!currentUser) return null;

  const myTasks = getMyOpenOccurrences(occurrences, currentUser.id);
  const householdTasks = getHouseholdOpenOccurrences(occurrences, currentUser.id);

  const choreSheetVisible = choreSheetTarget !== null;
  const choreSheetTemplate =
    choreSheetTarget && choreSheetTarget !== 'new' ? choreSheetTarget.template : undefined;
  const choreSheetOccurrence =
    choreSheetTarget && choreSheetTarget !== 'new' ? choreSheetTarget.occurrence : undefined;

  function openEditSheet(occurrence: ChoreOccurrence) {
    const template = templates.find((candidate) => candidate.id === occurrence.templateId);
    if (template) setChoreSheetTarget({ template, occurrence });
  }

  function handleComplete(occurrence: ChoreOccurrence) {
    completeOccurrence.mutate(occurrence.id, {
      onSuccess: (result) => setLastCompletion(result),
    });
  }

  function handleUndo() {
    if (!lastCompletion) return;
    undoChoreCompletion.mutate(lastCompletion);
    setLastCompletion(undefined);
  }

  return (
    <Screen>
      <ThemedText type="title" style={styles.title}>
        Tasks
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        {myTasks.length === 0
          ? 'Nothing on your plate right now'
          : `${myTasks.length} ${myTasks.length === 1 ? 'chore' : 'chores'} on your plate`}
      </ThemedText>

      {lastCompletion && (
        <View style={[styles.undoBanner, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Marked done
          </ThemedText>
          <View style={styles.undoActions}>
            <Pressable onPress={handleUndo} hitSlop={8}>
              <ThemedText type="small" style={{ color: theme.accent }}>
                Undo
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => setLastCompletion(undefined)} hitSlop={8}>
              <ThemedText type="small" themeColor="muted">
                Dismiss
              </ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      <Section
        title="My Tasks"
        action={{ label: 'Add Chore', onPress: () => setChoreSheetTarget('new') }}
      >
        {myTasks.length === 0 ? (
          <EmptyState title="All caught up" subtitle="Nothing assigned to you right now" />
        ) : (
          <Card>
            {myTasks.map((occurrence) => (
              <ChoreRow
                key={occurrence.id}
                occurrence={occurrence}
                members={members}
                showAssignee={false}
                onPress={() => openEditSheet(occurrence)}
                onComplete={() => handleComplete(occurrence)}
              />
            ))}
          </Card>
        )}
      </Section>

      <Section title="Household" action={{ label: 'History', onPress: () => setHistoryOpen(true) }}>
        {householdTasks.length === 0 ? (
          <EmptyState title="Nothing else pending" />
        ) : (
          <Card>
            {householdTasks.map((occurrence) => (
              <ChoreRow
                key={occurrence.id}
                occurrence={occurrence}
                members={members}
                onPress={() => openEditSheet(occurrence)}
                onComplete={() => handleComplete(occurrence)}
              />
            ))}
          </Card>
        )}
      </Section>

      <ChoreSheet
        visible={choreSheetVisible}
        template={choreSheetTemplate}
        occurrence={choreSheetOccurrence}
        onClose={() => setChoreSheetTarget(null)}
      />
      <HistorySheet
        visible={historyOpen}
        occurrences={occurrences}
        onClose={() => setHistoryOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 34,
    lineHeight: 40,
  },
  undoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  undoActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
});
