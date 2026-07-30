export const tasksKeys = {
  templates: (householdId: string | undefined) => ['tasks', 'templates', householdId] as const,
  occurrences: (householdId: string | undefined) => ['tasks', 'occurrences', householdId] as const,
};
