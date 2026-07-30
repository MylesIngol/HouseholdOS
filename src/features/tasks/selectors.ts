import type { ChoreOccurrence } from './types';

// Pure functions over plain arrays — no store dependency, so they're usable
// from the Tasks store, the Tasks screen, and Home alike (mirrors Kitchen's
// expiration.ts / selectors.ts split). Urgency/status are always derived
// here, never stored on an occurrence.

export type DueUrgency = 'overdue' | 'due_today' | 'due_tomorrow' | 'upcoming';

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function daysUntil(isoDate: string, referenceDate: Date): number {
  const target = startOfDay(parseIsoDate(isoDate));
  const today = startOfDay(referenceDate);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

/** `undefined` when there's no due date at all — a chore with no due date carries no urgency badge. */
export function getDueUrgency(
  dueDate: string | undefined,
  referenceDate: Date = new Date(),
): DueUrgency | undefined {
  if (!dueDate) return undefined;
  const days = daysUntil(dueDate, referenceDate);
  if (days < 0) return 'overdue';
  if (days === 0) return 'due_today';
  if (days === 1) return 'due_tomorrow';
  return 'upcoming';
}

const URGENCY_RANK: Record<DueUrgency, number> = {
  overdue: 0,
  due_today: 1,
  due_tomorrow: 2,
  upcoming: 3,
};

/** Overdue first, then due today, due tomorrow, upcoming; no-due-date occurrences sort last. */
function sortByUrgency(
  occurrences: ChoreOccurrence[],
  referenceDate: Date = new Date(),
): ChoreOccurrence[] {
  return [...occurrences].sort((a, b) => {
    const urgencyA = getDueUrgency(a.dueDate, referenceDate);
    const urgencyB = getDueUrgency(b.dueDate, referenceDate);
    const rankA = urgencyA ? URGENCY_RANK[urgencyA] : 99;
    const rankB = urgencyB ? URGENCY_RANK[urgencyB] : 99;
    if (rankA !== rankB) return rankA - rankB;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return 0;
  });
}

export function getOpenOccurrences(occurrences: ChoreOccurrence[]): ChoreOccurrence[] {
  return occurrences.filter((occurrence) => occurrence.status === 'open');
}

/** Your open chores, prioritized by urgency — you shouldn't have to scan everyone else's list to find these. */
export function getMyOpenOccurrences(
  occurrences: ChoreOccurrence[],
  currentUserId: string,
  referenceDate: Date = new Date(),
): ChoreOccurrence[] {
  const mine = getOpenOccurrences(occurrences).filter(
    (occurrence) => occurrence.assignedMemberId === currentUserId,
  );
  return sortByUrgency(mine, referenceDate);
}

/** Everyone else's open chores — "who's responsible for what" without duplicating My Tasks. */
export function getHouseholdOpenOccurrences(
  occurrences: ChoreOccurrence[],
  currentUserId: string,
  referenceDate: Date = new Date(),
): ChoreOccurrence[] {
  const others = getOpenOccurrences(occurrences).filter(
    (occurrence) => occurrence.assignedMemberId !== currentUserId,
  );
  return sortByUrgency(others, referenceDate);
}

/** Completed occurrences, most recently completed first — the lightweight history view. */
export function getChoreHistory(occurrences: ChoreOccurrence[]): ChoreOccurrence[] {
  return occurrences
    .filter((occurrence) => occurrence.status === 'completed')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}

export function getOverdueCount(
  occurrences: ChoreOccurrence[],
  currentUserId: string,
  referenceDate: Date = new Date(),
): number {
  return getMyOpenOccurrences(occurrences, currentUserId, referenceDate).filter(
    (occurrence) => getDueUrgency(occurrence.dueDate, referenceDate) === 'overdue',
  ).length;
}
