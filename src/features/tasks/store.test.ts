import assert from 'node:assert/strict';
import test from 'node:test';

import { getHouseholdOpenOccurrences, getMyOpenOccurrences } from './selectors.ts';
import { useTasksStore } from './store.ts';
import type { ChoreOccurrence, ChoreTemplate } from './types.ts';

// -----------------------------------------------------------------------------
// Direct regression tests against the real `useTasksStore` action — not just
// the pure completion.ts helpers it calls. This is what actually exercises
// the full edit flow (ChoreSheet -> store action -> template update ->
// current-occurrence update -> selectors), which is the thing that was
// reported broken in real use.
// -----------------------------------------------------------------------------

function seedFixedChore(assignedMemberId: string): void {
  const template: ChoreTemplate = {
    id: 'template-fixed',
    title: 'Take Out Trash',
    assignmentType: 'fixed',
    assigneeId: assignedMemberId,
    recurrence: 'weekly',
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
  const occurrence: ChoreOccurrence = {
    id: 'occ-1',
    templateId: 'template-fixed',
    title: 'Take Out Trash',
    assignedMemberId,
    dueDate: '2026-07-27',
    status: 'open',
    createdAt: '2026-07-20T00:00:00.000Z',
  };
  useTasksStore.setState({
    templates: [template],
    occurrences: [occurrence],
    lastCompletion: undefined,
  });
}

test('store: editing a fixed chore assignee from Karyn to Me updates the open occurrence and moves it into My Tasks', () => {
  seedFixedChore('karyn');

  useTasksStore.getState().updateChore('template-fixed', {
    title: 'Take Out Trash',
    assignmentType: 'fixed',
    assigneeId: 'you',
    rotationMemberIds: undefined,
  });

  const occurrence = useTasksStore.getState().occurrences.find((o) => o.id === 'occ-1');
  assert.equal(occurrence?.assignedMemberId, 'you');
  assert.equal(occurrence?.dueDate, '2026-07-27'); // due date untouched

  const occurrences = useTasksStore.getState().occurrences;
  assert.ok(getMyOpenOccurrences(occurrences, 'you').some((o) => o.id === 'occ-1'));
  assert.equal(
    getHouseholdOpenOccurrences(occurrences, 'you').some((o) => o.id === 'occ-1'),
    false,
  );
});

test('store: editing a fixed chore assignee from Me to Karyn removes it from My Tasks and puts it in Household', () => {
  seedFixedChore('you');

  useTasksStore.getState().updateChore('template-fixed', {
    title: 'Take Out Trash',
    assignmentType: 'fixed',
    assigneeId: 'karyn',
    rotationMemberIds: undefined,
  });

  const occurrences = useTasksStore.getState().occurrences;
  assert.equal(occurrences.find((o) => o.id === 'occ-1')?.assignedMemberId, 'karyn');
  assert.equal(
    getMyOpenOccurrences(occurrences, 'you').some((o) => o.id === 'occ-1'),
    false,
  );
  assert.ok(getHouseholdOpenOccurrences(occurrences, 'you').some((o) => o.id === 'occ-1'));
});

test('store: explicitly reassigning a rotating chore\'s current occurrence updates it immediately, independent of the rotation order', () => {
  const template: ChoreTemplate = {
    id: 'template-rotating',
    title: 'Clean Bathroom',
    assignmentType: 'rotating',
    rotationMemberIds: ['you', 'bella', 'karyn'],
    recurrence: 'weekly',
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
  const occurrence: ChoreOccurrence = {
    id: 'occ-rot-1',
    templateId: 'template-rotating',
    title: 'Clean Bathroom',
    assignedMemberId: 'karyn',
    dueDate: '2026-07-27',
    status: 'open',
    createdAt: '2026-07-20T00:00:00.000Z',
  };
  useTasksStore.setState({
    templates: [template],
    occurrences: [occurrence],
    lastCompletion: undefined,
  });

  // Rotation order is left unchanged — this is an explicit "hand it to Me
  // right now" action, not a list edit.
  useTasksStore.getState().updateChore(
    'template-rotating',
    {
      title: 'Clean Bathroom',
      assignmentType: 'rotating',
      rotationMemberIds: ['you', 'bella', 'karyn'],
    },
    'you',
  );

  const state = useTasksStore.getState();
  assert.equal(state.occurrences.find((o) => o.id === 'occ-rot-1')?.assignedMemberId, 'you');
  assert.deepEqual(state.templates[0].rotationMemberIds, ['you', 'bella', 'karyn']);

  const occurrences = state.occurrences;
  assert.ok(getMyOpenOccurrences(occurrences, 'you').some((o) => o.id === 'occ-rot-1'));
});

test('store: editing responsibility never rewrites a completed occurrence', () => {
  const template: ChoreTemplate = {
    id: 'template-fixed',
    title: 'Take Out Trash',
    assignmentType: 'fixed',
    assigneeId: 'karyn',
    recurrence: 'weekly',
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
  const completedOccurrence: ChoreOccurrence = {
    id: 'occ-done',
    templateId: 'template-fixed',
    title: 'Take Out Trash',
    assignedMemberId: 'bella',
    dueDate: '2026-07-01',
    status: 'completed',
    completedAt: '2026-07-01T00:00:00.000Z',
    completedByMemberId: 'bella',
    createdAt: '2026-06-25T00:00:00.000Z',
  };
  const openOccurrence: ChoreOccurrence = {
    id: 'occ-open',
    templateId: 'template-fixed',
    title: 'Take Out Trash',
    assignedMemberId: 'karyn',
    dueDate: '2026-07-27',
    status: 'open',
    createdAt: '2026-07-20T00:00:00.000Z',
  };
  useTasksStore.setState({
    templates: [template],
    occurrences: [completedOccurrence, openOccurrence],
    lastCompletion: undefined,
  });

  useTasksStore.getState().updateChore('template-fixed', {
    title: 'Take Out Trash',
    assignmentType: 'fixed',
    assigneeId: 'you',
    rotationMemberIds: undefined,
  });

  const occurrences = useTasksStore.getState().occurrences;
  const stillCompleted = occurrences.find((o) => o.id === 'occ-done');
  const reassignedOpen = occurrences.find((o) => o.id === 'occ-open');
  assert.deepEqual(stillCompleted, completedOccurrence); // byte-for-byte unchanged
  assert.equal(reassignedOpen?.assignedMemberId, 'you');
});
