export const householdKeys = {
  mine: (userId: string | undefined) => ['household', 'mine', userId] as const,
  members: (householdId: string | undefined) => ['household', householdId, 'members'] as const,
  invite: (householdId: string | undefined) => ['household', householdId, 'invite'] as const,
  isOwner: (householdId: string | undefined, userId: string | undefined) =>
    ['household', householdId, 'isOwner', userId] as const,
};
