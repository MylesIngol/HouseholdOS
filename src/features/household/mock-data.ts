import type { HouseholdMember } from './types';

// Local mock data only — no backend yet. This is the one household roster
// every feature reads from. Previously Kitchen (You/Sam) and Money
// (You/Bella/Karyn/Nat) each kept their own mock roster; this consolidates
// on Money's, since it already carries the richer shape (`initials`,
// `isCurrentUser`) and was used across more of the app.

export const householdMembers: HouseholdMember[] = [
  { id: 'you', name: 'You', isCurrentUser: true },
  { id: 'bella', name: 'Bella', initials: 'B', isCurrentUser: false },
  { id: 'karyn', name: 'Karyn', initials: 'K', isCurrentUser: false },
  { id: 'nat', name: 'Nat', initials: 'N', isCurrentUser: false },
];
