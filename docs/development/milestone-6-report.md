# Milestone 6 — Supabase + Authentication + Shared Household Sync

Final report. Checkpoints A through H, all committed to `main` (`bfc88af` → `d5b1ff3`).

## 1. What was implemented

HouseholdOS moved from a fully local, single-device Zustand/mock-data app to a real
multi-user backend on Supabase (Postgres + Auth + Realtime). Every domain — Kitchen,
Tasks, Money, and Household membership itself — now lives in Postgres behind Row Level
Security, is read/written through TanStack Query, and syncs across roommates' devices
via Postgres Changes realtime plus foreground/reconnect refetching. Checkpoints, in
order: **A** schema foundation, **B** email/password auth, **C** household
create/join/invite, **D** Kitchen cutover, **E** Tasks cutover, **F** Money cutover,
**G** realtime sync + React Native focus/online wiring, **H** cleanup and security
audit. All eight were implemented, verified, and committed individually per the
approved plan; none required stopping for a design deviation, data-loss risk, or
unresolvable test failure.

## 2. Every file created or changed

**Migrations** (`supabase/migrations/`): `20260730000001_identity_foundation.sql`,
`20260730000002_kitchen.sql`, `20260730000003_tasks.sql`, `20260730000004_money.sql`,
`20260730000005_realtime_publication.sql`.

**Supabase client / cross-cutting**: `src/lib/supabase.ts`, `src/lib/database.types.ts`,
`src/lib/query-client.ts`, `src/hooks/use-household-realtime-sync.ts`, `src/app/_layout.tsx`,
`src/app/(app)/_layout.tsx`, `src/app/(onboarding)/_layout.tsx`, `src/app/(onboarding)/index.tsx`.

**Auth**: `src/app/(auth)/sign-in.tsx`, `src/app/(auth)/sign-up.tsx`,
`src/features/auth/auth-provider.tsx`, `src/features/auth/errors.ts`,
`src/features/auth/components/account-sheet.tsx`.

**Household**: `src/features/household/api.ts`, `queries.ts`, `query-keys.ts`, `types.ts`.

**Kitchen**: `src/features/kitchen/api.ts`, `queries.ts`, `query-keys.ts`, plus rewires of
`kitchen-screen.tsx`, `item-sheet.tsx`, `inventory-row.tsx`, `grocery-row.tsx`,
`grocery-quick-add.tsx`, `out-items-sheet.tsx`.

**Tasks**: `src/features/tasks/api.ts`, `queries.ts`, `query-keys.ts`, plus rewires of
`tasks-screen.tsx`, `chore-sheet.tsx`, `history-sheet.tsx`.

**Money**: `src/features/money/api.ts`, `queries.ts`, `query-keys.ts`, plus rewires of
`expense-sheet.tsx`, `bill-sheet.tsx`, `roommate-detail-sheet.tsx`, `bill-row.tsx`,
`bill-detail-sheet.tsx`, `settlement-detail-sheet.tsx`, `money-screen.tsx`.

**Home**: `src/features/home/screens/home-screen.tsx` rewritten to read from all four
live domains.

**Deleted**: `kitchen/store.ts`, `kitchen/mock-data.ts`, `tasks/store.ts`,
`tasks/mock-data.ts`, `tasks/store.test.ts`, `money/store.ts`, `money/mock-data.ts`,
`household/store.ts`, `household/mock-data.ts`, `home/mock-data.ts`, `home/types.ts`.

## 3. Final database schema

`profiles` (id = auth.users id, display_name) · `households` (id, name, created_by) ·
`household_members` (id, household_id, user_id, role, joined_at — the household-scoped
identity every domain table references, never raw `profiles.id`) · `household_invites`
(code, household_id, created_by, revoked_at).

Kitchen: `inventory_items` (household-scoped, category/location/status, personal vs.
shared ownership via `owner_household_member_id`, expiration date + confidence) ·
`grocery_list_entries` (optionally linked back to an inventory item, unlinked not
deleted when that item is removed).

Tasks: `chore_templates` (fixed or rotating assignment) · `chore_rotation_members`
(relational rotation order, not an array) · `chore_occurrences` (one open occurrence
per template, enforced by a partial unique index).

Money: `expenses` + `expense_shares` · `settlements` · `recurring_bill_templates` +
`recurring_bill_participants` (frozen custom splits or equal-mode markers) · `bills` +
`bill_shares`.

