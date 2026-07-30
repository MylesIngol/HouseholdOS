import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FullScreenForm } from '@/components/ui/full-screen-form';
import { PillSelector } from '@/components/ui/pill-selector';
import { Radii, Spacing } from '@/constants/theme';
import { useHouseholdMembers, useMyHousehold } from '@/features/household/queries';
import { getCurrentUser } from '@/features/household/selectors';
import { RotationPicker } from '@/features/tasks/components/rotation-picker';
import { getRecurrenceLabel } from '@/features/tasks/display';
import {
  useAddChore,
  useDeleteOneTimeChore,
  useStopChore,
  useUpdateChore,
} from '@/features/tasks/queries';
import { addDays, todayIso } from '@/features/tasks/recurrence';
import type {
  AssignmentType,
  ChoreOccurrence,
  ChoreRecurrence,
  ChoreTemplate,
} from '@/features/tasks/types';
import { useTheme } from '@/hooks/use-theme';

type ChoreSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Omit to open in "add" mode. */
  template?: ChoreTemplate;
  /** The template's current open occurrence — required alongside `template` in edit mode so the sheet knows (and can change) who holds it right now. */
  occurrence?: ChoreOccurrence;
};

const RECURRENCE_OPTIONS: { value: ChoreRecurrence; label: string }[] = [
  { value: 'none', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const ASSIGNMENT_OPTIONS: { value: AssignmentType; label: string }[] = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'rotating', label: 'Rotating' },
];

type DueDateQuickPick = 'today' | 'tomorrow' | '3days' | '1week' | 'custom';

const DUE_DATE_OPTIONS: { value: DueDateQuickPick; label: string; days: number | null }[] = [
  { value: 'today', label: 'Today', days: 0 },
  { value: 'tomorrow', label: 'Tomorrow', days: 1 },
  { value: '3days', label: '3 days', days: 3 },
  { value: '1week', label: '1 week', days: 7 },
];

/**
 * Add/edit chore sheet. Editing the fixed assignee, or explicitly picking
 * who currently holds a rotating chore, updates the current open occurrence
 * immediately — see `applyTemplateAssignmentUpdate` — so My Tasks / Household
 * reflect it right away instead of only on the next completion. Merely
 * reordering/editing a rotating chore's eligibility list, without an
 * explicit "currently assigned to" pick, leaves the current holder alone as
 * long as they're still eligible (only reassigns if they were removed) —
 * that's intentional and distinct from an explicit reassignment. Due date
 * and recurrence aren't editable here regardless: the open occurrence keeps
 * its existing due date and snapshotted title until it's completed, so those
 * fields only appear in add mode. Recurrence itself is locked after
 * creation, mirroring Money's Bill sheet.
 */
