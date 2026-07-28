import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PillSelector } from '@/components/ui/pill-selector';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Radii, Spacing } from '@/constants/theme';
import { isSplitReadyToSave, SplitEditor } from '@/features/money/components/split-editor';
import { getRecurrenceLabel } from '@/features/money/display';
import { centsToDollarsInput, dollarsToCents, resolveShares } from '@/features/money/money-math';
import { useMoneyStore } from '@/features/money/store';
import type { Bill, BillRecurrence, SplitMode } from '@/features/money/types';
import { useTheme } from '@/hooks/use-theme';

type BillSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Omit to open in "add" mode. Only ever pass an upcoming bill — paid bills are read-only (see BillDetailSheet). */
  bill?: Bill;
};

const RECURRENCE_OPTIONS: { value: BillRecurrence; label: string }[] = [
  { value: 'one_time', label: 'One-time' },
  { value: 'monthly', label: 'Monthly' },
];

const NO_RESPONSIBLE_MEMBER = 'none';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fast "add bill" flow: name, amount, and due date are the minimum. Also the edit sheet for an upcoming bill when `bill` is provided. */
export function BillSheet({ visible, onClose, bill }: BillSheetProps) {
  const theme = useTheme();
  const members = useMoneyStore((state) => state.members);
  const addBill = useMoneyStore((state) => state.addBill);
  const updateBill = useMoneyStore((state) => state.updateBill);
  const deleteBill = useMoneyStore((state) => state.deleteBill);

  const isEditMode = !!bill;

  const [name, setName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [dueDate, setDueDate] = useState(todayIso());
  const [recurrence, setRecurrence] = useState<BillRecurrence>('one_time');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [responsibleMemberId, setResponsibleMemberId] = useState<string>(NO_RESPONSIBLE_MEMBER);
  const [notes, setNotes] = useState('');
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(bill?.name ?? '');
    setAmountText(bill ? centsToDollarsInput(bill.amountCents) : '');
    setDueDate(bill?.dueDate ?? todayIso());
    setRecurrence(bill?.recurrence ?? 'one_time');
    setParticipantIds(bill?.participants ?? members.map((member) => member.id));
    setSplitMode(bill?.splitMode ?? 'equal');
    setCustomAmounts(
      bill && bill.splitMode === 'custom'
        ? Object.fromEntries(
            bill.shares.map((share) => [share.memberId, centsToDollarsInput(share.amountCents)]),
          )
        : {},
    );
    setResponsibleMemberId(bill?.responsibleMemberId ?? NO_RESPONSIBLE_MEMBER);
    setNotes(bill?.notes ?? '');
    setMoreOptionsOpen(false);
    setDeleteConfirmOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, bill?.id]);

  const amountCents = dollarsToCents(amountText) ?? 0;
  const canSave =
    name.trim().length > 0 &&
    !!dollarsToCents(amountText) &&
    !!dueDate.trim() &&
    isSplitReadyToSave(splitMode, amountCents, participantIds, customAmounts);

  function handleCustomAmountChange(memberId: string, text: string) {
    setCustomAmounts((current) => ({ ...current, [memberId]: text }));
  }

  function handleSave() {
    if (!canSave) return;

    const customShares = participantIds.map((memberId) => ({
      memberId,
      amountCents: dollarsToCents(customAmounts[memberId] ?? '') ?? 0,
    }));
    const shares = resolveShares(splitMode, amountCents, participantIds, customShares);
    const responsible =
      responsibleMemberId === NO_RESPONSIBLE_MEMBER ? undefined : responsibleMemberId;

    if (isEditMode && bill) {
      updateBill(bill.id, {
        name: name.trim(),
        amountCents,
        dueDate,
        responsibleMemberId: responsible,
        participants: participantIds,
        splitMode,
        shares,
        notes: notes.trim() || undefined,
      });
    } else {
      addBill({
        name: name.trim(),
        amountCents,
        dueDate,
        responsibleMemberId: responsible,
        participants: participantIds,
        splitMode,
        shares,
        recurrence,
        notes: notes.trim() || undefined,
      });
    }
    onClose();
  }

  function handleDelete() {
    if (!bill) return;
    deleteBill(bill.id);
    onClose();
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ThemedText type="label" themeColor="muted">
        {isEditMode ? 'Edit Bill' : 'Add Bill'}
      </ThemedText>

      <View style={styles.field}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Bill name (e.g. Rent)"
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
          Due date
        </ThemedText>
        <TextInput
          value={dueDate}
          onChangeText={setDueDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.muted}
          style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />
      </View>

      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          Recurrence
        </ThemedText>
        {isEditMode ? (
          // Recurrence is fixed at creation — changing it after the fact would mean
          // creating or detaching a recurring template, which is out of scope here.
          <ThemedText type="small" themeColor="textSecondary">
            {getRecurrenceLabel(recurrence)}
            {bill?.recurringBillId ? ' · part of a recurring series' : ''}
          </ThemedText>
        ) : (
          <PillSelector options={RECURRENCE_OPTIONS} value={recurrence} onChange={setRecurrence} />
        )}
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
              Responsible for paying
            </ThemedText>
            <PillSelector
              options={[
                { value: NO_RESPONSIBLE_MEMBER, label: 'Unassigned' },
                ...members.map((member) => ({
                  value: member.id,
                  label: member.isCurrentUser ? 'You' : member.name,
                })),
              ]}
              value={responsibleMemberId}
              onChange={setResponsibleMemberId}
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
        bill &&
        (!deleteConfirmOpen ? (
          <Pressable onPress={() => setDeleteConfirmOpen(true)} hitSlop={8}>
            <ThemedText type="linkPrimary" style={{ color: theme.danger }}>
              Delete Bill
            </ThemedText>
          </Pressable>
        ) : (
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Delete this bill? It hasn&apos;t been paid yet, so this won&apos;t affect any
              balances.
            </ThemedText>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setDeleteConfirmOpen(false)} hitSlop={8}>
                <ThemedText type="small" themeColor="muted">
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable onPress={handleDelete} hitSlop={8}>
                <ThemedText type="linkPrimary" style={{ color: theme.danger }}>
                  Delete
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ))}

      <PrimaryButton
        label={isEditMode ? 'Save' : 'Add Bill'}
        onPress={canSave ? handleSave : undefined}
        style={canSave ? undefined : styles.disabled}
      />
    </BottomSheet>
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
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  disabled: {
    opacity: 0.5,
  },
});