Every domain table carries a denormalized `household_id` and a composite foreign key
`(member_id, household_id) → household_members(id, household_id)` wherever it
references a member — this is enforced at the database level, not just by RLS, so no
client bug can associate a row with a member from a different household. Money's share
tables carry deferred constraint triggers that assert the shares always sum to the
parent's `amount_cents`, checked at transaction commit so an RPC's delete-then-reinsert
sequence is allowed mid-transaction.

## 4. Final RLS/security architecture

Three distinct patterns, chosen deliberately per domain:

**Kitchen** — plain RLS: any household member can select/insert/update/delete
`inventory_items` and `grocery_list_entries` for their own household. Low-stakes,
single-row edits, no multi-row invariants — full RLS CRUD is the simplest correct
answer.

**Tasks and Money** (except `settlements`) — SELECT-only RLS, zero write policies.
Every mutation goes exclusively through a `SECURITY DEFINER` RPC that independently
re-checks household membership (since `SECURITY DEFINER` bypasses RLS). This is
required wherever a single user action must atomically touch multiple rows or tables:
creating a chore template plus its rotation list plus its first occurrence; completing
an occurrence and generating the next one; an expense and its shares; marking a bill
paid and creating its linked expense.

**Settlements** — the one exception: plain RLS insert/delete (no update), since it's a
single table with no child-row atomicity concern.

Every `SECURITY DEFINER` function in all five migrations sets `SET search_path = ''`
and schema-qualifies every reference, has `revoke all ... from public`, and grants
`execute` only to `authenticated` where the function is meant to be called directly by
a client (trigger-only functions get the revoke but no grant, since triggers execute
regardless of grants). This was audited function-by-function in checkpoint H; one gap
was found and fixed (see §16).

## 5. RPCs and what each does

**Household** (checkpoint A): `create_household` — creates a household and makes the
caller its owner-member. `join_household_with_code` — validates an invite code and adds
the caller as a member. `create_household_invite` — generates a fresh invite code
(owner only).

**Tasks** (checkpoint E, all `SECURITY DEFINER`): `create_chore_template` — creates a
template, its rotation list, and its first occurrence atomically.
`update_chore_template` — replaces the rotation list wholesale if provided and
recomputes the current occurrence's assignee (explicit pick if still eligible, else the
current holder if still eligible, else the first eligible member), never touching
already-completed occurrences. `stop_chore_template` / `delete_one_time_chore`.
`complete_chore_occurrence` — locks the occurrence row (`for update`), derives
`completed_by` from the caller's own membership (never client input), computes the next
rotation assignee and due date, and generates at most one next occurrence, all in one
transaction. `undo_chore_completion`.

**Money** (checkpoint F, all `SECURITY DEFINER`): `create_expense` /
`update_expense` (always replaces shares wholesale) / `delete_expense` — the last one
atomically reopens any bill whose `linked_expense_id` pointed at the deleted expense,
in the same transaction as the delete. `create_bill` / `update_bill` / `delete_bill`
(the latter two silently no-op once a bill leaves `upcoming` status, rather than
erroring). `mark_bill_paid` — locks the bill, creates an expense + shares copied from
the bill's shares, and is a guarded no-op if the bill is already paid.
`generate_next_bill_occurrence` — copies frozen custom shares, or recomputes a fresh
equal split (remainder cents distributed to the first N members by id) for equal-mode
templates.

## 6. Auth flow

Email/password via `@supabase/supabase-js`. `AuthProvider`
(`src/features/auth/auth-provider.tsx`) is a thin React Context wrapping
`supabase.auth.getSession()` on mount and `onAuthStateChange` thereafter — session state
lives in Supabase's own client, not Zustand. Sign-up creates the `auth.users` row;
a database trigger (`private.handle_new_user`, `after insert on auth.users`) creates
the matching `public.profiles` row server-side, deriving a display name from user
metadata or the email's local part. `RootNavigator` in `src/app/_layout.tsx` gates
`(auth)` / `(onboarding)` / `(app)` route groups declaratively via `Stack.Protected` on
session and household presence, keeping the splash screen up until both resolve.
`src/lib/supabase.ts` also wires Supabase's token auto-refresh to `AppState`, so a
backgrounded app stops burning refresh attempts and a foregrounded one refreshes
promptly if its token expired while backgrounded.

