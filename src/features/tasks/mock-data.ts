import type { ChoreOccurrence, ChoreTemplate } from './types';

// Local mock data only — no backend yet. Dates are generated relative to
// "now" so overdue/due-today/history examples stay meaningful no matter when
// this runs. Member ids ('you', 'bella', 'karyn', 'nat') match the shared
// household roster in src/features/household/mock-data.ts.

function isoDaysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoTimestampDaysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export const choreTemplates: ChoreTemplate[] = [
  {
    id: 'template-trash',
    title: 'Take Out Trash',
    assignmentType: 'rotating',
    rotationMemberIds: ['you', 'bella', 'karyn', 'nat'],
    recurrence: 'weekly',
    active: true,
    createdAt: isoTimestampDaysFromToday(-30),
    updatedAt: isoTimestampDaysFromToday(-30),
  },
  {
    id: 'template-dishwasher',
    title: 'Load Dishwasher',
    assignmentType: 'fixed',
    assigneeId: 'you',
    recurrence: 'daily',
    active: true,
    createdAt: isoTimestampDaysFromToday(-14),
    updatedAt: isoTimestampDaysFromToday(-14),
  },
  {
    id: 'template-vacuum',
    title: 'Vacuum Living Room',
    description: 'Whole room, including under the couch cushions.',
    assignmentType: 'fixed',
    assigneeId: 'bella',
    recurrence: 'none',
    active: true,
    createdAt: isoTimestampDaysFromToday(-1),
    updatedAt: isoTimestampDaysFromToday(-1),
  },
  {
    id: 'template-bathroom',
    title: 'Clean Bathroom',
    assignmentType: 'rotating',
    rotationMemberIds: ['you', 'nat'],
    recurrence: 'weekly',
    active: true,
    createdAt: isoTimestampDaysFromToday(-21),
    updatedAt: isoTimestampDaysFromToday(-21),
  },
];

export const choreOccurrences: ChoreOccurrence[] = [
  // Take Out Trash — two completed weeks (rotating you -> bella -> karyn),
  // current occurrence open with Karyn up next. Mirrors the exact example
  // from the product spec: history preserved per-occurrence, one template.
  {
    id: 'occ-trash-1',
    templateId: 'template-trash',
    title: 'Take Out Trash',
    assignedMemberId: 'you',
    dueDate: isoDaysFromToday(-14),
    status: 'completed',
    completedAt: isoTimestampDaysFromToday(-14),
    completedByMemberId: 'you',
    createdAt: isoTimestampDaysFromToday(-15),
  },
  {
    id: 'occ-trash-2',
    templateId: 'template-trash',
    title: 'Take Out Trash',
    assignedMemberId: 'bella',
    dueDate: isoDaysFromToday(-7),
    status: 'completed',
    completedAt: isoTimestampDaysFromToday(-7),
    completedByMemberId: 'bella',
    createdAt: isoTimestampDaysFromToday(-8),
  },
  {
    id: 'occ-trash-3',
    templateId: 'template-trash',
    title: 'Take Out Trash',
    assignedMemberId: 'karyn',
    dueDate: isoDaysFromToday(2),
    status: 'open',
    createdAt: isoTimestampDaysFromToday(-1),
  },

  // Load Dishwasher — daily, fixed to You. Yesterday's is done; today's is open.
  {
    id: 'occ-dishwasher-1',
    templateId: 'template-dishwasher',
    title: 'Load Dishwasher',
    assignedMemberId: 'you',
    dueDate: isoDaysFromToday(-1),
    status: 'completed',
    completedAt: isoTimestampDaysFromToday(-1),
    completedByMemberId: 'you',
    createdAt: isoTimestampDaysFromToday(-2),
  },
  {
    id: 'occ-dishwasher-2',
    templateId: 'template-dishwasher',
    title: 'Load Dishwasher',
    assignedMemberId: 'you',
    dueDate: isoDaysFromToday(0),
    status: 'open',
    createdAt: isoTimestampDaysFromToday(-1),
  },

  // Vacuum Living Room — one-time, still open. Completing it generates no
  // next occurrence.
  {
    id: 'occ-vacuum-1',
    templateId: 'template-vacuum',
    title: 'Vacuum Living Room',
    description: 'Whole room, including under the couch cushions.',
    assignedMemberId: 'bella',
    dueDate: isoDaysFromToday(1),
    status: 'open',
    createdAt: isoTimestampDaysFromToday(-1),
  },

  // Clean Bathroom — overdue, so both Tasks and Home have a real overdue
  // example to render.
  {
    id: 'occ-bathroom-1',
    templateId: 'template-bathroom',
    title: 'Clean Bathroom',
    assignedMemberId: 'nat',
    dueDate: isoDaysFromToday(-2),
    status: 'open',
    createdAt: isoTimestampDaysFromToday(-9),
  },
];
