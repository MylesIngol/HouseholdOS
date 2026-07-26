import type { ExpirationInfo } from './types';

// Reusable expiration logic — kept free of any store/React dependency so Home
// and future notifications can import it directly without pulling in Kitchen
// state.

export type ExpirationUrgency = 'expired' | 'today' | 'tomorrow' | 'soon' | 'normal';

const SOON_THRESHOLD_DAYS = 4;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** ISO date string `days` days from `referenceDate` — used for mock seed data and the expiration quick-pick. */
export function addDaysIso(days: number, referenceDate: Date = new Date()): string {
  const date = new Date(referenceDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysUntil(isoDate: string, referenceDate: Date = new Date()): number {
  const target = startOfDay(parseIsoDate(isoDate));
  const today = startOfDay(referenceDate);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

/** Classifies urgency the same way regardless of whether the date is exact or estimated. */
export function getExpirationUrgency(
  expiration: ExpirationInfo | undefined,
  referenceDate: Date = new Date(),
): ExpirationUrgency | undefined {
  if (!expiration) return undefined;

  const daysLeft = daysUntil(expiration.date, referenceDate);
  if (daysLeft < 0) return 'expired';
  if (daysLeft === 0) return 'today';
  if (daysLeft === 1) return 'tomorrow';
  if (daysLeft <= SOON_THRESHOLD_DAYS) return 'soon';
  return 'normal';
}

function formatShortDate(isoDate: string): string {
  return parseIsoDate(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Never claims false precision: exact dates read "Expires Jul 28", estimated
 * ones always read "Use within/by ~..." so the user knows it's a guess.
 */
export function formatExpirationLabel(
  expiration: ExpirationInfo,
  referenceDate: Date = new Date(),
): string {
  const daysLeft = daysUntil(expiration.date, referenceDate);
  const isExact = expiration.confidence === 'exact';

  if (daysLeft < 0) return isExact ? 'Expired' : 'Likely expired';
  if (daysLeft === 0) return isExact ? 'Expires today' : 'Use today';
  if (daysLeft === 1) return isExact ? 'Expires tomorrow' : 'Use by tomorrow';
  if (isExact) return `Expires ${formatShortDate(expiration.date)}`;
  return `Use within ~${daysLeft} days`;
}
