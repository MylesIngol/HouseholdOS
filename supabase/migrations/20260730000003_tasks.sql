-- ============================================================================
-- Milestone 6 — Checkpoint E: Tasks (chores)
--
-- chore_templates / chore_rotation_members / chore_occurrences. Unlike
-- Kitchen, writes here are NOT directly RLS-permitted — every mutation goes
-- through a SECURITY DEFINER RPC (mirroring household_members' "no INSERT
-- policy at all, RPCs only" precedent from checkpoint A), because Tasks has
-- multi-row invariants (rotation list replace, current-occurrence
-- reassignment) and, most importantly, a genuinely concurrency-sensitive
-- transition: completing an occurrence and generating its successor must
-- happen exactly once even if two roommates tap "Done" on the same chore at
-- the same moment (plan section 8). Every RPC is SECURITY DEFINER and
-- therefore independently re-checks household membership itself — DEFINER
-- bypasses RLS, so the membership check has to live in the function body,
-- not in a policy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- date-math helpers, ported 1:1 from tasks/recurrence.ts (addMonthsClamped /
-- getNextDueDate) so the server computes the exact same "next due date" a
-- client would, using the same day-of-month clamp rule (Jan 31 -> Feb 28/29,
-- Mar 31 -> Apr 30). private/never exposed — only called from within the
-- DEFINER RPCs below.
-- ----------------------------------------------------------------------------

create or replace function private.add_months_clamped(p_date date, p_months int)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_first_of_target_month date;
  v_days_in_target_month  int;
  v_clamped_day           int;
begin
  v_first_of_target_month := (date_trunc('month', p_date) + make_interval(months => p_months))::date;
  v_days_in_target_month := extract(day from (v_first_of_target_month + interval '1 month' - interval '1 day'))::int;
  v_clamped_day := least(extract(day from p_date)::int, v_days_in_target_month);
  return v_first_of_target_month + (v_clamped_day - 1);
end;
$$;

revoke all on function private.add_months_clamped(date, int) from public;

create or replace function private.next_chore_due_date(p_current_due_date date, p_recurrence text)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_recurrence
    when 'daily' then p_current_due_date + 1
    when 'weekly' then p_current_due_date + 7
    when 'monthly' then private.add_months_clamped(p_current_due_date, 1)
    else null
  end;
$$;

revoke all on function private.next_chore_due_date(date, text) from public;

-- ----------------------------------------------------------------------------
-- chore_templates
-- ----------------------------------------------------------------------------

create table public.chore_templates (
  id                            uuid primary key default gen_random_uuid(),
  household_id                  uuid not null references public.households (id) on delete cascade,
  title                         text not null check (btrim(title) <> ''),
  description                   text,
  assignment_type               text not null check (assignment_type in ('fixed', 'rotating')),
  assignee_household_member_id  uuid,
  recurrence                    text not null check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  active                        boolean not null default true,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  -- 'fixed' always names its assignee directly; 'rotating' names its
  -- eligible members via chore_rotation_members instead.
  check ((assignment_type = 'fixed') = (assignee_household_member_id is not null)),

  unique (id, household_id),
  foreign key (assignee_household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict
);

alter table public.chore_templates enable row level security;

create index chore_templates_household_id_idx on public.chore_templates (household_id);

create trigger chore_templates_set_updated_at
  before update on public.chore_templates
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- chore_rotation_members — relational rotation order (plan section 3: no
-- uuid[] for membership that must be FK-constrained).
-- ----------------------------------------------------------------------------

create table public.chore_rotation_members (
  id                    uuid primary key default gen_random_uuid(),
  template_id           uuid not null,
  household_id          uuid not null references public.households (id) on delete cascade,
  household_member_id   uuid not null,
  position              int not null check (position > 0),

  unique (template_id, position),
  unique (template_id, household_member_id),

  foreign key (template_id, household_id)
    references public.chore_templates (id, household_id) on delete cascade,
  foreign key (household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict
);

alter table public.chore_rotation_members enable row level security;

create index chore_rotation_members_template_id_idx on public.chore_rotation_members (template_id);

-- ----------------------------------------------------------------------------
-- chore_occurrences
-- ----------------------------------------------------------------------------

create table public.chore_occurrences (
  id                                 uuid primary key default gen_random_uuid(),
  template_id                        uuid not null,
  household_id                       uuid not null references public.households (id) on delete cascade,
  title                              text not null,
  description                        text,
  assigned_household_member_id       uuid not null,
  due_date                           date,
  status                             text not null default 'open' check (status in ('open', 'completed')),
  completed_at                       timestamptz,
  completed_by_household_member_id   uuid,
  created_at                         timestamptz not null default now(),

  check ((status = 'completed') = (completed_at is not null)),

  foreign key (template_id, household_id)
    references public.chore_templates (id, household_id) on delete cascade,
  foreign key (assigned_household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict,
  foreign key (completed_by_household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict
);

alter table public.chore_occurrences enable row level security;

create index chore_occurrences_household_id_idx on public.chore_occurrences (household_id);
create index chore_occurrences_template_id_idx on public.chore_occurrences (template_id);

-- DB-level enforcement of "at most one open occurrence per template at a
-- time" (types.ts's documented invariant) — not just an application
-- convention.
create unique index chore_occurrences_one_open_per_template
  on public.chore_occurrences (template_id)
  where status = 'open';

-- ----------------------------------------------------------------------------
-- RLS — read-only for household members. No INSERT/UPDATE/DELETE policy on
-- any of the three tables at all; every write goes through a RPC below.
-- ----------------------------------------------------------------------------

create policy "members can view household chore templates"
on public.chore_templates for select
to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can view household chore rotation members"
on public.chore_rotation_members for select
to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can view household chore occurrences"
on public.chore_occurrences for select
to authenticated
using ( (select private.is_household_member(household_id)) );

-- ----------------------------------------------------------------------------
-- create_chore_template — creates the template (+ rotation list, if any) and
-- its first occurrence atomically. Mirrors tasks/store.ts's old addChore.
-- ----------------------------------------------------------------------------

create or replace function public.create_chore_template(
  p_household_id uuid,
  p_title text,
  p_description text,
  p_assignment_type text,
  p_assignee_member_id uuid,
  p_rotation_member_ids uuid[],
  p_recurrence text,
  p_due_date date
)
returns public.chore_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template public.chore_templates;
  v_first_assignee uuid;
  v_i int;
begin
  if not exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = (select auth.uid())
  ) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'Title is required.' using errcode = 'P0004';
  end if;

  if p_assignment_type = 'fixed' then
    v_first_assignee := p_assignee_member_id;
  elsif p_assignment_type = 'rotating' then
    if p_rotation_member_ids is null or array_length(p_rotation_member_ids, 1) is null then
      raise exception 'At least one rotation member is required.' using errcode = 'P0004';
    end if;
    v_first_assignee := p_rotation_member_ids[1];
  else
    raise exception 'Invalid assignment type.' using errcode = 'P0004';
  end if;

  if v_first_assignee is null then
    raise exception 'An assignee is required.' using errcode = 'P0004';
  end if;

  insert into public.chore_templates (
    household_id, title, description, assignment_type, assignee_household_member_id, recurrence, active
  ) values (
    p_household_id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
    p_assignment_type,
    case when p_assignment_type = 'fixed' then p_assignee_member_id else null end,
    p_recurrence, true
  )
  returning * into v_template;

  if p_assignment_type = 'rotating' then
    for v_i in 1 .. array_length(p_rotation_member_ids, 1) loop
      insert into public.chore_rotation_members (template_id, household_id, household_member_id, position)
      values (v_template.id, p_household_id, p_rotation_member_ids[v_i], v_i);
    end loop;
  end if;

  insert into public.chore_occurrences (
    template_id, household_id, title, description, assigned_household_member_id, due_date, status
  ) values (
    v_template.id, p_household_id, v_template.title, v_template.description,
    v_first_assignee,
    coalesce(p_due_date, case when p_recurrence = 'none' then null else current_date end),
    'open'
  );

  return v_template;
end;
$$;

revoke all on function public.create_chore_template(uuid, text, text, text, uuid, uuid[], text, date) from public;
grant execute on function public.create_chore_template(uuid, text, text, text, uuid, uuid[], text, date) to authenticated;

-- ----------------------------------------------------------------------------
-- update_chore_template — edits the template, optionally replaces the
-- rotation list wholesale, and reassigns the current OPEN occurrence per
-- exactly the same rule as completion.ts's computeReassignedCurrentAssignee:
-- an explicit "currently assigned to" pick wins if still eligible; otherwise
-- the existing holder keeps it if still eligible; otherwise it falls back to
-- the new list's first member. Completed history is never touched (occurrence
-- lookup is scoped to status = 'open').
-- ----------------------------------------------------------------------------

create or replace function public.update_chore_template(
  p_template_id uuid,
  p_title text default null,
  p_description text default null,
  p_assignment_type text default null,
  p_assignee_member_id uuid default null,
  p_rotation_member_ids uuid[] default null,
  p_explicit_current_assignee_id uuid default null
)
returns public.chore_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template public.chore_templates;
  v_occurrence public.chore_occurrences;
  v_new_assignment_type text;
  v_reassigned uuid;
  v_i int;
begin
  select * into v_template from public.chore_templates where id = p_template_id;
  if not found then
    raise exception 'Chore not found.' using errcode = 'P0003';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = v_template.household_id and user_id = (select auth.uid())
  ) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  v_new_assignment_type := coalesce(p_assignment_type, v_template.assignment_type);

  update public.chore_templates
  set
    title = coalesce(nullif(btrim(p_title), ''), title),
    description = case when p_description is not null then nullif(btrim(p_description), '') else description end,
    assignment_type = v_new_assignment_type,
    assignee_household_member_id = case
      when v_new_assignment_type = 'fixed' then coalesce(p_assignee_member_id, assignee_household_member_id)
      else null
    end,
    updated_at = now()
  where id = p_template_id
  returning * into v_template;

  if p_rotation_member_ids is not null then
    delete from public.chore_rotation_members where template_id = p_template_id;
    for v_i in 1 .. coalesce(array_length(p_rotation_member_ids, 1), 0) loop
      insert into public.chore_rotation_members (template_id, household_id, household_member_id, position)
      values (p_template_id, v_template.household_id, p_rotation_member_ids[v_i], v_i);
    end loop;
  end if;

  select * into v_occurrence
  from public.chore_occurrences
  where template_id = p_template_id and status = 'open'
  limit 1;

  if found then
    if v_template.assignment_type = 'fixed' then
      v_reassigned := coalesce(v_template.assignee_household_member_id, v_occurrence.assigned_household_member_id);
    else
      if p_explicit_current_assignee_id is not null and exists (
        select 1 from public.chore_rotation_members
        where template_id = p_template_id and household_member_id = p_explicit_current_assignee_id
      ) then
        v_reassigned := p_explicit_current_assignee_id;
      elsif exists (
        select 1 from public.chore_rotation_members
        where template_id = p_template_id and household_member_id = v_occurrence.assigned_household_member_id
      ) then
        v_reassigned := v_occurrence.assigned_household_member_id;
      else
        select household_member_id into v_reassigned
        from public.chore_rotation_members
        where template_id = p_template_id
        order by position
        limit 1;
        v_reassigned := coalesce(v_reassigned, v_occurrence.assigned_household_member_id);
      end if;
    end if;

    if v_reassigned is not null and v_reassigned <> v_occurrence.assigned_household_member_id then
      update public.chore_occurrences
      set assigned_household_member_id = v_reassigned
      where id = v_occurrence.id;
    end if;
  end if;

  return v_template;
end;
$$;

revoke all on function public.update_chore_template(uuid, text, text, text, uuid, uuid[], uuid) from public;
grant execute on function public.update_chore_template(uuid, text, text, text, uuid, uuid[], uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- stop_chore_template / delete_one_time_chore — small atomic guards, mirrors
-- tasks/store.ts's stopChore / deleteOneTimeChore exactly.
-- ----------------------------------------------------------------------------

create or replace function public.stop_chore_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id from public.chore_templates where id = p_template_id;
  if v_household_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = v_household_id and user_id = (select auth.uid())
  ) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  update public.chore_templates
  set active = false, updated_at = now()
  where id = p_template_id and active = true;

  delete from public.chore_occurrences
  where template_id = p_template_id and status = 'open';
end;
$$;

revoke all on function public.stop_chore_template(uuid) from public;
grant execute on function public.stop_chore_template(uuid) to authenticated;

create or replace function public.delete_one_time_chore(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template public.chore_templates;
  v_occurrence public.chore_occurrences;
begin
  select * into v_template from public.chore_templates where id = p_template_id;
  if not found or v_template.recurrence <> 'none' then
    return;
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = v_template.household_id and user_id = (select auth.uid())
  ) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  select * into v_occurrence from public.chore_occurrences where template_id = p_template_id;
  if not found or v_occurrence.status <> 'open' then
    return;
  end if;

  delete from public.chore_occurrences where id = v_occurrence.id;
  delete from public.chore_templates where id = p_template_id;
end;
$$;

revoke all on function public.delete_one_time_chore(uuid) from public;
grant execute on function public.delete_one_time_chore(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- complete_chore_occurrence — the server-authoritative completion transition
-- (plan section 8). Locks the occurrence row first (`for update`), so two
-- roommates completing the same chore at the same moment serialize: whoever
-- commits first wins, the second sees status = 'completed' after acquiring
-- the lock and safely no-ops instead of double-generating a next occurrence.
-- completed_by is derived from the caller's own household_members.id — never
-- taken from client input. Returns the newly generated occurrence's id, or
-- null if none was generated (one-time chore, stopped template, or a no-op
-- because it was already completed).
-- ----------------------------------------------------------------------------

create or replace function public.complete_chore_occurrence(p_occurrence_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occurrence public.chore_occurrences;
  v_template public.chore_templates;
  v_member_id uuid;
  v_next_assignee uuid;
  v_next_due_date date;
  v_next_id uuid;
begin
  select * into v_occurrence
  from public.chore_occurrences
  where id = p_occurrence_id
  for update;

  if not found then
    raise exception 'Chore occurrence not found.' using errcode = 'P0003';
  end if;

  select id into v_member_id
  from public.household_members
  where household_id = v_occurrence.household_id and user_id = (select auth.uid());

  if v_member_id is null then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  if v_occurrence.status = 'completed' then
    return null;
  end if;

  update public.chore_occurrences
  set status = 'completed', completed_at = now(), completed_by_household_member_id = v_member_id
  where id = p_occurrence_id;

  select * into v_template from public.chore_templates where id = v_occurrence.template_id;

  if v_template is null or not v_template.active or v_template.recurrence = 'none' then
    return null;
  end if;

  if v_template.assignment_type = 'fixed' then
    v_next_assignee := v_template.assignee_household_member_id;
  else
    -- Next position after the completer's; wraps to the first member if the
    -- completer was last (or is no longer in the list at all) — the same
    -- rule as completion.ts's getNextRotationAssignee.
    select household_member_id into v_next_assignee
    from public.chore_rotation_members
    where template_id = v_template.id
      and position > coalesce((
        select position from public.chore_rotation_members
        where template_id = v_template.id and household_member_id = v_occurrence.assigned_household_member_id
      ), -1)
    order by position
    limit 1;

    if v_next_assignee is null then
      select household_member_id into v_next_assignee
      from public.chore_rotation_members
      where template_id = v_template.id
      order by position
      limit 1;
    end if;
  end if;

  if v_next_assignee is null then
    return null;
  end if;

  v_next_due_date := private.next_chore_due_date(v_occurrence.due_date, v_template.recurrence);

  insert into public.chore_occurrences (
    template_id, household_id, title, description, assigned_household_member_id, due_date, status
  ) values (
    v_template.id, v_template.household_id, v_template.title, v_template.description,
    v_next_assignee, v_next_due_date, 'open'
  )
  returning id into v_next_id;

  return v_next_id;
end;
$$;

revoke all on function public.complete_chore_occurrence(uuid) from public;
grant execute on function public.complete_chore_occurrence(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- undo_chore_completion — reverses the single most recent completion,
-- including removing the occurrence it generated (if any). The client only
-- ever calls this immediately after its own completion (ephemeral "Undo"
-- affordance, not a general history-revert tool), but it's still guarded
-- server-side: it only touches occurrences that are actually 'completed' /
-- 'open' respectively, so a stale or repeated call is a safe no-op.
-- ----------------------------------------------------------------------------

create or replace function public.undo_chore_completion(
  p_occurrence_id uuid,
  p_generated_occurrence_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id from public.chore_occurrences where id = p_occurrence_id;
  if v_household_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = v_household_id and user_id = (select auth.uid())
  ) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  if p_generated_occurrence_id is not null then
    delete from public.chore_occurrences
    where id = p_generated_occurrence_id and status = 'open';
  end if;

  update public.chore_occurrences
  set status = 'open', completed_at = null, completed_by_household_member_id = null
  where id = p_occurrence_id and status = 'completed';
end;
$$;

revoke all on function public.undo_chore_completion(uuid, uuid) from public;
grant execute on function public.undo_chore_completion(uuid, uuid) to authenticated;
