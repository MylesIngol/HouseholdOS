import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { choresDueToday, choresLeftThisWeek, upcomingChores } from '@/features/tasks/mock-data';

export function TasksScreen() {
  return (
    <Screen>
      <ThemedText type="title" style={styles.title}>
        Tasks
      </ThemedText>
      <ThemedText themeColor="textSecondary">{choresLeftThisWeek} chores left this week</ThemedText>

      <Section title="Due today">
        <Card>
          {choresDueToday.map((chore) => (
            <Row
              key={chore.id}
              title={chore.title}
              subtitle={`Assigned to ${chore.assignee}`}
              trailing={
                <Pill
                  label={chore.completed ? 'Done' : chore.dueLabel}
                  tone={chore.completed ? 'success' : 'warning'}
                />
              }
            />
          ))}
        </Card>
      </Section>

      <Section title="Upcoming">
        <Card>
          {upcomingChores.map((chore) => (
            <Row
              key={chore.id}
              title={chore.title}
              subtitle={`Assigned to ${chore.assignee}`}
              trailing={<Pill label={chore.dueLabel} tone="neutral" />}
            />
          ))}
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 34,
    lineHeight: 40,
  },
});
