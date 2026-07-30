import { getMemberName } from '@/features/household/selectors';
import type { HouseholdMember } from '@/features/household/types';

import type { ChoreOccurrence, ChoreRecurrence } from './types';

// Formatting/presentation helpers — kept separate from recurrence.ts and
// completion.ts (which only calculate) so calculation logic never has to
// think about human-readable copy, mirroring Money's calc/display split.

function daysBetween(targetIso: string, referenceDate: Date): number {
  const [year, month, day] = targetIso.split('-').map(Number);
  const target = new Date(year, (month ?? 1) - 1, day ?? 1);
  const reference = new Date(referenceDate);
  reference.setHours(0, 0, 0, 0);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - reference.getTime()) / msPerDay);
}

function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** "Overdue", "Due today", "Due tomorrow", "Due in 4 days", a short date once it's far enough out, or "No due date". */
export function formatDueLabel(
  dueDate: string | undefined,
  referenceDate: Date = new Date(),
): string {
  if (!dueDate) return 'No due date';
  const days = daysBetween(dueDate, referenceDate);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 6) return `Due in ${days} days`;
  return `Due ${formatShortDate(dueDate)}`;
}

/** "Today", "Yesterday", "3 days ago", or a short date — for the history view. */
export function formatCompletedLabel(
  completedAt: string | undefined,
  referenceDate: Date = new Date(),
): string {
  if (!completedAt) return '';
  const isoDate = completedAt.slice(0, 10);
  const days = daysBetween(isoDate, referenceDate);
  if (days === 0) return 'Today';
  if (days === -1) return 'Yesterday';
  if (days < -1 && days >= -6) return `${Math.abs(days)} days ago`;
  return formatShortDate(isoDate);
}

export function getRecurrenceLabel(recurrence: ChoreRecurrence): string {
  switch (recurrence) {
    case 'none':
      return 'One-time';
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
  }
}

/** "You" for the current user, otherwise the member's name — never exposes ids. */
export function getOccurrenceAssigneeLabel(
  occurrence: ChoreOccurrence,
  members: HouseholdMember[],
): string {
  return getMemberName(occurrence.assignedMemberId, members);
}

export function getOccurrenceCompleterLabel(
  occurrence: ChoreOccurrence,
  members: HouseholdMember[],
): string | undefined {
  if (!occurrence.completedByMemberId) return undefined;
  return getMemberName(occurrence.completedByMemberId, members);
}
