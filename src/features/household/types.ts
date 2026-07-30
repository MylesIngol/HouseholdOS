// -----------------------------------------------------------------------------
// Household members — the single canonical identity source for the whole
// app. Kitchen, Money, and Tasks all reference these records instead of
// keeping their own copies, so a person's identity can never drift between
// features. This module intentionally owns nothing else (no auth, no
// invitations, no household switching) — see store.ts for what's in scope
// this milestone.
// -----------------------------------------------------------------------------

export type HouseholdMember = {
  /** = household_members.id — the value used everywhere in Kitchen/Money/Tasks (payer, assignee, owner, etc). */
  id: string;
  /** = profiles.id / auth user id. Only needed for "is this my account" checks — pure domain selectors never read this. */
  userId: string;
  name: string;
  /** Falls back to initials derived from `name` when absent. */
  initials?: string;
  isCurrentUser: boolean;
};

export type Household = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type HouseholdInvite = {
  id: string;
  householdId: string;
  code: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  maxUses: number;
  useCount: number;
};
