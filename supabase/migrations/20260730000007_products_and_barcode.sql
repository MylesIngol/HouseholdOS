-- ============================================================================
-- Milestone 7 — Checkpoint B: barcode lookup + global products cache
--
-- A global (household-agnostic) barcode -> product cache, populated by the
-- lookup-barcode Edge Function's provider chain (our own cache -> Open Food
-- Facts -> UPCitemdb -> unknown, per the approved plan's section 2 and
-- adjustment 2 routing lookup through the server rather than the client).
-- Barcode identity is universal, not private, so this table intentionally
-- has no household_id and open shared RLS — the opposite of every other
-- table in this schema, and that is correct, not an oversight (plan section
-- 23 flags this explicitly so it's never "fixed" into household-scoped by
-- mistake later).
--
-- Also adds a nullable `barcode` column to inventory_items (plan section
-- 12) — the only touch to an existing table this checkpoint needs.
-- ============================================================================

create table public.products (
  barcode    text primary key,
  name       text not null check (btrim(name) <> ''),
  brand      text,
  category   text,
  image_url  text,
  source     text not null check (source in ('open_food_facts', 'upcitemdb', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

-- Reuses the shared helper first defined in the Kitchen migration.
create trigger products_set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

-- Open shared reference data: any authenticated user may read and write.
-- The lookup-barcode Edge Function upserts using the caller's own forwarded
-- JWT (not a service-role client) — there's nothing per-user to restrict
-- here. Worst case of a bad write is a stale/wrong cached name, which
-- self-corrects on the next successful external lookup; low enough stakes
-- that gating writes behind a function would only add complexity.
create policy "authenticated can view products"
on public.products for select
to authenticated
using ( true );

create policy "authenticated can add products"
on public.products for insert
to authenticated
with check ( true );

create policy "authenticated can update products"
on public.products for update
to authenticated
using ( true )
with check ( true );

alter table public.inventory_items add column barcode text;

-- Supports both "have we already got this barcode in this household"
-- lookups (used by checkpoint C's household_product_memory flow) and any
-- future find-by-barcode logic in receipt Kitchen-import (checkpoint H).
create index inventory_items_household_barcode_idx
  on public.inventory_items (household_id, barcode)
  where barcode is not null;
