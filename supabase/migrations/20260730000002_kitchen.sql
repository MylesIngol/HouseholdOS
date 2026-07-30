-- ============================================================================
-- Milestone 6 — Checkpoint D: Kitchen (inventory + grocery list)
--
-- Household-scoped inventory items and a household-scoped grocery list, with
-- personal-ownership items constrained to an actual member of the same
-- household (composite FK, plan section 6) and a trigger that keeps grocery
-- entries pointed at a deleted item unlinked rather than dangling — mirroring
-- the existing client behavior in kitchen/store.ts's deleteItem action.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- shared helper: bump updated_at on every UPDATE. Reused by every domain
-- table added from here on (Tasks/Money migrations will reuse this too).
-- ----------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;

-- ----------------------------------------------------------------------------
-- inventory_items
-- ----------------------------------------------------------------------------

create table public.inventory_items (
  id                      uuid primary key default gen_random_uuid(),
  household_id            uuid not null references public.households (id) on delete cascade,
  name                    text not null check (btrim(name) <> ''),
  category                text not null default 'other' check (category in (
                            'produce', 'dairy', 'meat', 'grains', 'canned', 'condiments',
                            'beverages', 'snacks', 'frozen', 'other'
                          )),
  location                text not null check (location in ('pantry', 'fridge', 'freezer')),
  status                  text not null default 'in_stock' check (status in ('in_stock', 'low', 'out')),
  quantity                integer check (quantity is null or quantity >= 0),
  unit                    text check (unit in ('count', 'oz', 'lb', 'g', 'kg', 'ml', 'l', 'pack')),
  expiration_date         date,
  expiration_confidence   text check (expiration_confidence in ('exact', 'estimated')),
  ownership               text not null default 'shared' check (ownership in ('shared', 'personal')),
  owner_household_member_id uuid,
  notes                   text,
  added_at                timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Both present or both absent — no orphaned confidence with no date or vice versa.
  check ((expiration_date is null) = (expiration_confidence is null)),
  -- 'personal' items must name an owner; 'shared' items must not.
  check ((ownership = 'personal') = (owner_household_member_id is not null)),

  -- Composite FK target for grocery_list_entries below.
  unique (id, household_id),
  -- The owner must be an actual member of THIS item's household, not just
  -- any household_members row — plan section 6.
  foreign key (owner_household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict
);

alter table public.inventory_items enable row level security;

create index inventory_items_household_id_idx on public.inventory_items (household_id);

create trigger inventory_items_set_updated_at
  before update on public.inventory_items
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- grocery_list_entries
-- ----------------------------------------------------------------------------

create table public.grocery_list_entries (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households (id) on delete cascade,
  name              text not null check (btrim(name) <> ''),
  added_at          timestamptz not null default now(),
  inventory_item_id uuid,

  -- A linked entry's item must belong to the SAME household as the entry
  -- itself — plan section 6. No ON DELETE action here on purpose: nulling
  -- out inventory_item_id on item delete is handled by the trigger below
  -- rather than a composite "ON DELETE SET NULL" (which would also null out
  -- household_id, which must never change).
  foreign key (inventory_item_id, household_id)
    references public.inventory_items (id, household_id)
);

alter table public.grocery_list_entries enable row level security;

create index grocery_list_entries_household_id_idx on public.grocery_list_entries (household_id);

-- Deleting an inventory item un-links (not deletes) any grocery entry that
-- pointed at it, matching the existing deleteItem store behavior exactly.
create or replace function private.unlink_grocery_entries_on_item_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.grocery_list_entries
  set inventory_item_id = null
  where inventory_item_id = old.id;
  return old;
end;
$$;

revoke all on function private.unlink_grocery_entries_on_item_delete() from public;

create trigger unlink_grocery_entries_before_item_delete
  before delete on public.inventory_items
  for each row execute function private.unlink_grocery_entries_on_item_delete();

-- ----------------------------------------------------------------------------
-- RLS — Kitchen is a shared-editing domain (unlike invites): any household
-- member can create/read/update/delete any item or grocery entry in their
-- own household. No owner-gating here; "ownership" on an item is a product
-- label (whose stuff it is), not an access-control boundary.
-- ----------------------------------------------------------------------------

create policy "members can view household inventory"
on public.inventory_items for select
to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can add household inventory"
on public.inventory_items for insert
to authenticated
with check ( (select private.is_household_member(household_id)) );

create policy "members can update household inventory"
on public.inventory_items for update
to authenticated
using ( (select private.is_household_member(household_id)) )
with check ( (select private.is_household_member(household_id)) );

create policy "members can delete household inventory"
on public.inventory_items for delete
to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can view household grocery list"
on public.grocery_list_entries for select
to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can add to household grocery list"
on public.grocery_list_entries for insert
to authenticated
with check ( (select private.is_household_member(household_id)) );

create policy "members can update household grocery list"
on public.grocery_list_entries for update
to authenticated
using ( (select private.is_household_member(household_id)) )
with check ( (select private.is_household_member(household_id)) );

create policy "members can remove household grocery entries"
on public.grocery_list_entries for delete
to authenticated
using ( (select private.is_household_member(household_id)) );
