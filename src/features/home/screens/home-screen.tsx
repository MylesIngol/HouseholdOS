import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { Stat } from '@/components/ui/stat';
import { Spacing } from '@/constants/theme';
import { AccountSheet } from '@/features/auth/components/account-sheet';
import { useHouseholdMembers, useMyHousehold } from '@/features/household/queries';
import { getCurrentUser } from '@/features/household/selectors';
import { useInventoryItems } from '@/features/kitchen/queries';
import { getExpiringSoonItems, getLowStockItems } from '@/features/kitchen/selectors';
import { getMoneySummary, getUpcomingBills } from '@/features/money/balances';
import { formatCentsAsCurrency } from '@/features/money/display';
import { useBills, useExpenses, useSettlements } from '@/features/money/queries';
import { formatDueLabel, getOccurrenceAssigneeLabel } from '@/features/tasks/display';
import { useChoreOccurrences } from '@/features/tasks/queries';
import { getDueUrgency, getMyOpenOccurrences } from '@/features/tasks/selectors';

// Placeholder for the household's display name until household naming/settings
// exists — swap this for the real household name when that's available.
const homeHeaderTitle = 'HouseholdOS';

export function HomeScreen() {
  const [accountOpen, setAccountOpen] = useState(false);

  const { data: household } = useMyHousehold();
  const { data: members = [] } = useHouseholdMembers(household?.id);
  const currentUser = getCurrentUser(members);

  const { data: items = [] } = useInventoryItems();
  const expiringSoonCount = getExpiringSoonItems(items).length;
  const lowStockCount = getLowStockItems(items).length;

  const { data: expenses = [] } = useExpenses();
  const { data: settlements = [] } = useSettlements();
  const { data: bills = [] } = useBills();
  const moneySummary = currentUser
    ? getMoneySummary(currentUser.id, members, expenses, settlements)
    : { youOweCents: 0, youAreOwedCents: 0 };
  const upcomingBillsCount = getUpcomingBills(bills).length;

  const { data: choreOccurrences = [] } = useChoreOccurrences();
  const myChores = currentUser ? getMyOpenOccurrences(choreOccurrences, currentUser.id) : [];
  const nextChore = myChores[0];
  const nextChoreTone =
    nextChore && getDueUrgency(nextChore.dueDate) === 'overdue' ? 'danger' : 'warning';

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="smallBold" themeColor="muted">
          {homeHeaderTitle}
        </ThemedText>
        <Pressable onPress={() => setAccountOpen(true)} hitSlop={8}>
          <ThemedText type="small" themeColor="muted">
            Account
          </ThemedText>
        </Pressable>
      </View>

      <AccountSheet visible={accountOpen} onClose={() => setAccountOpen(false)} />

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
            {myChores.length === 0
              ? 'Nothing on your plate right now'
              : `${myChores.length} ${myChores.length === 1 ? 'chore' : 'chores'} on your plate`}
          </ThemedText>
          {nextChore && (
            <Row
              title={nextChore.title}
              subtitle={`Assigned to ${getOccurrenceAssigneeLabel(nextChore, members)}`}
              trailing={<Pill label={formatDueLabel(nextChore.dueDate)} tone={nextChoreTone} />}
            />
          )}
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
