export const kitchenKeys = {
  items: (householdId: string | undefined) => ['kitchen', 'items', householdId] as const,
  groceryItems: (householdId: string | undefined) =>
    ['kitchen', 'groceryItems', householdId] as const,
};
