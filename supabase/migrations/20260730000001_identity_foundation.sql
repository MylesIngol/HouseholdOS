-- ============================================================================
-- Milestone 6 — Checkpoint A: identity foundation
--
-- profiles, households, household_members, household_invites, the RLS helper
-- functions every later domain migration builds on, and the two atomic
-- SECURITY DEFINER RPCs for creating/joining a household. Kitchen/Tasks/Money
-- tables are added in their own later migrations (checkpoints D/E/F) so each
-- checkpoint's schema change lands with the app code that actually uses it.
-- ============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid(), gen_random_bytes()

create schema if not exists private;
comment on schema private is
  'Never added to Supabase''s exposed-schemas API setting. SECURITY DEFINER
   RLS helper functions live here so they are reachable from policies but
   never directly callable by a client.';

-- ----------------------------------------------------------------------------
-- profiles — one row per auth.users row, created automatically by the
-- trigger at the bottom of this file. Distinct from household_members: a
-- profile is a permanent account identity; a household_members row is that
-- account's membership in one specific household (see household_members
-- below, and the plan's section 1 for why domain tables reference
-- household_members.id rather than profiles.id directly).
-- ----------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ----------------------------------------------------------------------------
-- households / household_members / household_invites
-- ----------------------------------------------------------------------------

create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.households enable row level security;

create table public.household_members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  unique (household_id, user_id),
  -- v1: exactly one household per user. Dropping this single-column unique
  -- constraint is the entire migration needed to allow multi-household
  -- membership later — no data reshaping required.
  unique (user_id),
  -- Composite target for every domain table's (member_id, household_id)
  -- foreign key — guarantees a referenced membership really is a member of
  -- the household the referencing row claims to belong to.
  unique (id, household_id)
);

alter table public.household_members enable row level security;

create index household_members_household_id_idx on public.household_members (household_id);

create table public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code         text not null unique,
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz default (now() + interval '14 days'),
  revoked_at   timestamptz,
  max_uses     int not null default 20 check (max_uses > 0),
  use_count    int not null default 0 check (use_count >= 0),
  foreign key (created_by, household_id) references public.household_members (id, household_id)
);

alter table public.household_invites enable row level security;

create index household_invites_household_id_idx on public.household_invites (household_id);

-- ----------------------------------------------------------------------------
-- RLS helper functions (private schema, SECURITY DEFINER, hardened per the
-- approved plan section 7: search_path = '', every reference schema-
-- qualified, EXECUTE revoked from PUBLIC and granted only to authenticated).
-- Wrapping the household_members self-check in a definer function is what
-- avoids the classic Supabase "infinite recursion" trap of a policy on
-- household_members querying household_members directly.
-- ----------------------------------------------------------------------------

create or replace function private.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_household_member(uuid) from public;
grant execute on function private.is_household_member(uuid) to authenticated;

create or replace function private.is_household_owner(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

revoke all on function private.is_household_owner(uuid) from public;
grant execute on function private.is_household_owner(uuid) to authenticated;

create or replace function private.shares_household_with(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm1
    join public.household_members hm2 on hm1.household_id = hm2.household_id
    where hm1.user_id = (select auth.uid())
      and hm2.user_id = p_other_user_id
  );
$$;

revoke all on function private.shares_household_with(uuid) from public;
grant execute on function private.shares_household_with(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- profiles RLS — readable by yourself or anyone who shares a household with
-- you; never every authenticated user (plan section 2).
-- ----------------------------------------------------------------------------

create policy "read own or shared-household profiles"
on public.profiles for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.shares_household_with(id))
);

create policy "update own profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- No client INSERT/DELETE policy — rows are created exclusively by the
-- auth.users trigger below and cascade-deleted with the auth user.

-- ----------------------------------------------------------------------------
-- households RLS
-- ----------------------------------------------------------------------------

create policy "members can view their household"
on public.households for select
to authenticated
using ( (select private.is_household_member(id)) );

create policy "owners can rename their household"
on public.households for update
to authenticated
using ( (select private.is_household_owner(id)) )
with check ( (select private.is_household_owner(id)) );

-- No direct client INSERT/DELETE — creation is exclusively through
-- create_household() below; deletion is out of scope for this milestone.

-- ----------------------------------------------------------------------------
-- household_members RLS
-- ----------------------------------------------------------------------------

