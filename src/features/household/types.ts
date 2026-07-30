// -----------------------------------------------------------------------------
// Household members — the single canonical identity source for the whole
// app. Kitchen, Money, and Tasks all reference these records instead of
// keeping their own copies, so a person's identity can never drift between
// features. This module intentionally owns nothing else (no auth, no
// invitations, no household switching) — see store.ts for what's in scope
// this milestone.
// -----------------------------------------------------------------------------

export type HouseholdMember = {
  id: string;
  name: string;
  /** Falls back to initials derived from `name` when absent. */
  initials?: string;
  isCurrentUser: boolean;
};
