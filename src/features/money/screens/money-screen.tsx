import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { Stat } from '@/components/ui/stat';
import {
  billsDue,
  recentExpenses,
  roommateBalances,
  yourBalance,
} from '@/features/money/mock-data';
import { formatCurrency } from '@/lib/format';

export function MoneyScreen() {
  return (
    <Screen>
      <ThemedText type="title" style={styles.title}>
        Money
      </ThemedText>

      <Card>
        <Stat label="Owed to you" value={formatCurrency(yourBalance)} tone="success" />
      </Card>

      <Section title="Bills due">
        <Card>
          {billsDue.map((bill) => (
            <Row
              key={bill.id}
              title={bill.name}
              subtitle={bill.dueLabel}
              trailing={<ThemedText type="smallBold">{formatCurrency(bill.amount)}</ThemedText>}
            />
          ))}
        </Card>
      </Section>

      <Section title="Recent shared expenses">
        <Card>
          {recentExpenses.map((expense) => (
            <Row
              key={expense.id}
              title={expense.description}
              subtitle={`${expense.paidBy} · ${expense.dateLabel}`}
              trailing={<ThemedText type="smallBold">{formatCurrency(expense.amount)}</ThemedText>}
            />
          ))}
        </Card>
      </Section>

      <Section title="Roommate balances">
        <Card>
          {roommateBalances.map((balance) => (
            <Row
              key={balance.id}
              title={balance.name}
              subtitle={balance.amount >= 0 ? 'Owes you' : 'You owe'}
              trailing={
                <Pill
                  label={formatCurrency(Math.abs(balance.amount))}
                  tone={balance.amount >= 0 ? 'success' : 'danger'}
                />
              }
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