## 7. Household create/invite/join flow

A new user with no household lands in `(onboarding)`, where they either create a
household (`create_household` RPC, becomes owner) or join one via a 6-character invite
code (`join_household_with_code` RPC). Any member can view their own household's
pending invite; only the owner can generate a new one (`create_household_invite`) or
revoke it. There's currently no in-app UI for revoking an invite or removing a member
(the RLS policy exists — see §16 — but no screen calls it).

## 8. Kitchen sync

Plain TanStack Query + Supabase JS client CRUD (`src/features/kitchen/api.ts`,
`queries.ts`), gated only by RLS. `useInventoryItems` / `useGroceryItems` fetch
household-scoped rows; mutations (`useAddItem`, `useUpdateItem`, `useDeleteItem`,
grocery equivalents) call `supabase.from(...).insert/update/delete(...)` directly and
invalidate `kitchenKeys.items` / `.groceryItems` on success. No RPCs — every write is a
single-row operation with no cross-row invariant to protect.

## 9. Tasks sync

`src/features/tasks/api.ts` calls the six RPCs from §5 exclusively — there is no direct
`.insert`/`.update`/`.delete` against `chore_templates`, `chore_rotation_members`, or
`chore_occurrences` anywhere in the client, matching the SELECT-only RLS. Completion is
server-authoritative: the client just calls `complete_chore_occurrence(occurrence_id)`
and the server decides who's next and when it's due next, returning the new
occurrence's id (or null if none was generated). `useCompleteOccurrence` invalidates
`tasksKeys.occurrences`; template mutations invalidate `tasksKeys.templates`.

## 10. Money sync

`src/features/money/api.ts` calls the eight RPCs from §5 exclusively for
expenses/bills; settlements use plain insert/delete via RLS. Share arrays are passed as
`jsonb` (`[{member_id, amount_cents}]`) and unpacked server-side with
`jsonb_to_recordset`. `useDeleteExpense` and `useMarkBillPaid` each invalidate both
`moneyKeys.expenses` and `moneyKeys.bills`, since both operations touch both tables
atomically server-side. `useGenerateNextBillOccurrence` exists but isn't wired to any
UI, matching the old store's equivalent unused method.

## 11. How realtime sync works

`useHouseholdRealtimeSync` (`src/hooks/use-household-realtime-sync.ts`), mounted once
from `(app)/_layout.tsx`, opens one Supabase `postgres_changes` channel per household
and attaches one listener per table, filtered to the current household
(`household_id=eq.<id>`, or `id=eq.<id>` for `households` itself). On any INSERT/UPDATE/
DELETE it calls `queryClient.invalidateQueries()` for that table's corresponding query
key — it never merges the realtime payload into the cache directly, so a roommate's
change on another device triggers the exact same refetch codepath a manual
pull-to-refresh would. This depends on checkpoint H's `20260730000005` migration, which
adds all 13 relevant tables to the `supabase_realtime` publication — required for any
event to be delivered at all, and only worth the postgres_changes listeners existing.

This complements, rather than replaces, checkpoint G's other change: `focusManager` /
`onlineManager` wiring (`src/lib/query-client.ts`) driven by React Native's `AppState`
and `expo-network`, since RN has no browser window-focus/online events. Realtime catches
another device's change while this device is foregrounded and connected; the focus/
online managers catch everything else — this device was backgrounded, or its
connection dropped and came back.

## 12. Concurrent-edit behavior

Two roommates acting on the same row at the same moment is handled at the database
level, not the client: `complete_chore_occurrence` and `mark_bill_paid` both take
`select ... for update` on the row before deciding anything, so a second concurrent call
blocks until the first commits and then sees the already-updated state (e.g. the
already-paid bill, or the already-completed occurrence) and no-ops or errors cleanly
rather than double-processing. The partial unique index on `chore_occurrences` (at most
one open row per template) and the deferred sum-check triggers on Money's share tables
are the same kind of database-enforced invariant, catching any bug or race a client
might otherwise introduce. On the client side there's no optimistic-update/manual
merge logic anywhere — every mutation just invalidates and refetches, so a stale local
edit never overwrites a newer one; the user simply sees the server's post-mutation
state a moment later.

## 13. Test results

