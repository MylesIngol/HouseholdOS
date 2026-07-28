import type { ParticipantShare, SplitMode } from './types';

// -----------------------------------------------------------------------------
// Pure cents-based money math. No React/React Native imports here on purpose —
// this file (and balances.ts) is exercised directly by
// `node --experimental-strip-types --test`, no bundler required. Every
// monetary value in this module is an integer number of cents; nothing here
// does floating-point arithmetic on dollar amounts.
// -----------------------------------------------------------------------------

/**
 * Splits `totalCents` evenly across `participantIds`, distributing the
 * remainder one cent at a time to the first participants in the given order
 * so the shares always sum to exactly `totalCents` — e.g. $10.00 among 3
 * people is $3.34 / $3.33 / $3.33, never $3.33 / $3.33 / $3.33 ($9.99).
 */
export function splitEqualCents(totalCents: number, participantIds: string[]): ParticipantShare[] {
  const n = participantIds.length;
  if (n === 0) return [];

  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;

  return participantIds.map((memberId, index) => ({
    memberId,
    amountCents: base + (index < remainder ? 1 : 0),
  }));
}

export function sumShareCents(shares: ParticipantShare[]): number {
  return shares.reduce((sum, share) => sum + share.amountCents, 0);
}

/**
 * A custom split is valid when every entered share is a non-negative whole
 * number of cents, every participant has an entry, and the shares sum to
 * exactly the total — no rounding slack allowed, since these are the amounts
 * that become recorded debt.
 */
export function isValidCustomSplit(
  totalCents: number,
  participantIds: string[],
  shares: ParticipantShare[],
): boolean {
  if (shares.length !== participantIds.length) return false;
  if (shares.some((share) => !Number.isInteger(share.amountCents) || share.amountCents < 0)) {
    return false;
  }

  const participantSet = new Set(participantIds);
  const shareMemberIds = new Set(shares.map((share) => share.memberId));
  if (shareMemberIds.size !== shares.length) return false; // no duplicate participants
  for (const id of shareMemberIds) {
    if (!participantSet.has(id)) return false;
  }

  return sumShareCents(shares) === totalCents;
}

/**
 * Resolves the final per-participant shares for an expense or bill at save
 * time. For 'equal' this always succeeds; for 'custom' the caller is
 * expected to have already validated via `isValidCustomSplit` — this simply
 * normalizes ordering to match `participantIds`.
 */
export function resolveShares(
  mode: SplitMode,
  totalCents: number,
  participantIds: string[],
  customShares?: ParticipantShare[],
): ParticipantShare[] {
  if (mode === 'equal') {
    return splitEqualCents(totalCents, participantIds);
  }

  const byMemberId = new Map(
    (customShares ?? []).map((share) => [share.memberId, share.amountCents]),
  );
  return participantIds.map((memberId) => ({
    memberId,
    amountCents: byMemberId.get(memberId) ?? 0,
  }));
}

/**
 * Parses a user-entered dollar amount (e.g. "12.4", "12.40", "12") into
 * whole cents without floating-point rounding error. Returns undefined for
 * anything that isn't a valid non-negative amount with at most 2 decimal
 * places.
 */
export function dollarsToCents(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return undefined;

  const [wholePart, decimalPart = ''] = trimmed.split('.');
  const paddedDecimal = (decimalPart + '00').slice(0, 2);
  return Number(wholePart) * 100 + Number(paddedDecimal);
}

/** The inverse of `dollarsToCents`, for pre-filling an editable amount field. Not for display formatting — see display.ts for that. */
export function centsToDollarsInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function isValidSettlementAmount(
  amountCents: number,
  fromMemberId: string,
  toMemberId: string,
): boolean {
  return Number.isInteger(amountCents) && amountCents > 0 && fromMemberId !== toMemberId;
}
