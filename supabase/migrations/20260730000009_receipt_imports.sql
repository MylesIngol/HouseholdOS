-- ============================================================================
-- Milestone 7 — Checkpoint E: receipt_imports (plan sections 6, 7, 8, 14)
--
-- The fourth and last of the milestone's "smallest useful set — 4 tables"
-- (plan section 6): products (checkpoint B) and household_product_memory +
-- _assignees (checkpoint C) already exist. This is deliberately schema-
-- complete for the WHOLE receipt lifecycle even though checkpoint E itself
-- only ever inserts a row with status = 'ready_for_review' — `linked_expense_id`
-- and `confirmed_at` stay null until checkpoint H's confirm_receipt RPC sets
-- them, exactly like household_product_memory_assignees was created ahead of
-- its own first writer in checkpoint C.
--
-- `raw_model_response` (plan section 6: "trimmed — debug/diagnosis only") is
-- also what satisfies "temporary parsed-result persistence": it holds the
-- VALIDATED Receipt object (receipt-validator.ts's output), not Claude's
-- untrusted raw text — the Edge Function never persists anything that hasn't
-- already passed validateReceipt(). No `receipt_items` table (plan section 6
-- "deliberately not building" + section 29): parsed line items only exist as
-- client-held state during review until confirm_receipt persists the
-- confirmed *outputs* into their proper existing domain tables.
--
-- RLS (plan section 7): SELECT for household members, NO insert/update/delete
-- policy at all — this table is written exclusively by service-role clients
-- (this Edge Function on create, confirm_receipt on confirm), after each has
-- independently verified household membership itself. Same "no write RLS,
-- server-controlled only" pattern as Tasks/Money, one step further than
-- household_product_memory's plain-RLS-CRUD pattern.
-- ============================================================================

create table public.receipt_imports (
  id                                uuid primary key default gen_random_uuid(),
  household_id                      uuid not null references public.households (id) on delete cascade,
  uploaded_by_household_member_id   uuid not null,
  status                            text not null default 'ready_for_review'
                                       check (status in ('ready_for_review', 'confirmed', 'failed')),
  merchant_name                     text,
  purchase_date                     date,
  subtotal_cents                    int check (subtotal_cents is null or subtotal_cents >= 0),
  tax_cents                         int check (tax_cents is null or tax_cents >= 0),
  total_cents                       int not null check (total_cents > 0),
  -- The validated (not raw/untrusted) parsed receipt — see header note.
  raw_model_response                jsonb not null,
  linked_expense_id                 uuid,
  confirmed_at                      timestamptz,
  created_at                        timestamptz not null default now(),

  check ((status = 'confirmed') = (confirmed_at is not null)),
  check ((status = 'confirmed') = (linked_expense_id is not null)),
  foreign key (uploaded_by_household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict,
  -- No ON DELETE action: nothing deletes an expense created from a confirmed
  -- receipt through any path but delete_expense(), which is a Milestone-6
  -- write outside this checkpoint's scope to touch.
  foreign key (linked_expense_id, household_id)
    references public.expenses (id, household_id)
);

alter table public.receipt_imports enable row level security;

create index receipt_imports_household_id_idx on public.receipt_imports (household_id);
-- Backs the Edge Function's per-household 24h abuse-guard count (plan
-- section 8) — a count(*) filtered on household_id + a created_at window.
create index receipt_imports_household_id_created_at_idx
  on public.receipt_imports (household_id, created_at);

create policy "members can view household receipt imports"
on public.receipt_imports for select
to authenticated
using ( (select private.is_household_member(household_id)) );
