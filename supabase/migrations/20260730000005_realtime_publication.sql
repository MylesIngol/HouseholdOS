-- ============================================================================
-- Milestone 6 — Checkpoint H: realtime publication membership
--
-- Checkpoint G wired a Postgres Changes listener
-- (useHouseholdRealtimeSync, src/hooks/use-household-realtime-sync.ts) for
-- every table any screen reads, but a postgres_changes subscription only
-- receives events for tables that are members of the `supabase_realtime`
-- publication — table membership doesn't happen automatically just because
-- RLS/grants exist. Without this migration the client-side subscription
-- would silently connect and simply never receive any event, which is easy
-- to miss in testing since every screen still refetches correctly on
-- app-foreground and pull-to-refresh via query-client.ts's focusManager
-- wiring.
--
-- `supabase_realtime` already exists as an empty publication on every
-- Supabase project by default — this only needs to ADD tables to it, not
-- create it. The `create publication` branch below exists purely so this
-- migration also works unmodified against the embedded-postgres test
-- harness used throughout this milestone's verification, which has no
-- Supabase platform bootstrapping and therefore no publication to start
-- with.
--
-- Table list matches exactly what use-household-realtime-sync.ts
-- subscribes to (HOUSEHOLD_ID_TABLES + households) — recurring_bill_
-- templates/recurring_bill_participants are deliberately excluded, since no
-- screen queries them directly (bills/bill_shares are the read model the UI
-- actually uses).
-- ============================================================================

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'households',
    'household_members',
    'household_invites',
    'inventory_items',
    'grocery_list_entries',
    'chore_templates',
    'chore_rotation_members',
    'chore_occurrences',
    'expenses',
    'expense_shares',
    'settlements',
    'bills',
    'bill_shares'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
