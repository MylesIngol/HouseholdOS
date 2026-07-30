import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getChoreHistory,
  getDueUrgency,
  getHouseholdOpenOccurrences,
  getMyOpenOccurrences,
  getOverdueCount,
} from './selectors.ts';
import type { ChoreOccurrence } from './types.ts';

const referenceDate = new Date('2026-07-27T09:00:00.000Z');

function makeOccurrence(overrides: Partial<ChoreOccurrence> = {}): ChoreOccurrence {
  return {
    id: 'occ-1',
    templateId: 'template-1',
    title: 'Take Out Trash',
    assignedMemberId: 'you',
    dueDate: '2026-07-27',
    status: 'open',
    createdAt: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

test('a due date in the past is overdue', () => {
  assert.equal(getDueUrgency('2026-07-25', referenceDate), 'overdue');
});

test('a due date of today is due_today', () => {
  assert.equal(getDueUrgency('2026-07-27', referenceDate), 'due_today');
});

test('a due date of tomorrow is due_tomorrow', () => {
  assert.equal(getDueUrgency('2026-07-28', referenceDate), 'due_tomorrow');
});

test('a due date further out is upcoming', () => {
  assert.equal(getDueUrgency('2026-08-05', referenceDate), 'upcoming');
});

test('no due date has no urgency', () => {
  assert.equal(getDueUrgency(undefined, referenceDate), undefined);
});

test("getMyOpenOccurrences only returns the current user's open occurrences, sorted by urgency", () => {
  const occurrences = [
    makeOccurrence({ id: 'a', assignedMemberId: 'you', dueDate: '2026-08-05' }),
    makeOccurrence({ id: 'b', assignedMemberId: 'you', dueDate: '2026-07-25' }), // overdue
    makeOccurrence({ id: 'c', assignedMemberId: 'bella', dueDate: '2026-07-25' }),
    makeOccurrence({
      id: 'd',
      assignedMemberId: 'you',
      status: 'completed',
      dueDate: '2026-07-20',
    }),
  ];

  const mine = getMyOpenOccurrences(occurrences, 'you', referenceDate);
  assert.deepEqual(
    mine.map((o) => o.id),
    ['b', 'a'],
  );
});

test('getHouseholdOpenOccurrences excludes the current user', () => {
  const occurrences = [
    makeOccurrence({ id: 'a', assignedMemberId: 'you' }),
    makeOccurrence({ id: 'b', assignedMemberId: 'bella' }),
  ];
  const household = getHouseholdOpenOccurrences(occurrences, 'you', referenceDate);
  assert.deepEqual(
    household.map((o) => o.id),
    ['b'],
  );
});

test('getChoreHistory returns only completed occurrences, most recent first', () => {
  const occurrences = [
    makeOccurrence({ id: 'a', status: 'completed', completedAt: '2026-07-20T00:00:00.000Z' }),
    makeOccurrence({ id: 'b', status: 'open' }),
    makeOccurrence({ id: 'c', status: 'completed', completedAt: '2026-07-25T00:00:00.000Z' }),
  ];
  const history = getChoreHistory(occurrences);
  assert.deepEqual(
    history.map((o) => o.id),
    ['c', 'a'],
  );
});

test("getOverdueCount counts only the current user's overdue open occurrences", () => {
  const occurrences = [
    makeOccurrence({ id: 'a', assignedMemberId: 'you', dueDate: '2026-07-25' }),
    makeOccurrence({ id: 'b', assignedMemberId: 'you', dueDate: '2026-08-05' }),
    makeOccurrence({ id: 'c', assignedMemberId: 'bella', dueDate: '2026-07-20' }),
  ];
  assert.equal(getOverdueCount(occurrences, 'you', referenceDate), 1);
});
