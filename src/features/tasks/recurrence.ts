import type { ChoreRecurrence } from './types';

// -----------------------------------------------------------------------------
// Pure recurrence date math — no React/store dependency, exercised directly
// by `node --experimental-strip-types --test`. Deliberately simple: daily,
// weekly, monthly only, no complex recurrence-rule engine.
// -----------------------------------------------------------------------------

function parseIsoDate(isoDate: string): Date {
  // Constructed from parts (not `new Date(isoString)`) so this is always
  // local-time, matching the same approach Kitchen's expiration.ts uses —
  // parsing the ISO string directly would treat it as UTC and could shift
  // the date by a day depending on the device's timezone.
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds `months` calendar months to `isoDate`, clamped to the target month's
 * last valid day rather than letting the day-of-month overflow into the
 * month after (`new Date(y, m, 31)` for a 28/29/30-day month silently rolls
 * forward — wrong for a due date). Documented rule for the ambiguous case:
 * Jan 31 + 1 month -> Feb 28 (or Feb 29 in a leap year), Mar 31 + 1 month ->
 * Apr 30. Handles year boundaries for free since it operates on a real Date.
 */
export function addMonthsClamped(isoDate: string, months: number): string {
  const date = parseIsoDate(isoDate);
  const originalDay = date.getDate();
  const targetMonthIndex = date.getMonth() + months;
  const targetYear = date.getFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(originalDay, daysInTargetMonth);
  return toIsoDate(new Date(targetYear, targetMonth, clampedDay));
}

export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Today's date as an ISO string — the default anchor when a chore has no prior due date to advance from. */
export function todayIso(referenceDate: Date = new Date()): string {
  return toIsoDate(referenceDate);
}

/**
 * The next due date after `currentDueDate`, per `recurrence`. Returns
 * `undefined` for `'none'` (one-time chores never get a next occurrence) and
 * when `currentDueDate` is itself undefined (nothing to advance from).
 */
export function getNextDueDate(
  currentDueDate: string | undefined,
  recurrence: ChoreRecurrence,
): string | undefined {
  if (!currentDueDate || recurrence === 'none') return undefined;
  switch (recurrence) {
    case 'daily':
      return addDays(currentDueDate, 1);
    case 'weekly':
      return addDays(currentDueDate, 7);
    case 'monthly':
      return addMonthsClamped(currentDueDate, 1);
  }
}
