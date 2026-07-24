export const exampleKeys = {
  all: ['example'] as const,
  list: () => [...exampleKeys.all, 'list'] as const,
};
