import { create } from 'zustand';

import { householdMembers as seedMembers } from './mock-data';
import type { HouseholdMember } from './types';

// Local-only state for this milestone. Deliberately minimal — no
// add/edit/remove-member actions yet, since invitations, auth, profiles, and
// household switching are all explicitly out of scope. The point of this
// store existing at all (rather than a plain exported array) is the seam: a
// future Supabase-backed household-membership source can replace the body of
// this file with an async-loaded version, and every feature that reads
// `useHouseholdStore((state) => state.members)` keeps working unchanged.

type HouseholdState = {
  members: HouseholdMember[];
};

export const useHouseholdStore = create<HouseholdState>(() => ({
  members: seedMembers,
}));
