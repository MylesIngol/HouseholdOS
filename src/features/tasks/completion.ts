import { getNextDueDate } from './recurrence.ts';
import type { AssignmentType, ChoreOccurrence, ChoreTemplate } from './types';

// -----------------------------------------------------------------------------
// Pure state-transition logic for completing a chore occurrence — the one
// Tasks action careful enough to warrant its own guarded, directly-testable
// function, mirroring Money's `applyMarkBillPaid` in bill-payment.ts. Kept
// free of Zustand so `node --experimental-strip-types --test` can exercise
// it directly. store.ts is a thin wrapper that calls this and applies the
// result via `set`.
// -----------------------------------------------------------------------------

/**
 * Determines who the next rotating occurrence should go to.
 *
 * - No prior assignee (first occurrence ever) -> first member in the list.
 * - Prior assignee still present in `rotationMemberIds` -> the next member
 *   after them, wrapping around after the last member (deterministic).
 * - Prior assignee no longer in `rotationMemberIds` (the rotation list was
 *   edited and they were removed) -> restart at the top of the new list.
 *   This is the explicit, documented answer to "what happens when the
 *   rotation list changes": history is untouched (each occurrence keeps its
 *   own frozen `assignedMemberId` forever), and only the next-generated
 *   occurrence is affected by the new list.
 */
export function getNextRotationAssignee(
  rotationMemberIds: string[],
  lastAssignedMemberId: string | undefined,
): string | undefined {
  if (rotationMemberIds.length === 0) return undefined;
  if (!lastAssignedMemberId) return rotationMemberIds[0];

  const index = rotationMemberIds.indexOf(lastAssignedMemberId);
  if (index === -1) return rotationMemberIds[0];
  return rotationMemberIds[(index + 1) % rotationMemberIds.length];
}

/**
 * Builds the next occurrence for a template after `completedOccurrence` was
 * just completed, or `undefined` if no next occurrence should be created
 * (one-time chore, or the template has been stopped/deactivated).
 */
export function buildNextChoreOccurrence(
  template: ChoreTemplate,
  completedOccurrence: ChoreOccurrence,
  newOccurrenceId: string,
  now: string,
): ChoreOccurrence | undefined {
  if (template.recurrence === 'none' || !template.active) return undefined;

  const assignedMemberId =
    template.assignmentType === 'fixed'
      ? template.assigneeId
      : getNextRotationAssignee(
          template.rotationMemberIds ?? [],
          completedOccurrence.assignedMemberId,
        );
  if (!assignedMemberId) return undefined;

  return {
    id: newOccurrenceId,
    templateId: template.id,
    title: template.title,
    description: template.description,
    assignedMemberId,
    dueDate: getNextDueDate(completedOccurrence.dueDate, template.recurrence),
    status: 'open',
    createdAt: now,
  };
}

// -----------------------------------------------------------------------------
// Editing responsibility on an active, still-open chore. Template edits
// otherwise only affect future occurrences (see ChoreTemplatePatch), but
// leaving the *current* open occurrence pointing at the old assignee after
// an assignee/rotation edit meant it silently stayed in the wrong section
// (My Tasks vs Household) until it was next completed — confusing in
// practice, so responsibility edits now also update the current occurrence.
// Due dates and completed history are never touched by this.
// -----------------------------------------------------------------------------

/**
 * The current open occurrence's new assignee after a template's assignment
 * configuration changes.
 *
 * - Fixed: the occurrence simply follows the new fixed assignee.
 * - Rotating: if the editor explicitly picked who currently holds it
 *   (`explicitCurrentAssigneeId`) and that person is in the new rotation
 *   list, that wins outright — this is the direct "hand it to this person
 *   right now" action, distinct from just editing the eligibility list.
 *   Otherwise: if the occurrence's existing assignee is still in the new
 *   list, they keep it (editing the list alone shouldn't silently reassign
 *   responsibility away from someone still eligible for it). If they were
 *   removed from the list, the occurrence reassigns to the first member in
 *   the new order. Future occurrences continue rotating from whoever ends up
 *   holding the current occurrence, using `getNextRotationAssignee` as
 *   before — so this is the one place that has to stay in sync with that
 *   function's "no next occurrence" fallback-to-first-member rule.
 */
