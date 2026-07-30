import type { HouseholdMember } from './types';

export function getMemberInitials(member: HouseholdMember): string {
  if (member.initials) return member.initials;
  return member.name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
