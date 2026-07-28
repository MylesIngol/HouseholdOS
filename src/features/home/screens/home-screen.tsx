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
import { getMoneySummary, getUpcomingBills } from '@/features/money/balances';
import { formatCentsAsCurrency } from '@/features/money/display';
import { useMoneyStore } from '@/features/money/store';
import { choresLeftThisWeek, nextChore } from '@/features/tasks/mock-data';

// Placeholder for the household's display name until household naming/settings
// exists — swap this for the real household name when that's available.
const homeHeaderTitle = 'HouseholdOS';

export function HomeScreen() {
  const items = useKitchenStore((state) => state.items);
  const expiringSoonCount = getExpiringSoonItems(items).length;
  const lowStockCount = getLowStockItems(items).length;

  const moneyMembers = useMoneyStore((state) => state.members);
  const expenses = useMoneyStore((state) => state.expenses);
  const settlements = useMoneyStore((state) => state.settlements);
  const bills = useMoneyStore((state) => state.bills);
  const currentUser = moneyMembers.find((member) => member.isCurrentUser);
  const moneySummary = currentUser
    ? getMoneySummary(currentUser.id, moneyMembers, expenses, settlements)
    : { youOweCents: 0, youAreOwedCents: 0 };
  const upcomingBillsCount = getUpcomingBills(bills).length;

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
          <View style={styles.statRow}>
            <Stat
              label="You owe"
              value={formatCentsAsCurrency(moneySummary.youOweCents)}
              tone={moneySummary.youOweCents > 0 ? 'danger' : 'muted'}
            />
            <Stat
              label="You're owed"
              value={formatCentsAsCurrency(moneySummary.youAreOwedCents)}
              tone={moneySummary.youAreOwedCents > 0 ? 'success' : 'muted'}
            />
          </View>
          {upcomingBillsCount > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {upcomingBillsCount} {upcomingBillsCount === 1 ? 'bill' : 'bills'} due soon
            </ThemedText>
          )}
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
