import assert from 'node:assert/strict';
import test from 'node:test';

import { getDeleteExpenseErrorMessage } from './display.ts';

// Regression coverage for the expense-deletion error-handling fix: PostgrestError
// extends Error, so a rejected delete_expense() RPC call (e.g. the
// receipt-linked-expense rejection added in the confirm_receipt migration)
// surfaces its own human-readable message here unchanged, not a generic one.

test('a raised RPC error message passes through unchanged', () => {
  const error = new Error("This expense was created from a scanned receipt and can't be deleted here yet.");
  assert.equal(
    getDeleteExpenseErrorMessage(error),
    "This expense was created from a scanned receipt and can't be deleted here yet.",
  );
});

test('a non-Error rejection falls back to a generic message', () => {
  assert.equal(getDeleteExpenseErrorMessage('some string thrown, not an Error'), "Couldn't delete that expense — try again.");
  assert.equal(getDeleteExpenseErrorMessage(undefined), "Couldn't delete that expense — try again.");
  assert.equal(getDeleteExpenseErrorMessage({ message: 'not a real Error instance' }), "Couldn't delete that expense — try again.");
});

test('an Error with an empty message still falls back to a generic message', () => {
  assert.equal(getDeleteExpenseErrorMessage(new Error('')), "Couldn't delete that expense — try again.");
});