App-level (Node test runner, pure calculation/selector modules — unaffected by any of
this milestone's changes): **36/36 pass**, unchanged since checkpoint E (the pre-existing
`tasks/store.test.ts`'s 4 scenarios were ported into the SQL harness instead of
kept, since the store it tested no longer exists — see §16).

Database-level, via a local embedded-postgres harness built for this milestone (no
Docker, `/tmp/pgtest`, not part of the app repo): Kitchen 16/16, Tasks 36/36, Money
32/32 assertions passed, plus a standalone 0005 (realtime publication) check confirming
idempotent application and exactly the 13 expected tables. All four/five migrations
were re-run end-to-end together in checkpoint H after the `handle_new_user` security
fix, confirming nothing broke.

## 14. Typecheck/lint results

`tsc --noEmit`: clean at every checkpoint, most recently re-confirmed after checkpoint
H's changes. `npm run lint`: could not be completed in this sandbox — `expo lint`
consistently exits with no diagnostic output and no clear error, a pre-existing
environment quirk unrelated to this milestone's code (it wasn't reliably runnable in
earlier milestones either). **Recommend running `npm run lint` locally before beta** —
it was not a usable signal here.

## 15. Migration results

Five migration files, applied in order, all apply cleanly against a fresh Postgres 18
instance: `20260730000001_identity_foundation.sql`, `002_kitchen`, `003_tasks`,
`004_money`, `005_realtime_publication`. None have been run against a real Supabase
project yet — only the local embedded-postgres harness. Running them against your
actual project is manual step 1 in §18.

## 16. Deviations from the approved plan, and why

- **`tasks/store.test.ts` deleted instead of preserved** (checkpoint E). Its 4
  reassignment scenarios were re-verified as "(a)-(d)" assertions in the Tasks SQL
  harness against `update_chore_template`, and the pure TypeScript logic it exercised
  (`computeReassignedCurrentAssignee`/`applyTemplateAssignmentUpdate`) remains fully
  covered, unchanged, in `completion.test.ts`. Net effect: identical coverage, just
  split across the two layers that still exist — the file itself tested a Zustand store
  that no longer exists.
- **`household/store.ts` and `household/mock-data.ts` deleted in checkpoint F, not
  H.** They had zero remaining importers the moment Money (their last consumer) was
  cut over; deleting them immediately followed the same pattern already used for
  Kitchen's and Tasks' own files in D and E, rather than leaving known-dead files
  sitting until the cleanup checkpoint.
- **Security audit gap, found and fixed in checkpoint H**: `private.handle_new_user()`
  (the `auth.users` → `profiles` trigger from checkpoint A) was missing the
  `revoke all ... from public` every other function has. Not independently
  exploitable — Postgres refuses to run a trigger function outside trigger context
  regardless of grants — but inconsistent with the established pattern. Fixed.
- **`supabase_realtime` publication membership was missing entirely through
  checkpoint G** — the postgres_changes listeners built in G would have silently
  received zero events on a real Supabase project. Added as its own migration
  (`20260730000005`) in checkpoint H rather than folding it into G, since it was
  discovered during H's audit, after G's own verification had already declared
  realtime "structurally verified only."
- **Known limitation, deliberately not fixed**: `household_members` has a direct RLS
  DELETE policy ("members can leave their household"), but every domain table's
  composite FK to it is `ON DELETE RESTRICT`. A member who currently owns a personal
  inventory item, is assigned a chore, or has an expense/bill share will get a raw
  foreign-key-violation error if they try to leave — no UI currently handles this
  gracefully. Fixing it means a product decision (reassign/orphan their data first, or
  block leaving with a friendly message), which is a database-design deviation outside
  this milestone's scope to make unilaterally — flagging it here rather than the plan's
  qualifying "database design issue requiring deviation from the approved architecture."
- **Realtime delivery itself is only structurally verified**, not empirically tested —
  the embedded-postgres harness used for every other verification step has no realtime
  server, so subscription/delivery has been reasoned through and code-reviewed, not
  exercised against a live two-device scenario. §17's manual test steps close this gap.
- **`npm run lint`** could not be completed in this sandbox at any point in this
  milestone (see §14) — not evaluated as a pass/fail signal here.

## 17. Remaining local/mock/Zustand data that should eventually be removed

