import type { HouseholdMember } from './types';

// Pure helpers over a plain member array — no store dependency, so Kitchen,
// Money, and Tasks can all call the same logic instead of repeating
// `.find(m => m.isCurrentUser)` in every screen.

export function getCurrentUser(members: HouseholdMember[]): HouseholdMember | undefined {
  return members.find((member) => member.isCurrentUser);
}

export function getMemberName(memberId: string, members: HouseholdMember[]): string {
  const member = members.find((candidate) => candidate.id === memberId);
  if (!member) return 'Someone';
  return member.isCurrentUser ? 'You' : member.name;
}
