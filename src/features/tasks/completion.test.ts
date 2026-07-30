import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCompleteOccurrence,
  applyTemplateAssignmentUpdate,
  buildNextChoreOccurrence,
  computeReassignedCurrentAssignee,
  getNextRotationAssignee,
} from './completion.ts';
import { getHouseholdOpenOccurrences, getMyOpenOccurrences } from './selectors.ts';
import type { ChoreOccurrence, ChoreTemplate } from './types.ts';

function makeTemplate(overrides: Partial<ChoreTemplate> = {}): ChoreTemplate {
  return {
    id: 'template-1',
    title: 'Take Out Trash',
    assignmentType: 'fixed',
    assigneeId: 'you',
    recurrence: 'weekly',
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

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

// --- getNextRotationAssignee -------------------------------------------------

test('rotation with no prior assignee starts at the first member', () => {
  assert.equal(getNextRotationAssignee(['you', 'bella', 'karyn'], undefined), 'you');
});

test('rotation advances to the next member in order', () => {
  assert.equal(getNextRotationAssignee(['you', 'bella', 'karyn'], 'you'), 'bella');
  assert.equal(getNextRotationAssignee(['you', 'bella', 'karyn'], 'bella'), 'karyn');
});

test('rotation wraps around after the final member', () => {
  assert.equal(getNextRotationAssignee(['you', 'bella', 'karyn'], 'karyn'), 'you');
});

test('rotation restarts at the top of the list if the last assignee was removed from it', () => {
  // 'bella' completed the chore, but a since-edited rotation list no longer includes her.
  assert.equal(getNextRotationAssignee(['you', 'karyn', 'nat'], 'bella'), 'you');
});

// --- completing a one-time chore --------------------------------------------

test('completing a one-time chore generates no next occurrence', () => {
  const template = makeTemplate({ recurrence: 'none' });
  const occurrence = makeOccurrence();

  const result = applyCompleteOccurrence(
    [template],
    [occurrence],
    'occ-1',
    'you',
    '2026-07-27T10:00:00.000Z',
    'occ-2',
  );

  assert.ok(result);
  assert.equal(result.occurrences.length, 1);
  assert.equal(result.occurrences[0].status, 'completed');
  assert.equal(result.occurrences[0].completedByMemberId, 'you');
});

// --- fixed recurring ---------------------------------------------------------

test('completing a fixed recurring chore generates the next occurrence for the same person', () => {
  const template = makeTemplate({
    assignmentType: 'fixed',
    assigneeId: 'you',
    recurrence: 'weekly',
  });
  const occurrence = makeOccurrence();

  const result = applyCompleteOccurrence(
    [template],
    [occurrence],
    'occ-1',
    'you',
    '2026-07-27T10:00:00.000Z',
    'occ-2',
  );

  assert.ok(result);
  assert.equal(result.occurrences.length, 2);
  const next = result.occurrences.find((o) => o.id === 'occ-2');
  assert.ok(next);
  assert.equal(next.assignedMemberId, 'you');
  assert.equal(next.status, 'open');
  assert.equal(next.dueDate, '2026-08-03');
});

// --- rotating recurring -------------------------------------------------------

test('completing a rotating chore advances assignment to the next member', () => {
  const template = makeTemplate({
    assignmentType: 'rotating',
    assigneeId: undefined,
    rotationMemberIds: ['you', 'bella', 'karyn'],
    recurrence: 'weekly',
  });
  const occurrence = makeOccurrence({ assignedMemberId: 'you' });

  const result = applyCompleteOccurrence(
    [template],
    [occurrence],
    'occ-1',
    'you',
    '2026-07-27T10:00:00.000Z',
    'occ-2',
  );

  assert.ok(result);
  const next = result.occurrences.find((o) => o.id === 'occ-2');
  assert.equal(next?.assignedMemberId, 'bella');
});

test('rotation wraps after the final member across real completions', () => {
  const template = makeTemplate({
    assignmentType: 'rotating',
    assigneeId: undefined,
    rotationMemberIds: ['you', 'bella', 'karyn'],
    recurrence: 'weekly',
  });
  const occurrence = makeOccurrence({ assignedMemberId: 'karyn' });

  const result = applyCompleteOccurrence(
    [template],
    [occurrence],
    'occ-1',
    'karyn',
    '2026-07-27T10:00:00.000Z',
    'occ-2',
  );

  assert.ok(result);
  const next = result.occurrences.find((o) => o.id === 'occ-2');
  assert.equal(next?.assignedMemberId, 'you');
});

// --- history integrity ---------------------------------------------------------

test('a completed historical occurrence keeps its original assignee even after the rotation list later changes', () => {
  const template = makeTemplate({
    assignmentType: 'rotating',
    assigneeId: undefined,
    rotationMemberIds: ['you', 'bella', 'karyn'],
    recurrence: 'weekly',
  });
  const occurrence = makeOccurrence({ assignedMemberId: 'bella' });

  const result = applyCompleteOccurrence(
    [template],
    [occurrence],
    'occ-1',
    'bella',
    '2026-07-27T10:00:00.000Z',
    'occ-2',
  );
  assert.ok(result);
  const completed = result.occurrences.find((o) => o.id === 'occ-1');
  assert.equal(completed?.assignedMemberId, 'bella'); // untouched, regardless of any later rotation edits

  // Now simulate the rotation list changing before the *next* completion —
  // the already-completed 'occ-1' above must remain exactly as it was.
  const editedTemplate = { ...template, rotationMemberIds: ['you', 'karyn'] };
  const nextOccurrence = result.occurrences.find((o) => o.id === 'occ-2')!;
  const secondResult = applyCompleteOccurrence(
    [editedTemplate],
    result.occurrences,
    nextOccurrence.id,
    nextOccurrence.assignedMemberId,
    '2026-08-03T10:00:00.000Z',
    'occ-3',
  );
  assert.ok(secondResult);
  const stillOriginal = secondResult.occurrences.find((o) => o.id === 'occ-1');
  assert.equal(stillOriginal?.assignedMemberId, 'bella');
});

test('completedByMemberId can differ from assignedMemberId — someone else completed it', () => {
  const template = makeTemplate({ recurrence: 'none' });
  const occurrence = makeOccurrence({ assignedMemberId: 'bella' });

  const result = applyCompleteOccurrence(
    [template],
    [occurrence],
    'occ-1',
    'you',
    '2026-07-27T10:00:00.000Z',
    'occ-2',
  );

  assert.ok(result);
  const completed = result.occurrences[0];
  assert.equal(completed.assignedMemberId, 'bella');
  assert.equal(completed.completedByMemberId, 'you');
});

test('completing an occurrence that is already completed is a no-op', () => {
  const template = makeTemplate();
  const occurrence = makeOccurrence({
    status: 'completed',
    completedAt: '2026-07-20T00:00:00.000Z',
    completedByMemberId: 'you',
  });

  const result = applyCompleteOccurrence(
    [template],
    [occurrence],
    'occ-1',
    'bella',
    '2026-07-27T10:00:00.000Z',
    'occ-2',
  );
  assert.equal(result, undefined);
});

test('completing a stopped (inactive) recurring template generates no next occurrence', () => {
  const template = makeTemplate({ active: false });
  const occurrence = makeOccurrence();

  const result = applyCompleteOccurrence(
    [template],
    [occurrence],
    'occ-1',
    'you',
    '2026-07-27T10:00:00.000Z',
    'occ-2',
  );
  assert.ok(result);
  assert.equal(result.occurrences.length, 1);
});

test('buildNextChoreOccurrence returns undefined for a one-time template', () => {
  const template = makeTemplate({ recurrence: 'none' });
  const completed = { ...makeOccurrence(), status: 'completed' as const };
  assert.equal(
    buildNextChoreOccurrence(template, completed, 'occ-2', '2026-07-27T10:00:00.000Z'),
    undefined,
  );
});

// --- editing responsibility on the current open occurrence -------------------
// Template edits to assignee/rotation now also move the *current open*
// occurrence, so My Tasks / Household update immediately rather than only on
// the next completion.

test('fixed chore: reassigning Me -> Karyn moves the current occurrence out of My Tasks', () => {
  const occurrences = [makeOccurrence({ assignedMemberId: 'you' })];

  const updated = applyTemplateAssignmentUpdate(occurrences, 'template-1', {
    assignmentType: 'fixed',
    assigneeId: 'karyn',
    rotationMemberIds: undefined,
  });

  assert.equal(updated[0].assignedMemberId, 'karyn');
  // The due date and everything else about the occurrence is untouched.
  assert.equal(updated[0].dueDate, '2026-07-27');
  assert.equal(getMyOpenOccurrences(updated, 'you').length, 0);
  assert.equal(getHouseholdOpenOccurrences(updated, 'you').length, 1);
});

test('fixed chore: reassigning Karyn -> Me moves the current occurrence into My Tasks', () => {
  const occurrences = [makeOccurrence({ assignedMemberId: 'karyn' })];

  const updated = applyTemplateAssignmentUpdate(occurrences, 'template-1', {
    assignmentType: 'fixed',
    assigneeId: 'you',
    rotationMemberIds: undefined,
  });

  assert.equal(updated[0].assignedMemberId, 'you');
  assert.equal(getMyOpenOccurrences(updated, 'you').length, 1);
  assert.equal(getHouseholdOpenOccurrences(updated, 'you').length, 0);
});

test('rotating chore: editing the rotation list while the current assignee stays eligible leaves the current occurrence unchanged', () => {
  const occurrence = makeOccurrence({ assignedMemberId: 'bella' });

  const assignedMemberId = computeReassignedCurrentAssignee(
    'rotating',
    undefined,
    ['you', 'bella', 'karyn', 'nat'], // 'bella' is still in the new list
    occurrence.assignedMemberId,
  );
  assert.equal(assignedMemberId, 'bella');

  const updated = applyTemplateAssignmentUpdate([occurrence], 'template-1', {
    assignmentType: 'rotating',
    assigneeId: undefined,
    rotationMemberIds: ['you', 'bella', 'karyn', 'nat'],
  });
  assert.deepEqual(updated[0], occurrence); // same object contents — nothing rewritten
});

test('rotating chore: removing the current assignee from the rotation list reassigns the open occurrence to the first eligible member', () => {
  const occurrence = makeOccurrence({ assignedMemberId: 'bella' });

  const assignedMemberId = computeReassignedCurrentAssignee(
    'rotating',
    undefined,
    ['you', 'karyn', 'nat'], // 'bella' removed
    occurrence.assignedMemberId,
  );
  assert.equal(assignedMemberId, 'you');

  const updated = applyTemplateAssignmentUpdate([occurrence], 'template-1', {
    assignmentType: 'rotating',
    assigneeId: undefined,
    rotationMemberIds: ['you', 'karyn', 'nat'],
  });
  assert.equal(updated[0].assignedMemberId, 'you');
  assert.equal(updated[0].dueDate, occurrence.dueDate); // due date never changes
});

test('editing responsibility never touches completed history', () => {
  const completedOccurrence = makeOccurrence({
    id: 'occ-completed',
    assignedMemberId: 'bella',
    status: 'completed',
    completedAt: '2026-07-20T00:00:00.000Z',
    completedByMemberId: 'bella',
  });
  const openOccurrence = makeOccurrence({
    id: 'occ-open',
    assignedMemberId: 'bella',
    status: 'open',
  });

  const updated = applyTemplateAssignmentUpdate(
    [completedOccurrence, openOccurrence],
    'template-1',
    { assignmentType: 'fixed', assigneeId: 'karyn', rotationMemberIds: undefined },
  );

  const stillCompleted = updated.find((o) => o.id === 'occ-completed');
  const reassignedOpen = updated.find((o) => o.id === 'occ-open');
  assert.deepEqual(stillCompleted, completedOccurrence); // byte-for-byte unchanged
  assert.equal(reassignedOpen?.assignedMemberId, 'karyn');
});