export function computeReassignedCurrentAssignee(
  assignmentType: AssignmentType,
  assigneeId: string | undefined,
  rotationMemberIds: string[] | undefined,
  currentAssignedMemberId: string,
  explicitCurrentAssigneeId?: string,
): string {
  if (assignmentType === 'fixed') {
    return assigneeId ?? currentAssignedMemberId;
  }

  const list = rotationMemberIds ?? [];
  if (explicitCurrentAssigneeId && list.includes(explicitCurrentAssigneeId)) {
    return explicitCurrentAssigneeId;
  }
  if (list.includes(currentAssignedMemberId)) return currentAssignedMemberId;
  return list[0] ?? currentAssignedMemberId;
}

/**
 * Applies a template's updated assignment configuration to `templateId`'s
 * current *open* occurrence, if one exists. Completed occurrences for the
 * same template are matched by the `status !== 'open'` guard and always
 * pass through unchanged — history is never rewritten by an edit. A no-op
 * (returns the same occurrence, so `set` won't cause a spurious re-render)
 * when the computed assignee is unchanged.
 */
export function applyTemplateAssignmentUpdate(
  occurrences: ChoreOccurrence[],
  templateId: string,
  updatedTemplate: Pick<ChoreTemplate, 'assignmentType' | 'assigneeId' | 'rotationMemberIds'>,
  explicitCurrentAssigneeId?: string,
): ChoreOccurrence[] {
  return occurrences.map((occurrence) => {
    if (occurrence.templateId !== templateId || occurrence.status !== 'open') return occurrence;

    const assignedMemberId = computeReassignedCurrentAssignee(
      updatedTemplate.assignmentType,
      updatedTemplate.assigneeId,
      updatedTemplate.rotationMemberIds,
      occurrence.assignedMemberId,
      explicitCurrentAssigneeId,
    );
    return assignedMemberId === occurrence.assignedMemberId
      ? occurrence
      : { ...occurrence, assignedMemberId };
  });
}

export type CompleteOccurrenceResult = {
  templates: ChoreTemplate[];
  occurrences: ChoreOccurrence[];
};

/**
 * Completes `occurrenceId` and, for an active recurring template, generates
 * the next occurrence in the same step — exactly the sequence required:
 * (1) mark current occurrence completed, (2) preserve who was assigned and
 * who completed it on that same record, (3) create the next occurrence,
 * (4) assign it per fixed/rotating rules. Returns `undefined` (a no-op) if
 * the occurrence doesn't exist or is already completed, so this can never
 * double-generate a next occurrence for the same completion.
 */
export function applyCompleteOccurrence(
  templates: ChoreTemplate[],
  occurrences: ChoreOccurrence[],
  occurrenceId: string,
  completedByMemberId: string,
  now: string,
  newOccurrenceId: string,
): CompleteOccurrenceResult | undefined {
  const occurrence = occurrences.find((candidate) => candidate.id === occurrenceId);
  if (!occurrence || occurrence.status === 'completed') return undefined;

  const completed: ChoreOccurrence = {
    ...occurrence,
    status: 'completed',
    completedAt: now,
    completedByMemberId,
  };

  const template = templates.find((candidate) => candidate.id === occurrence.templateId);
  const nextOccurrence = template
    ? buildNextChoreOccurrence(template, completed, newOccurrenceId, now)
    : undefined;

  const updatedOccurrences = occurrences.map((candidate) =>
    candidate.id === occurrenceId ? completed : candidate,
  );

  return {
    templates,
    occurrences: nextOccurrence ? [nextOccurrence, ...updatedOccurrences] : updatedOccurrences,
  };
}
