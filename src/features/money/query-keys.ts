export const moneyKeys = {
  expenses: (householdId: string | undefined) => ['money', 'expenses', householdId] as const,
  settlements: (householdId: string | undefined) => ['money', 'settlements', householdId] as const,
  bills: (householdId: string | undefined) => ['money', 'bills', householdId] as const,
};