None found still in use. A full sweep in checkpoint H (`grep` across `src` for
`mock`/`Mock`/store files/TODO markers) found only one stale doc-comment reference
("used for mock seed data") in `kitchen/expiration.ts`, harmless, and two genuinely dead
files (`home/mock-data.ts`, `home/types.ts`) which were deleted. Zustand itself
(`"zustand": "^5.0.14"` in `package.json`) is still an approved part of the tech stack
per `CLAUDE.md` but has zero remaining imports anywhere in `src` — every screen's
ephemeral UI state (e.g. Tasks' "last completion / Undo" affordance) now uses local
`useState` instead. Left in `package.json` rather than removed, since it's still the
documented choice for any future purely-ephemeral state and removing an approved
dependency wasn't in this milestone's scope.

## 18. Manual Supabase configuration steps for you

1. Create a Supabase project (or use an existing one) at supabase.com.
2. Run the five migrations in `supabase/migrations/` against it, in filename order —
   easiest via `supabase db push` (or the Supabase CLI's `supabase migration up`) with
   the CLI linked to your project, or by pasting each file into the SQL Editor in
   order.
3. In the dashboard, confirm Database → Replication shows all 13 tables listed in
   `20260730000005_realtime_publication.sql` under the `supabase_realtime`
   publication (the migration does this for you, but worth a visual check).
4. Authentication → Providers: confirm Email is enabled. Authentication → Settings:
   decide whether to require email confirmation for sign-up (currently the client
   doesn't special-case an unconfirmed session, so test this either way you choose).
5. Copy `.env.example` to `.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from Project Settings → API Keys (the
   publishable key, not the secret key — `.env` is gitignored, nothing here should
   ever be committed).
6. No storage buckets, edge functions, or webhooks are used by this milestone —
   nothing else to configure.

## 19. Exact two-account/two-device testing steps

1. Run steps in §18, then `npm install` and start the app twice (two simulators/
   devices, or one device + web) — call them Device A and Device B.
2. On Device A: sign up as user A, create a household, note the invite code shown
   (or open it again from Account → the household section).
3. On Device B: sign up as a different user B, choose "join a household," enter A's
   invite code. Confirm B lands on the same Home screen data as A within a moment —
   this alone confirms the join RPC and household-scoped queries work.
4. **Realtime check, Kitchen**: on A, add a pantry item. Without manually refreshing
   B (don't background/foreground the app, don't pull to refresh), confirm the item
   appears on B within a couple seconds. Repeat for editing and deleting an item from
   B, confirming it updates live on A. This is the step that actually exercises
   checkpoint G+H's realtime work end to end, which nothing else in this milestone
   could verify.
5. **Realtime check, Tasks**: on A, create a rotating chore assigned to both A and B.
   Confirm it appears live on B. On B, complete it; confirm A sees it move to the next
   assignee live, without refreshing.
6. **Realtime check, Money**: on A, add an expense split between A and B. Confirm B's
   balance updates live. On B, mark a bill paid; confirm A sees it move to paid live.
7. **Concurrency check**: have both devices open the same chore's completion action
   at the same moment and tap "complete" within a second of each other on both. Expect
   exactly one completion to succeed and generate the next occurrence — no duplicate
   next-occurrence rows, no crash on either device.
8. **Focus/reconnect check**: put Device B in airplane mode, make a change on A, wait
   ~10 seconds, then take B out of airplane mode and bring it to the foreground.
   Confirm B catches up (this exercises the focus/online manager path from §11, not
   realtime, since B was disconnected).
9. **Leave-household check**: on a fresh third test account with no owned data yet,
   confirm leaving a household works via whatever entry point exists (there wasn't one
   at the time of writing — see §16's known limitation — so this may currently be
   untestable through the UI at all).

## 20. Before giving the app to roommates

Must do first: run the manual Supabase setup in §18 (nothing works against a real
backend until this is done), and run through §19's realtime checks at least once on
a real project — realtime delivery has never been tested outside code review in this
milestone. Should decide before beta: what happens when someone wants to leave a
household while they own data (§16) — right now they'd hit a raw Postgres error, and
there's no invite-revocation or member-removal UI at all yet, so the household is
effectively permanent membership from the roommate's perspective. Worth knowing but
not blocking for a small trusted-roommate beta: `npm run lint` was never confirmed
clean in this environment — run it locally once before shipping; and there's no rate
limiting or abuse protection on the invite-code join flow beyond RLS itself, which is
fine for people you already know but worth remembering if a code ever leaks.
