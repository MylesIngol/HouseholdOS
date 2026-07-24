import type { Chore } from './types';

// Local mock data only — no backend yet.

export const chores: Chore[] = [
  {
    id: '1',
    title: 'Take out trash',
    assignee: 'You',
    dueLabel: 'Due tonight',
    dueToday: true,
    completed: false,
  },
  {
    id: '2',
    title: 'Load dishwasher',
    assignee: 'You',
    dueLabel: 'Today',
    dueToday: true,
    completed: true,
  },
  {
    id: '3',
    title: 'Vacuum living room',
    assignee: 'Sam',
    dueLabel: 'Tomorrow',
    dueToday: false,
    completed: false,
  },
];

export const choresDueToday = chores.filter((chore) => chore.dueToday);
export const upcomingChores = chores.filter((chore) => !chore.dueToday);
export const choresLeftThisWeek = chores.filter((chore) => !chore.completed).length;
export const nextChore = chores.find((chore) => chore.dueToday && !chore.completed);
