// -----------------------------------------------------------------------------
// Chore data model
//
// A ChoreTemplate is the reusable "setup" (title, who's responsible, how
// often it repeats). A ChoreOccurrence is one specific instance of that
// chore — completing one never overwrites it; a new occurrence is generated
// instead. This is what lets "Take Out Trash" show a clean history (July 7
// completed by Myles, July 14 by Bella, July 21 assigned to Karyn) under one
// template rather than one row being repeatedly overwritten.
//
// At most one occurrence per template is ever `open` at a time — that
// occurrence *is* "who's currently responsible for this chore." Everything
// else belonging to the template is `completed` history and is never
// rewritten once written.
// -----------------------------------------------------------------------------

export type AssignmentType = 'fixed' | 'rotating';

/** 'none' means one-time — no next occurrence is ever generated after completion. */
export type ChoreRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export type ChoreTemplate = {
  id: string;
  title: string;
  description?: string;
  assignmentType: AssignmentType;
  /** Required when assignmentType === 'fixed'. Every generated occurrence copies this unchanged. */
  assigneeId?: string;
  /**
   * Required when assignmentType === 'rotating'. Ordered list of eligible
   * member ids — rotation always advances through this exact order and
   * wraps after the last member. Editing this list only affects the next
   * occurrence generated after the edit; it never rewrites past occurrences
   * (see `getNextRotationAssignee` in completion.ts for the exact rule used
   * when the previous assignee is no longer in the list).
   */
  rotationMemberIds?: string[];
  recurrence: ChoreRecurrence;
  /**
   * false once the chore has been "stopped" — no further occurrences are
   * generated, but the template and all of its completed history stay in
   * place forever. Not used for one-time chores (they simply run out of
   * open occurrences once completed).
   */
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OccurrenceStatus = 'open' | 'completed';

export type ChoreOccurrence = {
  id: string;
  templateId: string;
  /** Snapshotted from the template when this occurrence was created, so history never depends on the template still existing or being unedited. */
  title: string;
  description?: string;
  assignedMemberId: string;
  /** ISO date string (yyyy-mm-dd). Optional — a one-time chore with no due date is allowed. */
  dueDate?: string;
  status: OccurrenceStatus;
  completedAt?: string;
  /** Normally equals assignedMemberId, but the model supports someone else completing it. */
  completedByMemberId?: string;
  createdAt: string;
};

// -----------------------------------------------------------------------------
// Inputs
// -----------------------------------------------------------------------------

export type NewChoreInput = {
  title: string;
  description?: string;
  assignmentType: AssignmentType;
  assigneeId?: string;
  rotationMemberIds?: string[];
  recurrence: ChoreRecurrence;
  /** Required unless recurrence === 'none', in which case it's optional. Defaults to today when omitted. */
  dueDate?: string;
};

/**
 * Fields editable on an active template. `title`/`description` changes only
 * ever affect *future* occurrences — the currently-open occurrence keeps its
 * existing snapshotted title/description until it's completed. `assigneeId`/
 * `rotationMemberIds`/`assignmentType` changes are different: they also
 * update the current *open* occurrence's assignee immediately (see
 * `applyTemplateAssignmentUpdate` in completion.ts), so My Tasks / Household
 * reflect a responsibility change right away instead of only on the next
 * completion. Due dates and completed history are never touched by any of
 * this. `recurrence` itself is deliberately excluded from this patch type —
 * it's fixed at creation, mirroring how a Bill's recurrence is locked after
 * creation in Money.
 */
export type ChoreTemplatePatch = Partial<
  Pick<
    ChoreTemplate,
    'title' | 'description' | 'assignmentType' | 'assigneeId' | 'rotationMemberIds'
  >
>;
