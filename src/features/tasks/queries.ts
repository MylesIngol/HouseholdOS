import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useMyHousehold } from '@/features/household/queries';

import {
  completeChoreOccurrence,
  createChoreTemplate,
  deleteOneTimeChore,
  fetchChoreOccurrences,
  fetchChoreTemplates,
  stopChoreTemplate,
  undoChoreCompletion,
  updateChoreTemplate,
} from './api';
import { tasksKeys } from './query-keys';
import type { ChoreTemplatePatch, NewChoreInput } from './types';

export function useChoreTemplates() {
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useQuery({
    queryKey: tasksKeys.templates(householdId),
    queryFn: () => fetchChoreTemplates(householdId!),
    enabled: !!householdId,
  });
}

export function useChoreOccurrences() {
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useQuery({
    queryKey: tasksKeys.occurrences(householdId),
    queryFn: () => fetchChoreOccurrences(householdId!),
    enabled: !!householdId,
  });
}

function useInvalidateTasks() {
  const queryClient = useQueryClient();
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return () => {
    queryClient.invalidateQueries({ queryKey: tasksKeys.templates(householdId) });
    queryClient.invalidateQueries({ queryKey: tasksKeys.occurrences(householdId) });
  };
}

export function useAddChore() {
  const { data: household } = useMyHousehold();
  const householdId = household?.id;
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: (input: NewChoreInput) => createChoreTemplate(householdId!, input),
    onSuccess: invalidate,
  });
}

export function useUpdateChore() {
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: ({
      id,
      patch,
      explicitCurrentAssigneeId,
    }: {
      id: string;
      patch: ChoreTemplatePatch;
      explicitCurrentAssigneeId?: string;
    }) => updateChoreTemplate(id, patch, explicitCurrentAssigneeId),
    onSuccess: invalidate,
  });
}

export function useStopChore() {
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: (id: string) => stopChoreTemplate(id),
    onSuccess: invalidate,
  });
}

export function useDeleteOneTimeChore() {
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: (templateId: string) => deleteOneTimeChore(templateId),
    onSuccess: invalidate,
  });
}

export type CompleteOccurrenceResult = {
  occurrenceId: string;
  generatedOccurrenceId: string | undefined;
};

/** The server determines the next assignee/due date and generates at most one next occurrence (plan section 8) — this hook just surfaces its result for the "Undo" affordance. */
export function useCompleteOccurrence() {
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: async (occurrenceId: string): Promise<CompleteOccurrenceResult> => {
      const generatedOccurrenceId = await completeChoreOccurrence(occurrenceId);
      return { occurrenceId, generatedOccurrenceId: generatedOccurrenceId ?? undefined };
    },
    onSuccess: invalidate,
  });
}

export function useUndoChoreCompletion() {
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: ({ occurrenceId, generatedOccurrenceId }: CompleteOccurrenceResult) =>
      undoChoreCompletion(occurrenceId, generatedOccurrenceId),
    onSuccess: invalidate,
  });
}