export function ChoreSheet({ visible, onClose, template, occurrence }: ChoreSheetProps) {
  const theme = useTheme();
  const { data: household } = useMyHousehold();
  const { data: members = [] } = useHouseholdMembers(household?.id);
  const currentUser = getCurrentUser(members);
  const addChore = useAddChore();
  const updateChore = useUpdateChore();
  const stopChore = useStopChore();
  const deleteOneTimeChore = useDeleteOneTimeChore();

  const isEditMode = !!template;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [recurrence, setRecurrence] = useState<ChoreRecurrence>('none');
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('fixed');
  const [assigneeId, setAssigneeId] = useState<string | undefined>(undefined);
  const [rotationOrder, setRotationOrder] = useState<string[]>([]);
  /** Only used in edit mode for rotating chores — who should hold the current open occurrence, distinct from the eligibility list. */
  const [currentAssigneeId, setCurrentAssigneeId] = useState<string | undefined>(undefined);
  const [dueDateQuickPick, setDueDateQuickPick] = useState<DueDateQuickPick | undefined>('today');
  const [dueDate, setDueDate] = useState(todayIso());
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(template?.title ?? '');
    setDescription(template?.description ?? '');
    setRecurrence(template?.recurrence ?? 'none');
    setAssignmentType(template?.assignmentType ?? 'fixed');
    setAssigneeId(template?.assigneeId ?? currentUser?.id);
    setRotationOrder(template?.rotationMemberIds ?? []);
    setCurrentAssigneeId(occurrence?.assignedMemberId);
    setDueDateQuickPick('today');
    setDueDate(todayIso());
    setDetailsExpanded(!!template);
    setStopConfirmOpen(false);
    setDeleteConfirmOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, template?.id]);

  // Keeps the "currently assigned to" selection valid as the eligibility
  // list is edited — if the person it's pointing at gets removed, fall back
  // to the new list's first member rather than leaving a stale selection.
  useEffect(() => {
    if (!isEditMode || assignmentType !== 'rotating') return;
    if (currentAssigneeId && rotationOrder.includes(currentAssigneeId)) return;
    setCurrentAssigneeId(rotationOrder[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotationOrder, assignmentType, isEditMode]);

  function handleRecurrenceChange(next: ChoreRecurrence) {
    setRecurrence(next);
    if (next === 'none' && assignmentType === 'rotating') {
      setAssignmentType('fixed');
    }
  }

  function handleDueDateQuickPick(option: (typeof DUE_DATE_OPTIONS)[number]) {
    setDueDateQuickPick(option.value);
    if (option.days !== null) {
      setDueDate(addDays(todayIso(), option.days));
    }
  }

  const canSave =
    title.trim().length > 0 &&
    (assignmentType === 'fixed' ? !!assigneeId : rotationOrder.length > 0) &&
    (isEditMode || recurrence === 'none' || dueDate.trim().length > 0);

  function handleSave() {
    if (!canSave) return;
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim() || undefined;

    if (isEditMode && template) {
      updateChore.mutate({
        id: template.id,
        patch: {
          title: trimmedTitle,
          description: trimmedDescription,
          assignmentType,
          assigneeId: assignmentType === 'fixed' ? assigneeId : undefined,
          rotationMemberIds: assignmentType === 'rotating' ? rotationOrder : undefined,
        },
        explicitCurrentAssigneeId: assignmentType === 'rotating' ? currentAssigneeId : undefined,
      });
    } else {
      addChore.mutate({
        title: trimmedTitle,
        description: trimmedDescription,
        assignmentType,
        assigneeId: assignmentType === 'fixed' ? assigneeId : undefined,
        rotationMemberIds: assignmentType === 'rotating' ? rotationOrder : undefined,
        recurrence,
        dueDate: recurrence === 'none' ? undefined : dueDate,
      });
    }
    onClose();
  }

  function handleStop() {
    if (!template) return;
    stopChore.mutate(template.id);
    onClose();
  }

  function handleDelete() {
    if (!template) return;
    deleteOneTimeChore.mutate(template.id);
    onClose();
  }

  const isRecurring = recurrence !== 'none';

  return (
    <FullScreenForm
      visible={visible}
      onClose={onClose}
      title={isEditMode ? 'Edit Chore' : 'Add Chore'}
      onSave={canSave ? handleSave : undefined}
      saveLabel={isEditMode ? 'Save' : 'Add'}
      saveDisabled={!canSave}
    >
      <View style={styles.field}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Chore name"
          placeholderTextColor={theme.muted}
          style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />
      </View>

      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          {assignmentType === 'rotating' ? 'Rotation order' : "Who's responsible?"}
        </ThemedText>
        {assignmentType === 'rotating' ? (
          <RotationPicker members={members} order={rotationOrder} onChange={setRotationOrder} />
        ) : (
          <PillSelector
            options={members.map((member) => ({
              value: member.id,
              label: member.isCurrentUser ? 'You' : member.name,
            }))}
            value={assigneeId}
            onChange={setAssigneeId}
          />
        )}
      </View>

      {isEditMode && assignmentType === 'rotating' && rotationOrder.length > 0 && (
        <View style={styles.field}>
          <ThemedText type="label" themeColor="muted">
            Currently assigned to
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Hand this chore's current occurrence to someone else right now, without waiting for it
            to be completed. This doesn't change the rotation order above.
          </ThemedText>
          <PillSelector
            options={rotationOrder.map((memberId) => {
              const member = members.find((candidate) => candidate.id === memberId);
              return { value: memberId, label: member?.isCurrentUser ? 'You' : (member?.name ?? '') };
            })}
            value={currentAssigneeId}
            onChange={setCurrentAssigneeId}
          />
        </View>
      )}

      {!detailsExpanded ? (
        <Pressable onPress={() => setDetailsExpanded(true)} hitSlop={8}>
          <ThemedText type="linkPrimary">More details</ThemedText>
        </Pressable>
      ) : (
        <>
          <View style={styles.field}>
            <ThemedText type="label" themeColor="muted">
              Recurrence
            </ThemedText>
            {isEditMode ? (
              <ThemedText type="small" themeColor="textSecondary">
                {getRecurrenceLabel(recurrence)}
              </ThemedText>
            ) : (
              <PillSelector
                options={RECURRENCE_OPTIONS}
                value={recurrence}
                onChange={handleRecurrenceChange}
              />
            )}
          </View>

          {!isEditMode && isRecurring && (
            <View style={styles.field}>
              <ThemedText type="label" themeColor="muted">
                Assignment
              </ThemedText>
              <PillSelector
                options={ASSIGNMENT_OPTIONS}
                value={assignmentType}
                onChange={setAssignmentType}
              />
            </View>
          )}

          {!isEditMode && (
            <View style={styles.field}>
              <ThemedText type="label" themeColor="muted">
                Due date
              </ThemedText>
              <PillSelector
                options={DUE_DATE_OPTIONS}
                value={dueDateQuickPick}
                onChange={(value) =>
                  handleDueDateQuickPick(DUE_DATE_OPTIONS.find((o) => o.value === value)!)
                }
              />
              <View style={styles.customDateRow}>
                <TextInput
                  value={dueDate}
                  onChangeText={(text) => {
                    setDueDate(text);
                    setDueDateQuickPick('custom');
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.muted}
                  style={[
                    styles.customDateInput,
                    { backgroundColor: theme.backgroundElement, color: theme.text },
                  ]}
                />
              </View>
            </View>
          )}

          <View style={styles.field}>
            <ThemedText type="label" themeColor="muted">
              Description
            </ThemedText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Optional"
              placeholderTextColor={theme.muted}
              multiline
              style={[
                styles.input,
                styles.descriptionInput,
                { backgroundColor: theme.backgroundElement, color: theme.text },
              ]}
            />
          </View>
        </>
      )}

      {isEditMode &&
        template &&
        (template.recurrence === 'none' ? (
          !deleteConfirmOpen ? (
            <Pressable onPress={() => setDeleteConfirmOpen(true)} hitSlop={8}>
              <ThemedText type="linkPrimary" style={{ color: theme.danger }}>
                Delete Chore
              </ThemedText>
            </Pressable>
          ) : (
            <View style={styles.field}>
              <ThemedText type="small" themeColor="textSecondary">
                Delete this chore? This can&apos;t be undone.
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
          )
        ) : !stopConfirmOpen ? (
          <Pressable onPress={() => setStopConfirmOpen(true)} hitSlop={8}>
            <ThemedText type="linkPrimary" style={{ color: theme.danger }}>
              Stop Chore
            </ThemedText>
          </Pressable>
        ) : (
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              {`Stop this recurring chore? ${template.title}'s history will be kept, but no new occurrences will be created, and its current occurrence will be removed.`}
            </ThemedText>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setStopConfirmOpen(false)} hitSlop={8}>
                <ThemedText type="small" themeColor="muted">
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable onPress={handleStop} hitSlop={8}>
                <ThemedText type="linkPrimary" style={{ color: theme.danger }}>
                  Stop
                </ThemedText>
              </Pressable>
            </View>
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
  descriptionInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  customDateInput: {
    flex: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
});
