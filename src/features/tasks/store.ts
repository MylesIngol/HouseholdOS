import { create } from 'zustand';

import { applyCompleteOccurrence, applyTemplateAssignmentUpdate } from './completion.ts';
import {
  choreOccurrences as seedOccurrences,
  choreTemplates as seedTemplates,
} from './mock-data.ts';
import { todayIso } from './recurrence.ts';
import type { ChoreOccurrence, ChoreTemplate, ChoreTemplatePatch, NewChoreInput } from './types';

// Local-only state for this milestone — kept as the single source of truth
// for Tasks domain data, same discipline as Kitchen/Money: only source
// records (templates + occurrences) live here, every due/urgency/history
// view is a pure selector call over this data (see selectors.ts), so nothing
// derived can drift out of sync.

function generateId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Tracks the single most recent completion so a brief "Undo" affordance can reverse it — cleared on the next completion or an explicit dismissal, never persisted as a history stack. */
type LastCompletion = {
  occurrenceId: string;
  generatedOccurrenceId?: string;
};

type TasksState = {
  templates: ChoreTemplate[];
  occurrences: ChoreOccurrence[];
  lastCompletion: LastCompletion | undefined;

  addChore: (input: NewChoreInput) => void;
  /**
   * Edits the template. Title/description changes only ever affect future
   * occurrences (the current occurrence's snapshot is untouched). Assignee
   * and rotation-list changes are different: they also update the current
   * *open* occurrence's `assignedMemberId` immediately, so My Tasks /
   * Household reflect a responsibility change right away instead of only on
   * the next completion:
   * - fixed: the occurrence always follows the new `patch.assigneeId`.
   * - rotating: `explicitCurrentAssigneeId` (from the edit sheet's explicit
   *   "currently assigned to" control) wins if provided and still eligible;
   *   otherwise the occurrence keeps its existing assignee if they're still
   *   in the new rotation list, or falls back to the first member if not.
   * Due dates and completed history are never touched. No-op if the
   * template doesn't exist.
   */
  updateChore: (id: string, patch: ChoreTemplatePatch, explicitCurrentAssigneeId?: string) => void;
  /**
   * Stops a recurring chore: the template becomes inactive, its current open
   * occurrence is removed, and no further occurrences are ever generated.
   * Completed history is untouched. No-ops if the template doesn't exist or
   * is already inactive.
   */
  stopChore: (id: string) => void;
  /** Deletes a one-time chore's template and occurrence — only while that occurrence is still open (never removes completed history). No-ops otherwise. */
  deleteOneTimeChore: (templateId: string) => void;
  /**
   * Completes an occurrence and, for an active recurring template, generates
   * the next one in the same step. No-ops if the occurrence doesn't exist or
   * is already completed, so this can never double-generate a next
   * occurrence for the same completion.
   */
  completeOccurrence: (occurrenceId: string, completedByMemberId: string) => void;
  /** Reverses the single most recent completion, including removing any occurrence it generated. No-ops once dismissed or superseded by another completion. */
  undoLastCompletion: () => void;
  dismissLastCompletion: () => void;
};

export const useTasksStore = create<TasksState>((set, get) => ({
  templates: seedTemplates,
  occurrences: seedOccurrences,
  lastCompletion: undefined,

  addChore: (input) => {
    const title = input.title.trim();
    if (!title) return;

    const firstAssignee =
      input.assignmentType === 'fixed' ? input.assigneeId : input.rotationMemberIds?.[0];
    if (!firstAssignee) return;
    if (input.assignmentType === 'rotating' && (input.rotationMemberIds?.length ?? 0) === 0) return;

    const now = new Date().toISOString();
    const templateId = generateId();
    const description = input.description?.trim() || undefined;

    const template: ChoreTemplate = {
      id: templateId,
      title,
      description,
      assignmentType: input.assignmentType,
      assigneeId: input.assignmentType === 'fixed' ? input.assigneeId : undefined,
      rotationMemberIds: input.assignmentType === 'rotating' ? input.rotationMemberIds : undefined,
      recurrence: input.recurrence,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    const occurrence: ChoreOccurrence = {
      id: generateId(),
      templateId,
      title,
      description,
      assignedMemberId: firstAssignee,
      dueDate: input.dueDate ?? (input.recurrence === 'none' ? undefined : todayIso()),
      status: 'open',
      createdAt: now,
    };

    set((state) => ({
      templates: [template, ...state.templates],
      occurrences: [occurrence, ...state.occurrences],
    }));
  },

  updateChore: (id, patch, explicitCurrentAssigneeId) => {
    const template = get().templates.find((candidate) => candidate.id === id);
    if (!template) return;

    const updatedTemplate: ChoreTemplate = {
      ...template,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      templates: state.templates.map((candidate) =>
        candidate.id === id ? updatedTemplate : candidate,
      ),
      occurrences: applyTemplateAssignmentUpdate(
        state.occurrences,
        id,
        updatedTemplate,
        explicitCurrentAssigneeId,
      ),
    }));
  },

  stopChore: (id) => {
    const template = get().templates.find((candidate) => candidate.id === id);
    if (!template || !template.active) return;

    const now = new Date().toISOString();
    set((state) => ({
      templates: state.templates.map((candidate) =>
        candidate.id === id ? { ...candidate, active: false, updatedAt: now } : candidate,
      ),
      occurrences: state.occurrences.filter(
        (occurrence) => !(occurrence.templateId === id && occurrence.status === 'open'),
      ),
    }));
  },

  deleteOneTimeChore: (templateId) => {
    const template = get().templates.find((candidate) => candidate.id === templateId);
    if (!template || template.recurrence !== 'none') return;

    const occurrence = get().occurrences.find((candidate) => candidate.templateId === templateId);
    if (!occurrence || occurrence.status !== 'open') return;

    set((state) => ({
      templates: state.templates.filter((candidate) => candidate.id !== templateId),
      occurrences: state.occurrences.filter((candidate) => candidate.templateId !== templateId),
    }));
  },

  completeOccurrence: (occurrenceId, completedByMemberId) => {
    const now = new Date().toISOString();
    const newOccurrenceId = generateId();
    const result = applyCompleteOccurrence(
      get().templates,
      get().occurrences,
      occurrenceId,
      completedByMemberId,
      now,
      newOccurrenceId,
    );
    if (!result) return;

    const generated = result.occurrences.some((occurrence) => occurrence.id === newOccurrenceId);
    set({
      templates: result.templates,
      occurrences: result.occurrences,
      lastCompletion: {
        occurrenceId,
        generatedOccurrenceId: generated ? newOccurrenceId : undefined,
      },
    });
  },

  undoLastCompletion: () => {
    const lastCompletion = get().lastCompletion;
    if (!lastCompletion) return;

    set((state) => ({
      occurrences: state.occurrences
        .filter((occurrence) => occurrence.id !== lastCompletion.generatedOccurrenceId)
        .map((occurrence): ChoreOccurrence =>
          occurrence.id === lastCompletion.occurrenceId
            ? {
                ...occurrence,
                status: 'open' as const,
                completedAt: undefined,
                completedByMemberId: undefined,
              }
            : occurrence,
        ),
      lastCompletion: undefined,
    }));
  },

  dismissLastCompletion: () => {
    set({ lastCompletion: undefined });
  },
}));
