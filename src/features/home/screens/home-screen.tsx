import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { Stat } from '@/components/ui/stat';
import { Spacing } from '@/constants/theme';
import { getExpiringSoonItems, getLowStockItems } from '@/features/kitchen/selectors';
import { useKitchenStore } from '@/features/kitchen/store';
import { billsDue, yourBalance } from '@/features/money/mock-data';
import { choresLeftThisWeek, nextChore } from '@/features/tasks/mock-data';
import { formatCurrency } from '@/lib/format';

// Placeholder for the household's display name until household naming/settings
// exists — swap this for the real household name when that's available.
const homeHeaderTitle = 'HouseholdOS';

export function HomeScreen() {
  const items = useKitchenStore((state) => state.items);
  const expiringSoonCount = getExpiringSoonItems(items).length;
  const lowStockCount = getLowStockItems(items).length;

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="smallBold" themeColor="muted">
          {homeHeaderTitle}
        </ThemedText>
      </View>

      <Section title="Kitchen" action={{ label: 'View Kitchen', href: '/kitchen' }}>
        <Card style={styles.statRow}>
          <Stat label="Expiring soon" value={String(expiringSoonCount)} tone="warning" />
          <Stat label="Low stock" value={String(lowStockCount)} tone="muted" />
        </Card>
      </Section>

      <Section title="Money" action={{ label: 'View Money', href: '/money' }}>
        <Card>
          <Stat label="Owed to you" value={formatCurrency(yourBalance)} tone="success" />
          <ThemedText type="small" themeColor="textSecondary">
            {billsDue.length} bills due soon
          </ThemedText>
        </Card>
      </Section>

      <Section title="Tasks" action={{ label: 'View Tasks', href: '/tasks' }}>
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            {choresLeftThisWeek} chores left this week
          </ThemedText>
          {nextChore && (
            <Row
              title={nextChore.title}
              subtitle={`Assigned to ${nextChore.assignee}`}
              trailing={<Pill label={nextChore.dueLabel} tone="warning" />}
            />
          )}
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
