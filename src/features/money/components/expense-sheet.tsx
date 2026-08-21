import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FullScreenForm } from '@/components/ui/full-screen-form';
import { PillSelector } from '@/components/ui/pill-selector';
import { Radii, Spacing } from '@/constants/theme';
import { useHouseholdMembers, useMyHousehold } from '@/features/household/queries';
import { isSplitReadyToSave, SplitEditor } from '@/features/money/components/split-editor';
import { getCategoryLabel, getDeleteExpenseErrorMessage, getDeleteExpenseWarning } from '@/features/money/display';
import { centsToDollarsInput, dollarsToCents, resolveShares } from '@/features/money/money-math';
import { useAddExpense, useBills, useDeleteExpense, useUpdateExpense } from '@/features/money/queries';
import type { Expense, ExpenseCategory, SplitMode } from '@/features/money/types';
import { useTheme } from '@/hooks/use-theme';

type ExpenseSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Omit to open the sheet in "add" mode. */
  expense?: Expense;
};

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = (
  ['groceries', 'household_supplies', 'utilities', 'dining', 'transportation', 'other'] as const
).map((value) => ({ value, label: getCategoryLabel(value) }));

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fast "add expense" flow: description + amount is the minimum, everything else defaults to the common case and stays editable. Also doubles as the edit sheet when `expense` is provided. */
export function ExpenseSheet({ visible, onClose, expense }: ExpenseSheetProps) {
  const theme = useTheme();
  const { data: household } = useMyHousehold();
  const { data: members = [] } = useHouseholdMembers(household?.id);
  const { data: bills = [] } = useBills();
  const addExpense = useAddExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const currentUser = members.find((member) => member.isCurrentUser);

  const isEditMode = !!expense;

  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [payerId, setPayerId] = useState<string | undefined>(undefined);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [dateText, setDateText] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!visible) return;
    setDescription(expense?.description ?? '');
    setAmountText(expense ? centsToDollarsInput(expense.amountCents) : '');
    setPayerId(expense?.paidByMemberId ?? currentUser?.id);
    setParticipantIds(expense?.participants ?? members.map((member) => member.id));
    setSplitMode(expense?.splitMode ?? 'equal');
    setCustomAmounts(
      expense && expense.splitMode === 'custom'
        ? Object.fromEntries(
            expense.shares.map((share) => [share.memberId, centsToDollarsInput(share.amountCents)]),
          )
        : {},
    );
    setCategory(expense?.category ?? 'other');
    setDateText(expense?.date ?? todayIso());
    setNotes(expense?.notes ?? '');
    setMoreOptionsOpen(false);
    setDeleteConfirmOpen(false);
    setDeleteErrorMessage(undefined);
    deleteExpense.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, expense?.id]);

  const amountCents = dollarsToCents(amountText) ?? 0;
  const canSave =
    description.trim().length > 0 &&
    !!payerId &&
    !!dollarsToCents(amountText) &&
    isSplitReadyToSave(splitMode, amountCents, participantIds, customAmounts);

  function handleCustomAmountChange(memberId: string, text: string) {
    setCustomAmounts((current) => ({ ...current, [memberId]: text }));
  }

  function handleSave() {
    if (!canSave || !payerId) return;

    const customShares = participantIds.map((memberId) => ({
      memberId,
      amountCents: dollarsToCents(customAmounts[memberId] ?? '') ?? 0,
    }));
    const shares = resolveShares(splitMode, amountCents, participantIds, customShares);
    const payload = {
      description: description.trim(),
      amountCents,
      category,
      paidByMemberId: payerId,
      date: dateText,
      participants: participantIds,
      splitMode,
      shares,
      notes: notes.trim() || undefined,
    };

    if (isEditMode && expense) {
      updateExpense.mutate({ id: expense.id, input: payload });
    } else {
      addExpense.mutate(payload);
    }
    onClose();
  }

  // Awaits the RPC before doing anything else — the sheet only closes on a
  // real success, never optimistically. A rejection (today, exclusively a
  // receipt-linked expense — see delete_expense()'s override in the
  // confirm_receipt migration) keeps the sheet open with its own
  // human-readable message surfaced right where the user just tapped
  // Delete, instead of silently vanishing while the expense still exists.
  async function handleDelete() {
    if (!expense || deleteExpense.isPending) return;
    setDeleteErrorMessage(undefined);
    try {
      await deleteExpense.mutateAsync(expense.id);
      onClose();
    } catch (error) {
      setDeleteErrorMessage(getDeleteExpenseErrorMessage(error));
    }
  }

  function handleCancelDelete() {
    setDeleteConfirmOpen(false);
    setDeleteErrorMessage(undefined);
    deleteExpense.reset();
  }

  return (
    <FullScreenForm
      visible={visible}
      onClose={onClose}
      title={isEditMode ? 'Edit Expense' : 'Add Expense'}
      onSave={canSave ? handleSave : undefined}
      saveLabel={isEditMode ? 'Save' : 'Add'}
      saveDisabled={!canSave}
    >
      <View style={styles.field}>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What was it for?"
          placeholderTextColor={theme.muted}
          style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />
      </View>

      <View style={styles.field}>
        <TextInput
          value={amountText}
          onChangeText={setAmountText}
          placeholder="$0.00"
          placeholderTextColor={theme.muted}
          keyboardType="decimal-pad"
          style={[
            styles.input,
            styles.amountInput,
            { backgroundColor: theme.backgroundElement, color: theme.text },
          ]}
        />
      </View>

      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          Paid by
        </ThemedText>
        <PillSelector
          options={members.map((member) => ({
            value: member.id,
            label: member.isCurrentUser ? 'You' : member.name,
          }))}
          value={payerId}
          onChange={setPayerId}
        />
      </View>

      <SplitEditor
        members={members}
        totalCents={amountCents}
        participantIds={participantIds}
        onChangeParticipantIds={setParticipantIds}
        splitMode={splitMode}
        onChangeSplitMode={setSplitMode}
        customAmounts={customAmounts}
        onChangeCustomAmount={handleCustomAmountChange}
      />

      {!isEditMode && !moreOptionsOpen ? (
        <Pressable onPress={() => setMoreOptionsOpen(true)} hitSlop={8}>
          <ThemedText type="linkPrimary">More options</ThemedText>
        </Pressable>
      ) : (
        <>
          <View style={styles.field}>
            <ThemedText type="label" themeColor="muted">
              Category
            </ThemedText>
            <PillSelector options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
          </View>

          <View style={styles.field}>
            <ThemedText type="label" themeColor="muted">
              Date
            </ThemedText>
            <TextInput
              value={dateText}
              onChangeText={setDateText}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.muted}
              style={[
                styles.input,
                { backgroundColor: theme.backgroundElement, color: theme.text },
              ]}
            />
          </View>

          <View style={styles.field}>
            <ThemedText type="label" themeColor="muted">
              Notes
            </ThemedText>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional"
              placeholderTextColor={theme.muted}
              multiline
              style={[
                styles.input,
                styles.notesInput,
                { backgroundColor: theme.backgroundElement, color: theme.text },
              ]}
            />
          </View>
        </>
      )}

      {isEditMode &&
        expense &&
        (!deleteConfirmOpen ? (
          <Pressable onPress={() => setDeleteConfirmOpen(true)} hitSlop={8}>
            <ThemedText type="linkPrimary" style={{ color: theme.danger }}>
              Delete Expense
            </ThemedText>
          </Pressable>
        ) : (
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              {getDeleteExpenseWarning(expense, bills)}
            </ThemedText>
            <View style={styles.confirmActions}>
              <Pressable onPress={handleCancelDelete} hitSlop={8} disabled={deleteExpense.isPending}>
                <ThemedText type="small" themeColor="muted">
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable onPress={handleDelete} hitSlop={8} disabled={deleteExpense.isPending}>
                <ThemedText
                  type="linkPrimary"
                  style={{ color: theme.danger, opacity: deleteExpense.isPending ? 0.5 : 1 }}
                >
                  {deleteExpense.isPending ? 'Deleting…' : 'Delete'}
                </ThemedText>
              </Pressable>
            </View>
            {deleteErrorMessage && (
              <ThemedText type="small" themeColor="danger" style={styles.deleteError}>
                {deleteErrorMessage}
              </ThemedText>
            )}
          </View>
        ))}
    </FullScreenForm>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  input: {
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  amountInput: {
    fontSize: 24,
  },
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  deleteError: {
    marginTop: Spacing.one,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
});
