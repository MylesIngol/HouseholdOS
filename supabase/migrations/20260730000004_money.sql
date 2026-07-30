-- ============================================================================
-- Milestone 6 — Checkpoint F: Money (expenses, settlements, bills, recurring
-- bill templates)
--
-- Same "read-only RLS, every write through a SECURITY DEFINER RPC" pattern
-- as Tasks, for the same reason plus one more: parent+shares atomicity (plan
-- section 5) — an expense/bill and its per-member shares must commit
-- together or not at all, and a deferred constraint trigger enforces that
-- the shares always sum to exactly the parent's amount, at commit time.
-- Settlements are the one exception: a single simple table with no child
-- rows and no cross-row invariant, so plain RLS-gated CRUD is enough —
-- wrapping a one-row insert in an RPC would add nothing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- date-math helper for recurring bills, ported from bill-payment.ts's
-- computeNextOccurrenceDueDate: next calendar month after the latest known
-- occurrence (or a reference date if there is none), day-of-month clamped to
-- the target month's last valid day. day_of_month supports the full 1-31
-- range (plan section 4), not capped at 28.
-- ----------------------------------------------------------------------------

create or replace function private.next_bill_due_date(
  p_latest_due_date date,
  p_day_of_month int,
  p_reference_date date
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_base date;
  v_first_of_next_month date;
  v_days_in_month int;
  v_clamped_day int;
begin
  v_base := coalesce(p_latest_due_date, p_reference_date);
  v_first_of_next_month := (date_trunc('month', v_base) + interval '1 month')::date;
  v_days_in_month := extract(day from (v_first_of_next_month + interval '1 month' - interval '1 day'))::int;
  v_clamped_day := least(p_day_of_month, v_days_in_month);
  return v_first_of_next_month + (v_clamped_day - 1);
end;
$$;

revoke all on function private.next_bill_due_date(date, int, date) from public;

-- ----------------------------------------------------------------------------
-- expenses / expense_shares
-- ----------------------------------------------------------------------------

create table public.expenses (
  id                              uuid primary key default gen_random_uuid(),
  household_id                    uuid not null references public.households (id) on delete cascade,
  description                     text not null check (btrim(description) <> ''),
  amount_cents                    int not null check (amount_cents > 0),
  category                        text not null check (category in (
                                    'groceries', 'household_supplies', 'utilities', 'dining',
                                    'transportation', 'bill', 'other'
                                  )),
  paid_by_household_member_id     uuid not null,
  date                             date not null,
  split_mode                      text not null check (split_mode in ('equal', 'custom')),
  notes                           text,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),

  unique (id, household_id),
  foreign key (paid_by_household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict
);

alter table public.expenses enable row level security;

create index expenses_household_id_idx on public.expenses (household_id);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function private.set_updated_at();

create table public.expense_shares (
  id                    uuid primary key default gen_random_uuid(),
  expense_id            uuid not null,
  household_id          uuid not null references public.households (id) on delete cascade,
  household_member_id   uuid not null,
  amount_cents          int not null check (amount_cents >= 0),

  unique (expense_id, household_member_id),
  foreign key (expense_id, household_id)
    references public.expenses (id, household_id) on delete cascade,
  foreign key (household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict
);

alter table public.expense_shares enable row level security;

create index expense_shares_expense_id_idx on public.expense_shares (expense_id);

-- ----------------------------------------------------------------------------
-- settlements — plain RLS CRUD (no RPC): single table, no child rows, no
-- sum invariant to protect.
-- ----------------------------------------------------------------------------

create table public.settlements (
  id                          uuid primary key default gen_random_uuid(),
  household_id                uuid not null references public.households (id) on delete cascade,
  from_household_member_id    uuid not null,
  to_household_member_id      uuid not null,
  amount_cents                int not null check (amount_cents > 0),
  date                         date not null,
  note                        text,
  created_at                  timestamptz not null default now(),

  check (from_household_member_id <> to_household_member_id),
  foreign key (from_household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict,
  foreign key (to_household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict
);

alter table public.settlements enable row level security;

create index settlements_household_id_idx on public.settlements (household_id);

-- ----------------------------------------------------------------------------
-- recurring_bill_templates / recurring_bill_participants
-- ----------------------------------------------------------------------------

create table public.recurring_bill_templates (
  id                              uuid primary key default gen_random_uuid(),
  household_id                    uuid not null references public.households (id) on delete cascade,
  name                            text not null check (btrim(name) <> ''),
  amount_cents                    int not null check (amount_cents > 0),
  day_of_month                    int not null check (day_of_month between 1 and 31),
  responsible_household_member_id uuid,
  split_mode                      text not null check (split_mode in ('equal', 'custom')),
  notes                           text,
  created_at                      timestamptz not null default now(),

  unique (id, household_id),
  foreign key (responsible_household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict
);

alter table public.recurring_bill_templates enable row level security;

create index recurring_bill_templates_household_id_idx on public.recurring_bill_templates (household_id);

-- Relational participant list (plan section 3 — no uuid[]). `share_amount_cents`
-- is populated only when the template's split_mode is 'custom' — that's what
-- lets a custom split survive being regenerated next month (the previous
-- equal-split-only fallback is what this fixes); an 'equal' template computes
-- its split fresh at generation time from this same member list.
create table public.recurring_bill_participants (
  id                    uuid primary key default gen_random_uuid(),
  template_id           uuid not null,
  household_id          uuid not null references public.households (id) on delete cascade,
  household_member_id   uuid not null,
  share_amount_cents    int check (share_amount_cents is null or share_amount_cents >= 0),

  unique (template_id, household_member_id),
  foreign key (template_id, household_id)
    references public.recurring_bill_templates (id, household_id) on delete cascade,
  foreign key (household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict
);

alter table public.recurring_bill_participants enable row level security;

create index recurring_bill_participants_template_id_idx on public.recurring_bill_participants (template_id);

-- ----------------------------------------------------------------------------
-- bills / bill_shares
-- ----------------------------------------------------------------------------

create table public.bills (
  id                              uuid primary key default gen_random_uuid(),
  household_id                    uuid not null references public.households (id) on delete cascade,
  name                            text not null check (btrim(name) <> ''),
  amount_cents                    int not null check (amount_cents > 0),
  due_date                        date not null,
  responsible_household_member_id uuid,
  split_mode                      text not null check (split_mode in ('equal', 'custom')),
  recurrence                      text not null check (recurrence in ('one_time', 'monthly')),
  recurring_bill_id               uuid,
  status                          text not null default 'upcoming' check (status in ('upcoming', 'paid')),
  paid_at                         date,
  linked_expense_id               uuid,
  notes                           text,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),

  check ((recurrence = 'monthly') = (recurring_bill_id is not null)),
  check ((status = 'paid') = (paid_at is not null)),
  check ((status = 'paid') = (linked_expense_id is not null)),

  unique (id, household_id),
  foreign key (responsible_household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict,
  foreign key (recurring_bill_id, household_id)
    references public.recurring_bill_templates (id, household_id) on delete restrict,
  -- No ON DELETE action needed on the linked-expense FK: delete_expense()
  -- below always clears this column (reopening the bill) in the same
  -- transaction, before the expense row itself is deleted.
  foreign key (linked_expense_id, household_id)
    references public.expenses (id, household_id)
);

alter table public.bills enable row level security;

create index bills_household_id_idx on public.bills (household_id);
create index bills_recurring_bill_id_idx on public.bills (recurring_bill_id);

create trigger bills_set_updated_at
  before update on public.bills
  for each row execute function private.set_updated_at();

create table public.bill_shares (
  id                    uuid primary key default gen_random_uuid(),
  bill_id               uuid not null,
  household_id          uuid not null references public.households (id) on delete cascade,
  household_member_id   uuid not null,
  amount_cents          int not null check (amount_cents >= 0),

  unique (bill_id, household_member_id),
  foreign key (bill_id, household_id)
    references public.bills (id, household_id) on delete cascade,
  foreign key (household_member_id, household_id)
    references public.household_members (id, household_id) on delete restrict
);

alter table public.bill_shares enable row level security;

create index bill_shares_bill_id_idx on public.bill_shares (bill_id);

-- ----------------------------------------------------------------------------
-- Deferred sum-matching constraints (plan technical note: deferred
-- constraint triggers tolerate the transient mid-transaction states an RPC's
-- delete-then-reinsert-shares sequence passes through, only checking once
-- the whole transaction is about to commit).
-- ----------------------------------------------------------------------------

create or replace function private.assert_expense_shares_match(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
  v_sum int;
begin
  select amount_cents into v_total from public.expenses where id = p_expense_id;
  if v_total is null then return; end if; -- the expense itself was deleted in this transaction
  select coalesce(sum(amount_cents), 0) into v_sum from public.expense_shares where expense_id = p_expense_id;
  if v_sum <> v_total then
    raise exception 'Expense shares (%) must sum to the expense amount (%).', v_sum, v_total;
  end if;
end;
$$;

revoke all on function private.assert_expense_shares_match(uuid) from public;

create or replace function private.check_expense_shares_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_expense_shares_match(coalesce(new.expense_id, old.expense_id));
  return null;
end;
$$;

revoke all on function private.check_expense_shares_trigger() from public;

create constraint trigger expense_shares_sum_check
  after insert or update or delete on public.expense_shares
  deferrable initially deferred
  for each row execute function private.check_expense_shares_trigger();

create or replace function private.check_expense_amount_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_expense_shares_match(new.id);
  return null;
end;
$$;

revoke all on function private.check_expense_amount_trigger() from public;

create constraint trigger expenses_amount_shares_check
  after update of amount_cents on public.expenses
  deferrable initially deferred
  for each row execute function private.check_expense_amount_trigger();

create or replace function private.assert_bill_shares_match(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
  v_sum int;
begin
  select amount_cents into v_total from public.bills where id = p_bill_id;
  if v_total is null then return; end if;
  select coalesce(sum(amount_cents), 0) into v_sum from public.bill_shares where bill_id = p_bill_id;
  if v_sum <> v_total then
    raise exception 'Bill shares (%) must sum to the bill amount (%).', v_sum, v_total;
  end if;
end;
$$;

revoke all on function private.assert_bill_shares_match(uuid) from public;

create or replace function private.check_bill_shares_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_bill_shares_match(coalesce(new.bill_id, old.bill_id));
  return null;
end;
$$;

revoke all on function private.check_bill_shares_trigger() from public;

create constraint trigger bill_shares_sum_check
  after insert or update or delete on public.bill_shares
  deferrable initially deferred
  for each row execute function private.check_bill_shares_trigger();

create or replace function private.check_bill_amount_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_bill_shares_match(new.id);
  return null;
end;
$$;

revoke all on function private.check_bill_amount_trigger() from public;

create constraint trigger bills_amount_shares_check
  after update of amount_cents on public.bills
  deferrable initially deferred
  for each row execute function private.check_bill_amount_trigger();

-- Same idea for a 'custom' recurring template's frozen per-member shares —
-- only enforced in 'custom' mode; 'equal' templates carry no stored amounts.
create or replace function private.assert_recurring_participants_match(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template public.recurring_bill_templates;
  v_sum int;
begin
  select * into v_template from public.recurring_bill_templates where id = p_template_id;
  if v_template.id is null or v_template.split_mode <> 'custom' then return; end if;
  select coalesce(sum(share_amount_cents), 0) into v_sum
  from public.recurring_bill_participants where template_id = p_template_id;
  if v_sum <> v_template.amount_cents then
    raise exception 'Recurring bill custom shares (%) must sum to the template amount (%).', v_sum, v_template.amount_cents;
  end if;
end;
$$;

revoke all on function private.assert_recurring_participants_match(uuid) from public;

create or replace function private.check_recurring_participants_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_recurring_participants_match(coalesce(new.template_id, old.template_id));
  return null;
end;
$$;

revoke all on function private.check_recurring_participants_trigger() from public;

create constraint trigger recurring_bill_participants_sum_check
  after insert or update or delete on public.recurring_bill_participants
  deferrable initially deferred
  for each row execute function private.check_recurring_participants_trigger();

-- ----------------------------------------------------------------------------
-- RLS — read-only for household members on every table above except
-- settlements (full member CRUD, no update policy — matches the product's
-- "delete and re-record" correction path for a settlement).
-- ----------------------------------------------------------------------------

create policy "members can view household expenses"
on public.expenses for select to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can view household expense shares"
on public.expense_shares for select to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can view household settlements"
on public.settlements for select to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can record household settlements"
on public.settlements for insert to authenticated
with check ( (select private.is_household_member(household_id)) );

create policy "members can delete household settlements"
on public.settlements for delete to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can view household recurring bill templates"
on public.recurring_bill_templates for select to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can view household recurring bill participants"
on public.recurring_bill_participants for select to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can view household bills"
on public.bills for select to authenticated
using ( (select private.is_household_member(household_id)) );

create policy "members can view household bill shares"
on public.bill_shares for select to authenticated
using ( (select private.is_household_member(household_id)) );

-- ----------------------------------------------------------------------------
-- create_expense / update_expense / delete_expense
-- ----------------------------------------------------------------------------

create or replace function public.create_expense(
  p_household_id uuid,
  p_description text,
  p_amount_cents int,
  p_category text,
  p_paid_by_member_id uuid,
  p_date date,
  p_split_mode text,
  p_shares jsonb,
  p_notes text
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses;
  v_share record;
begin
  if not exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = (select auth.uid())
  ) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'Description is required.' using errcode = 'P0004';
  end if;
  if p_amount_cents <= 0 then
    raise exception 'Amount must be positive.' using errcode = 'P0004';
  end if;
  if p_shares is null or jsonb_array_length(p_shares) = 0 then
    raise exception 'At least one participant is required.' using errcode = 'P0004';
  end if;

  insert into public.expenses (
    household_id, description, amount_cents, category, paid_by_household_member_id, date, split_mode, notes
  ) values (
    p_household_id, btrim(p_description), p_amount_cents, p_category, p_paid_by_member_id, p_date, p_split_mode,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning * into v_expense;

  for v_share in select * from jsonb_to_recordset(p_shares) as x(member_id uuid, amount_cents int)
  loop
    insert into public.expense_shares (expense_id, household_id, household_member_id, amount_cents)
    values (v_expense.id, p_household_id, v_share.member_id, v_share.amount_cents);
  end loop;

  return v_expense;
end;
$$;

revoke all on function public.create_expense(uuid, text, int, text, uuid, date, text, jsonb, text) from public;
grant execute on function public.create_expense(uuid, text, int, text, uuid, date, text, jsonb, text) to authenticated;

create or replace function public.update_expense(
  p_expense_id uuid,
  p_description text,
  p_amount_cents int,
  p_category text,
  p_paid_by_member_id uuid,
  p_date date,
  p_split_mode text,
  p_shares jsonb,
  p_notes text
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses;
  v_share record;
begin
  select * into v_expense from public.expenses where id = p_expense_id;
  if not found then
    raise exception 'Expense not found.' using errcode = 'P0003';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = v_expense.household_id and user_id = (select auth.uid())
  ) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  if p_amount_cents <= 0 then
    raise exception 'Amount must be positive.' using errcode = 'P0004';
  end if;
  if p_shares is null or jsonb_array_length(p_shares) = 0 then
    raise exception 'At least one participant is required.' using errcode = 'P0004';
  end if;

  update public.expenses
  set
    description = btrim(p_description),
    amount_cents = p_amount_cents,
    category = p_category,
    paid_by_household_member_id = p_paid_by_member_id,
    date = p_date,
    split_mode = p_split_mode,
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    updated_at = now()
  where id = p_expense_id
  returning * into v_expense;

  delete from public.expense_shares where expense_id = p_expense_id;
  for v_share in select * from jsonb_to_recordset(p_shares) as x(member_id uuid, amount_cents int)
  loop
    insert into public.expense_shares (expense_id, household_id, household_member_id, amount_cents)
    values (p_expense_id, v_expense.household_id, v_share.member_id, v_share.amount_cents);
  end loop;

  return v_expense;
end;
$$;

revoke all on function public.update_expense(uuid, text, int, text, uuid, date, text, jsonb, text) from public;
grant execute on function public.update_expense(uuid, text, int, text, uuid, date, text, jsonb, text) to authenticated;

-- The atomic paid-bill correction from plan section 5: if this expense is
-- what marked a bill paid, reopen that bill in the exact same transaction
-- as the expense's deletion — a paid bill must never be left pointing at a
-- deleted expense, even transiently.
create or replace function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id from public.expenses where id = p_expense_id;
  if v_household_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = v_household_id and user_id = (select auth.uid())
  ) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  update public.bills
  set status = 'upcoming', paid_at = null, linked_expense_id = null, updated_at = now()
  where linked_expense_id = p_expense_id;

  delete from public.expenses where id = p_expense_id; -- expense_shares cascade
end;
$$;

revoke all on function public.delete_expense(uuid) from public;
grant execute on function public.delete_expense(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- create_bill / update_bill / delete_bill
-- ----------------------------------------------------------------------------

create or replace function public.create_bill(
  p_household_id uuid,
  p_name text,
  p_amount_cents int,
  p_due_date date,
  p_responsible_member_id uuid,
  p_split_mode text,
  p_shares jsonb,
  p_recurrence text,
  p_notes text
)
returns public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_template public.recurring_bill_templates;
  v_share record;
  v_day_of_month int;
begin
  if not exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = (select auth.uid())
  ) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Name is required.' using errcode = 'P0004';
  end if;
  if p_amount_cents <= 0 then
    raise exception 'Amount must be positive.' using errcode = 'P0004';
  end if;
  if p_shares is null or jsonb_array_length(p_shares) = 0 then
    raise exception 'At least one participant is required.' using errcode = 'P0004';
  end if;

  if p_recurrence = 'monthly' then
    v_day_of_month := extract(day from p_due_date)::int;

    insert into public.recurring_bill_templates (
      household_id, name, amount_cents, day_of_month, responsible_household_member_id, split_mode, notes
    ) values (
      p_household_id, btrim(p_name), p_amount_cents, v_day_of_month, p_responsible_member_id, p_split_mode,
      nullif(btrim(coalesce(p_notes, '')), '')
    )
    returning * into v_template;

    -- Freeze this bill's shares as the template's participant list — for
    -- 'custom' mode this is what lets the split survive being regenerated
    -- next month (plan section 3); for 'equal' mode the amounts themselves
    -- are recomputed fresh at generation time, only the member list matters.
    for v_share in select * from jsonb_to_recordset(p_shares) as x(member_id uuid, amount_cents int)
    loop
      insert into public.recurring_bill_participants (template_id, household_id, household_member_id, share_amount_cents)
      values (
        v_template.id, p_household_id, v_share.member_id,
        case when p_split_mode = 'custom' then v_share.amount_cents else null end
      );
    end loop;
  end if;

  insert into public.bills (
    household_id, name, amount_cents, due_date, responsible_household_member_id, split_mode,
    recurrence, recurring_bill_id, status, notes
  ) values (
    p_household_id, btrim(p_name), p_amount_cents, p_due_date, p_responsible_member_id, p_split_mode,
    p_recurrence, v_template.id, 'upcoming', nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning * into v_bill;

  for v_share in select * from jsonb_to_recordset(p_shares) as x(member_id uuid, amount_cents int)
  loop
    insert into public.bill_shares (bill_id, household_id, household_member_id, amount_cents)
    values (v_bill.id, p_household_id, v_share.member_id, v_share.amount_cents);
  end loop;

  return v_bill;
end;
$$;

revoke all on function public.create_bill(uuid, text, int, date, uuid, text, jsonb, text, text) from public;
grant execute on function public.create_bill(uuid, text, int, date, uuid, text, jsonb, text, text) to authenticated;

create or replace function public.update_bill(
  p_bill_id uuid,
  p_name text,
  p_amount_cents int,
  p_due_date date,
  p_responsible_member_id uuid,
  p_split_mode text,
  p_shares jsonb,
  p_notes text
)
returns public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_share record;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then
    raise exception 'Bill not found.' using errcode = 'P0003';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = v_bill.household_id and user_id = (select auth.uid())
  ) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  if v_bill.status <> 'upcoming' then
    -- Paid bills are read-only (their debt lives in the linked expense) --
    -- silently no-ops, mirroring the old store's updateBill guard.
    return v_bill;
  end if;

  if p_amount_cents <= 0 then
    raise exception 'Amount must be positive.' using errcode = 'P0004';
  end if;
  if p_shares is null or jsonb_array_length(p_shares) = 0 then
    raise exception 'At least one participant is required.' using errcode = 'P0004';
  end if;

  update public.bills
  set
    name = btrim(p_name),
    amount_cents = p_amount_cents,
    due_date = p_due_date,
    responsible_household_member_id = p_responsible_member_id,
    split_mode = p_split_mode,
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    updated_at = now()
  where id = p_bill_id
  returning * into v_bill;

  delete from public.bill_shares where bill_id = p_bill_id;
  for v_share in select * from jsonb_to_recordset(p_shares) as x(member_id uuid, amount_cents int)
  loop
    insert into public.bill_shares (bill_id, household_id, household_member_id, amount_cents)
    values (p_bill_id, v_bill.household_id, v_share.member_id, v_share.amount_cents);
  end loop;

  return v_bill;
end;
$$;

revoke all on function public.update_bill(uuid, text, int, date, uuid, text, jsonb, text) from public;
grant execute on function public.update_bill(uuid, text, int, date, uuid, text, jsonb, text) to authenticated;

create or replace function public.delete_bill(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then
    return;
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = v_bill.household_id and user_id = (select auth.uid())
  ) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  if v_bill.status <> 'upcoming' then
    return; -- a paid bill's history lives in its linked expense
  end if;

  delete from public.bills where id = p_bill_id; -- bill_shares cascade
end;
$$;

revoke all on function public.delete_bill(uuid) from public;
grant execute on function public.delete_bill(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- mark_bill_paid — the only place a bill's debt is ever created. Locks the
-- bill row first (`for update`) so two roommates tapping "Mark paid" on the
-- same bill at the same moment serialize instead of creating two Expenses;
-- guarded so a repeat call on an already-paid bill is a safe no-op.
-- ----------------------------------------------------------------------------

create or replace function public.mark_bill_paid(
  p_bill_id uuid,
  p_paid_by_member_id uuid,
  p_payment_date date default null
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_expense public.expenses;
  v_date date;
  v_share record;
begin
  select * into v_bill from public.bills where id = p_bill_id for update;
  if not found then
    raise exception 'Bill not found.' using errcode = 'P0003';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = v_bill.household_id and user_id = (select auth.uid())
  ) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  if v_bill.status = 'paid' then
    return null; -- already paid -- guarded no-op, never duplicates debt
  end if;

  v_date := coalesce(p_payment_date, current_date);

  insert into public.expenses (
    household_id, description, amount_cents, category, paid_by_household_member_id, date, split_mode, notes
  ) values (
    v_bill.household_id, v_bill.name, v_bill.amount_cents, 'bill', p_paid_by_member_id, v_date, v_bill.split_mode, v_bill.notes
  )
  returning * into v_expense;

  for v_share in select household_member_id, amount_cents from public.bill_shares where bill_id = p_bill_id
  loop
    insert into public.expense_shares (expense_id, household_id, household_member_id, amount_cents)
    values (v_expense.id, v_bill.household_id, v_share.household_member_id, v_share.amount_cents);
  end loop;

  update public.bills
  set status = 'paid', paid_at = v_date, linked_expense_id = v_expense.id, updated_at = now()
  where id = p_bill_id;

  return v_expense;
end;
$$;

revoke all on function public.mark_bill_paid(uuid, uuid, date) from public;
grant execute on function public.mark_bill_paid(uuid, uuid, date) to authenticated;

-- ----------------------------------------------------------------------------
-- generate_next_bill_occurrence
-- ----------------------------------------------------------------------------

create or replace function public.generate_next_bill_occurrence(p_recurring_bill_id uuid)
returns public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template public.recurring_bill_templates;
  v_latest_due_date date;
  v_next_due_date date;
  v_bill public.bills;
  v_participant record;
  v_n int;
  v_base int;
  v_remainder int;
  v_idx int;
  v_member_id uuid;
begin
  select * into v_template from public.recurring_bill_templates where id = p_recurring_bill_id;
  if not found then
    raise exception 'Recurring bill not found.' using errcode = 'P0003';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = v_template.household_id and user_id = (select auth.uid())
  ) then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  select max(due_date) into v_latest_due_date
  from public.bills
  where recurring_bill_id = p_recurring_bill_id;

  v_next_due_date := private.next_bill_due_date(v_latest_due_date, v_template.day_of_month, current_date);

  insert into public.bills (
    household_id, name, amount_cents, due_date, responsible_household_member_id, split_mode,
    recurrence, recurring_bill_id, status, notes
  ) values (
    v_template.household_id, v_template.name, v_template.amount_cents, v_next_due_date,
    v_template.responsible_household_member_id, v_template.split_mode, 'monthly', v_template.id, 'upcoming',
    v_template.notes
  )
  returning * into v_bill;

  if v_template.split_mode = 'custom' then
    for v_participant in
      select household_member_id, share_amount_cents
      from public.recurring_bill_participants
      where template_id = p_recurring_bill_id
    loop
      insert into public.bill_shares (bill_id, household_id, household_member_id, amount_cents)
      values (v_bill.id, v_template.household_id, v_participant.household_member_id, v_participant.share_amount_cents);
    end loop;
  else
    -- Equal split computed fresh at generation time, over the template's
    -- frozen participant list — same remainder rule as splitEqualCents
    -- (money-math.ts): base = floor(total/n), first `remainder` members (by
    -- a stable order) get one extra cent so the shares always sum exactly.
    select count(*) into v_n from public.recurring_bill_participants where template_id = p_recurring_bill_id;
    if v_n > 0 then
      v_base := v_template.amount_cents / v_n;
      v_remainder := v_template.amount_cents - v_base * v_n;
      v_idx := 0;
      for v_member_id in
        select household_member_id from public.recurring_bill_participants
        where template_id = p_recurring_bill_id
        order by household_member_id
      loop
        insert into public.bill_shares (bill_id, household_id, household_member_id, amount_cents)
        values (v_bill.id, v_template.household_id, v_member_id, v_base + (case when v_idx < v_remainder then 1 else 0 end));
        v_idx := v_idx + 1;
      end loop;
    end if;
  end if;

  return v_bill;
end;
$$;

revoke all on function public.generate_next_bill_occurrence(uuid) from public;
grant execute on function public.generate_next_bill_occurrence(uuid) to authenticated;
