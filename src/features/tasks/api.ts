import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

import type {
  AssignmentType,
  ChoreOccurrence,
  ChoreRecurrence,
  ChoreTemplate,
  ChoreTemplatePatch,
  NewChoreInput,
  OccurrenceStatus,
} from './types';

// Thin wrappers over supabase-js, same shape as household/kitchen's api.ts.
// Unlike Kitchen, every write here goes through a SECURITY DEFINER RPC (see
// the migration) rather than a plain insert/update/delete — there's no RLS
// write policy on any of the three chore tables to fall back to, by design.

type TemplateRow = Database['public']['Tables']['chore_templates']['Row'];
type OccurrenceRow = Database['public']['Tables']['chore_occurrences']['Row'];
type RotationRow = Database['public']['Tables']['chore_rotation_members']['Row'];

function mapTemplate(row: TemplateRow, rotationMemberIds: string[] | undefined): ChoreTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    assignmentType: row.assignment_type as AssignmentType,
    assigneeId: row.assignee_household_member_id ?? undefined,
    rotationMemberIds: row.assignment_type === 'rotating' ? (rotationMemberIds ?? []) : undefined,
    recurrence: row.recurrence as ChoreRecurrence,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOccurrence(row: OccurrenceRow): ChoreOccurrence {
  return {
    id: row.id,
    templateId: row.template_id,
    title: row.title,
    description: row.description ?? undefined,
    assignedMemberId: row.assigned_household_member_id,
    dueDate: row.due_date ?? undefined,
    status: row.status as OccurrenceStatus,
    completedAt: row.completed_at ?? undefined,
    completedByMemberId: row.completed_by_household_member_id ?? undefined,
    createdAt: row.created_at,
  };
}

export async function fetchChoreTemplates(householdId: string): Promise<ChoreTemplate[]> {
  const [templatesRes, rotationRes] = await Promise.all([
    supabase
      .from('chore_templates')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false }),
    supabase
      .from('chore_rotation_members')
      .select('*')
      .eq('household_id', householdId)
      .order('position', { ascending: true }),
  ]);

  if (templatesRes.error) throw templatesRes.error;
  if (rotationRes.error) throw rotationRes.error;

  const rotationByTemplate = new Map<string, string[]>();
  for (const row of (rotationRes.data ?? []) as RotationRow[]) {
    const list = rotationByTemplate.get(row.template_id) ?? [];
    list.push(row.household_member_id);
    rotationByTemplate.set(row.template_id, list);
  }

  return (templatesRes.data ?? []).map((row) => mapTemplate(row, rotationByTemplate.get(row.id)));
}

export async function fetchChoreOccurrences(householdId: string): Promise<ChoreOccurrence[]> {
  const { data, error } = await supabase
    .from('chore_occurrences')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapOccurrence);
}

export async function createChoreTemplate(
  householdId: string,
  input: NewChoreInput,
): Promise<void> {
  const { error } = await supabase.rpc('create_chore_template', {
    p_household_id: householdId,
    p_title: input.title.trim(),
    p_description: input.description?.trim() || null,
    p_assignment_type: input.assignmentType,
    p_assignee_member_id: input.assignmentType === 'fixed' ? (input.assigneeId ?? null) : null,
    p_rotation_member_ids: input.assignmentType === 'rotating' ? (input.rotationMemberIds ?? null) : null,
    p_recurrence: input.recurrence,
    p_due_date: input.dueDate ?? null,
  });
  if (error) throw error;
}

export async function updateChoreTemplate(
  templateId: string,
  patch: ChoreTemplatePatch,
  explicitCurrentAssigneeId?: string,
): Promise<void> {
  const { error } = await supabase.rpc('update_chore_template', {
    p_template_id: templateId,
    p_title: patch.title ?? null,
    p_description: patch.description ?? null,
    p_assignment_type: patch.assignmentType ?? null,
    p_assignee_member_id: patch.assigneeId ?? null,
    p_rotation_member_ids: patch.rotationMemberIds ?? null,
    p_explicit_current_assignee_id: explicitCurrentAssigneeId ?? null,
  });
  if (error) throw error;
}

export async function stopChoreTemplate(templateId: string): Promise<void> {
  const { error } = await supabase.rpc('stop_chore_template', { p_template_id: templateId });
  if (error) throw error;
}

export async function deleteOneTimeChore(templateId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_one_time_chore', { p_template_id: templateId });
  if (error) throw error;
}

/** Returns the newly generated occurrence's id, or `null` if none was generated — the caller uses this for the "Undo" affordance. */
export async function completeChoreOccurrence(occurrenceId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('complete_chore_occurrence', {
    p_occurrence_id: occurrenceId,
  });
  if (error) throw error;
  return data;
}

export async function undoChoreCompletion(
  occurrenceId: string,
  generatedOccurrenceId?: string,
): Promise<void> {
  const { error } = await supabase.rpc('undo_chore_completion', {
    p_occurrence_id: occurrenceId,
    p_generated_occurrence_id: generatedOccurrenceId ?? null,
  });
  if (error) throw error;
}
