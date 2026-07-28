import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { Stat } from '@/components/ui/stat';
import { getRecentActivity } from '@/features/money/activity';
import {
  getMoneySummary,
  getRoommateBalances,
  getUpcomingBills,
  getVisibleRoommateBalances,
} from '@/features/money/balances';
import { ActivityRow } from '@/features/money/components/activity-row';
import { BillDetailSheet } from '@/features/money/components/bill-detail-sheet';
import { BillRow } from '@/features/money/components/bill-row';
import { BillSheet } from '@/features/money/components/bill-sheet';
import { ExpenseSheet } from '@/features/money/components/expense-sheet';
import { RoommateDetailSheet } from '@/features/money/components/roommate-detail-sheet';
import { SettlementDetailSheet } from '@/features/money/components/settlement-detail-sheet';
import { formatCentsAsCurrency } from '@/features/money/display';
import { useMoneyStore } from '@/features/money/store';
import type {
  ActivityEntry,
  Bill,
  Expense,
  HouseholdMember,
  Settlement,
} from '@/features/money/types';

type ExpenseSheetTarget = 'new' | Expense | null;
type BillSheetTarget = 'new' | Bill | null;

export function MoneyScreen() {
  const members = useMoneyStore((state) => state.members);
  const expenses = useMoneyStore((state) => state.expenses);
  const settlements = useMoneyStore((state) => state.settlements);
  const bills = useMoneyStore((state) => state.bills);
  const currentUser = members.find((member) => member.isCurrentUser);

  const [expenseSheetTarget, setExpenseSheetTarget] = useState<ExpenseSheetTarget>(null);
  const [billSheetTarget, setBillSheetTarget] = useState<BillSheetTarget>(null);
  const [billDetailTarget, setBillDetailTarget] = useState<Bill | undefined>(undefined);
  const [settlementDetailTarget, setSettlementDetailTarget] = useState<Settlement | undefined>(
    undefined,
  );
  const [detailMember, setDetailMember] = useState<HouseholdMember | undefined>(undefined);

  if (!currentUser) return null;

  const summary = getMoneySummary(currentUser.id, members, expenses, settlements);
  const allBalances = getRoommateBalances(currentUser.id, members, expenses, settlements);
  const visibleBalances = getVisibleRoommateBalances(allBalances);
  const upcomingBills = getUpcomingBills(bills);
  const recentActivity = getRecentActivity(expenses, settlements, bills, 6);

  const expenseSheetVisible = expenseSheetTarget !== null;
  const expenseSheetItem =
    expenseSheetTarget && expenseSheetTarget !== 'new' ? expenseSheetTarget : undefined;
  const billSheetVisible = billSheetTarget !== null;
  const billSheetItem = billSheetTarget && billSheetTarget !== 'new' ? billSheetTarget : undefined;

  // The single place that decides what tapping any activity entry does,
  // regardless of whether it was tapped from the main Recent Activity list
  // or from inside a roommate's activity list.
  function handleActivityPress(entry: ActivityEntry) {
    switch (entry.type) {
      case 'expense_added':
        setExpenseSheetTarget(entry.expense);
        break;
      case 'bill_added':
      case 'bill_paid':
        if (entry.bill.status === 'upcoming') {
          setBillSheetTarget(entry.bill);
        } else {
          setBillDetailTarget(entry.bill);
        }
        break;
      case 'settlement':
        setSettlementDetailTarget(entry.settlement);
        break;
    }
  }

  return (
    <Screen>
      <ThemedText type="title" style={styles.title}>
        Money
      </ThemedText>

      <Card style={styles.summaryRow}>
        <Stat
          label="You owe"
          value={formatCentsAsCurrency(summary.youOweCents)}
          tone={summary.youOweCents > 0 ? 'danger' : 'text'}
        />
        <Stat
          label="You're owed"
          value={formatCentsAsCurrency(summary.youAreOwedCents)}
          tone={summary.youAreOwedCents > 0 ? 'success' : 'text'}
        />
      </Card>

      <Section
        title="Balances"
        action={{ label: 'Add expense', onPress: () => setExpenseSheetTarget('new') }}
      >
        {visibleBalances.length === 0 ? (
          <EmptyState title="No shared expenses yet" subtitle="Add one to start splitting costs" />
        ) : (
          <Card>
            {visibleBalances.map((balance) => (
              <Row
                key={balance.memberId}
                title={balance.name}
                subtitle={
                  balance.netCents === 0
                    ? 'Settled up'
                    : balance.netCents > 0
                      ? 'Owes you'
                      : 'You owe'
                }
                onPress={() => {
                  const member = members.find((candidate) => candidate.id === balance.memberId);
                  if (member) setDetailMember(member);
                }}
                trailing={
                  balance.netCents === 0 ? (
                    <Pill label="Settled" tone="neutral" />
                  ) : (
                    <Pill
                      label={formatCentsAsCurrency(Math.abs(balance.netCents))}
                      tone={balance.netCents > 0 ? 'success' : 'danger'}
                    />
                  )
                }
              />
            ))}
          </Card>
        )}
      </Section>

      <Section
        title="Bills"
        action={{ label: 'Add bill', onPress: () => setBillSheetTarget('new') }}
      >
        {upcomingBills.length === 0 ? (
          <EmptyState title="No bills due" subtitle="Add a bill to keep track of it" />
        ) : (
          <Card>
            {upcomingBills.map((bill) => (
              <BillRow key={bill.id} bill={bill} onPress={() => setBillSheetTarget(bill)} />
            ))}
          </Card>
        )}
      </Section>

      <Section title="Recent activity">
        {recentActivity.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            subtitle="Shared expenses and payments will show up here"
          />
        ) : (
          <Card>
            {recentActivity.map((entry) => (
              <ActivityRow
                key={entry.id}
                entry={entry}
                members={members}
                currentUserId={currentUser.id}
                onPress={() => handleActivityPress(entry)}
              />
            ))}
          </Card>
        )}
      </Section>

      <ExpenseSheet
        visible={expenseSheetVisible}
        expense={expenseSheetItem}
        onClose={() => setExpenseSheetTarget(null)}
      />
      <BillSheet
        visible={billSheetVisible}
        bill={billSheetItem}
        onClose={() => setBillSheetTarget(null)}
      />
      <BillDetailSheet
        visible={!!billDetailTarget}
        bill={billDetailTarget}
        onClose={() => setBillDetailTarget(undefined)}
        onViewLinkedExpense={(expense) => setExpenseSheetTarget(expense)}
      />
      <SettlementDetailSheet
        visible={!!settlementDetailTarget}
        settlement={settlementDetailTarget}
        onClose={() => setSettlementDetailTarget(undefined)}
      />
      <RoommateDetailSheet
        visible={!!detailMember}
        member={detailMember}
        onClose={() => setDetailMember(undefined)}
        onSelectActivity={handleActivityPress}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 34,
    lineHeight: 40,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
