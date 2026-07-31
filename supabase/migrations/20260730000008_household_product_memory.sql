-- ============================================================================
-- Milestone 7 — Checkpoint C: household product memory (barcode-keyed)
--
-- Household-scoped "what we called this product last time" memory — a
-- different concern from the global `products` cache added in checkpoint B
-- (plan section 2): two households can both scan the same barcode and share
-- the same global product row, while remembering completely different
-- preferred names/categories/locations/ownership for it. This checkpoint
-- only exercises the barcode-keyed path (`product_key = barcode`); the
-- no-barcode normalized-name-fingerprint path (plan section 11, "matched by
-- barcode first, else normalized cleaned name") is exercised for the first
-- time by the receipt flow (checkpoint H), not here — the schema already
-- supports it (`product_key` is a plain text key, not constrained to look
-- like a barcode), no future migration needed for that.
--
-- `household_product_memory_assignees` (plan section 6.3) is created here
-- too, schema-complete, even though nothing writes to it yet — the barcode
-- flow never sets assignees (that's a money-split concept), only the
-- receipt flow (checkpoint H) will populate it, via confirm_receipt.
-- ============================================================================

create table public.household_product_memory (
  id                                 uuid primary key default gen_random_uuid(),
  household_id                       uuid not null references public.households (id) on delete cascade,
  -- The barcode when scanned; a normalized cleaned-name fingerprint when not
  -- (future receipt-flow use, plan section 11). Always populated, always the
  -- upsert conflict target together with household_id.
  product_key                        text not null check (btrim(product_key) <> ''),
  barcode                            text,
  preferred_name                     text not null check (btrim(preferred_name) <> ''),
  category                           text,
  storage_location                   text check (storage_location in ('pantry', 'fridge', 'freezer')),
  default_ownership                  text not null default 'shared' check (default_ownership in ('shared', 'personal')),
  default_owner_household_member_id  uuid,
  created_at                         timestamptz not null default now(),
  updated_at                         timestamptz not null default now(),

  unique (household_id, product_key),
  -- Composite FK target for household_product_memory_assignees below.
  unique (id, household_id),
  check ((default_ownership = 'personal') = (default_owner_household_member_id is not null)),
  foreign key (default_owner_household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict
);

alter table public.household_product_memory enable row level security;

create index household_product_memory_household_id_idx
  on public.household_product_memory (household_id);
create index household_product_memory_barcode_idx
  on public.household_product_memory (household_id, barcode)
  where barcode is not null;

create trigger household_product_memory_set_updated_at
  before update on public.household_product_memory
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- household_product_memory_assignees — relational child table for "who we
-- last split this product's cost between" (plan section 3 precedent: no
-- uuid[] for anything FK-constrained). household_id is denormalized from the
-- parent memory row so household_member_id can be composite-FK'd the same
-- way every other member-referencing table is.
-- ----------------------------------------------------------------------------

create table public.household_product_memory_assignees (
  id                   uuid primary key default gen_random_uuid(),
  memory_id            uuid not null,
  household_id         uuid not null,
  household_member_id  uuid not null,

  unique (memory_id, household_member_id),
  foreign key (memory_id, household_id)
    references public.household_product_memory (id, household_id) on delete cascade,
  foreign key (household_member_id, household_id)
    references public.household_members (id, household_id) on delete cascade
);

alter table public.household_product_memory_assignees enable row level security;

create index household_product_memory_assignees_memory_id_idx
  on public.household_product_memory_assignees (memory_id);

-- ----------------------------------------------------------------------------
-- RLS — plain shared RLS CRUD (plan section 7: "barcode-flow writes are
-- plain RLS upserts, mirrors Kitchen's existing pattern — low stakes,
-- single-row"), NOT the Money/Tasks RPC-only pattern. The future
-- receipt-flow write path (confirm_receipt, checkpoint H) is a SECURITY
-- DEFINER RPC and doesn't depend on these policies at all — they exist for
-- today's direct client writes from the barcode confirm sheet.
-- ----------------------------------------------------------------------------

create policy "members can view household product memory"
on public.household_product_memory for select
to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can add household product memory"
on public.household_product_memory for insert
to authenticated
with check ( (select private.is_household_member(household_id)) );

create policy "members can update household product memory"
on public.household_product_memory for update
to authenticated
using ( (select private.is_household_member(household_id)) )
with check ( (select private.is_household_member(household_id)) );

create policy "members can delete household product memory"
on public.household_product_memory for delete
to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can view household product memory assignees"
on public.household_product_memory_assignees for select
to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can add household product memory assignees"
on public.household_product_memory_assignees for insert
to authenticated
with check ( (select private.is_household_member(household_id)) );

create policy "members can delete household product memory assignees"
on public.household_product_memory_assignees for delete
to authenticated
using ( (select private.is_household_member(household_id)) );