create policy "members can view their household roster"
on public.household_members for select
to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can leave their household"
on public.household_members for delete
to authenticated
using ( user_id = (select auth.uid()) );

-- No INSERT policy at all — membership rows are created exclusively by the
-- two SECURITY DEFINER RPCs below, which bypass RLS internally by design.
-- No UPDATE policy in v1 (no role-change UI yet).

-- ----------------------------------------------------------------------------
-- household_invites RLS — only owners create/revoke; any member can view the
-- household's active code(s) to share it (plan section 9).
-- ----------------------------------------------------------------------------

create policy "members can view invites"
on public.household_invites for select
to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "owners can create invites"
on public.household_invites for insert
to authenticated
with check (
  (select private.is_household_owner(household_id))
  and exists (
    select 1 from public.household_members
    where id = created_by
      and household_id = household_invites.household_id
      and user_id = (select auth.uid())
  )
);

create policy "owners can revoke invites"
on public.household_invites for update
to authenticated
using ( (select private.is_household_owner(household_id)) )
with check ( (select private.is_household_owner(household_id)) );

-- ----------------------------------------------------------------------------
-- create_household / join_household_with_code — the only two ways
-- household_members rows are ever created. Both SECURITY DEFINER (no
-- ordinary authenticated-role policy permits these inserts directly, by
-- design), both hardened per plan section 7.
-- ----------------------------------------------------------------------------

create or replace function public.create_household(p_name text)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household public.households;
begin
  if exists (select 1 from public.household_members where user_id = (select auth.uid())) then
    raise exception 'You already belong to a household.' using errcode = 'P0001';
  end if;

  if btrim(p_name) = '' then
    raise exception 'Household name is required.' using errcode = 'P0004';
  end if;

  insert into public.households (name, created_by)
  values (btrim(p_name), (select auth.uid()))
  returning * into v_household;

  insert into public.household_members (household_id, user_id, role)
  values (v_household.id, (select auth.uid()), 'owner');

  return v_household;
end;
$$;

revoke all on function public.create_household(text) from public;
grant execute on function public.create_household(text) to authenticated;

create or replace function private.generate_invite_code()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  -- 10 chars from a 32-symbol alphabet excluding ambiguous glyphs
  -- (0/O/1/I/L) — ~1.1e15 possibilities, easy to read aloud/type.
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() * 32)::int + 1, 1),
    ''
  )
  from generate_series(1, 10);
$$;

revoke all on function private.generate_invite_code() from public;
grant execute on function private.generate_invite_code() to authenticated;

create or replace function public.join_household_with_code(p_code text)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite    public.household_invites;
  v_household public.households;
begin
  if exists (select 1 from public.household_members where user_id = (select auth.uid())) then
    raise exception 'You already belong to a household.' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.household_invites
  where code = upper(btrim(p_code))
    and revoked_at is null
    and (expires_at is null or expires_at > now())
    and use_count < max_uses
  for update;

  if not found then
    raise exception 'That invite code is invalid or has expired.' using errcode = 'P0002';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_invite.household_id, (select auth.uid()), 'member');

  update public.household_invites
  set use_count = use_count + 1
  where id = v_invite.id;

  select * into v_household from public.households where id = v_invite.household_id;
  return v_household;
end;
$$;

revoke all on function public.join_household_with_code(text) from public;
grant execute on function public.join_household_with_code(text) to authenticated;

-- Convenience RPC for the invite-creation screen — wraps code generation so
-- the client never has to retry a unique-constraint collision itself.
create or replace function public.create_household_invite(p_household_id uuid)
returns public.household_invites
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_invite public.household_invites;
  v_code text;
  v_attempts int := 0;
begin
  select id into v_member_id
  from public.household_members
  where household_id = p_household_id and user_id = (select auth.uid());

  if v_member_id is null then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  loop
    v_code := private.generate_invite_code();
    begin
      insert into public.household_invites (household_id, code, created_by)
      values (p_household_id, v_code, v_member_id)
      returning * into v_invite;
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 5 then
        raise exception 'Could not generate a unique invite code — try again.';
      end if;
    end;
  end loop;

  return v_invite;
end;
$$;

revoke all on function public.create_household_invite(uuid) from public;
grant execute on function public.create_household_invite(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- auth.users -> profiles trigger
-- ----------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
