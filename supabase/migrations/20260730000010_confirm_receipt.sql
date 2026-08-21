-- ============================================================================
-- Milestone 7 — Checkpoint H: confirm_receipt (plan sections 14, 15, 16)
--
-- The single write path from a reviewed receipt into real household data.
-- Everything here follows the Money/Tasks precedent (SELECT-only RLS on the
-- tables this touches directly + one SECURITY DEFINER RPC that self-checks
-- membership and commits everything atomically), one level stricter than
-- create_expense/mark_bill_paid: this RPC does NOT trust the client's
-- computed financial shares at all, only the client's edited item list
-- (names/prices/assignments). Every cent that ends up in expense_shares is
-- recomputed here from that item list plus receipt_imports' own immutable
-- total/subtotal/tax/discount — a modified or stale client cannot dictate
-- what anyone owes, it can at most submit an item list whose math doesn't
-- reconcile, which this function simply rejects.
--
-- The four private helpers below (split_equal_cents_ordered,
-- allocate_proportional_cents, merge/subtract/finalize cents-maps) are a
-- line-by-line port of receipt-math.ts's algorithm — same equal-split rule
-- (remainder cents go to an item's assignees by ARRAY POSITION, not member-id
-- order — the one place array order is load-bearing, hence `with ordinality`
-- everywhere an assignment list is walked) and the same largest-remainder
-- allocation for discount/tax (tie-broken by ascending member_id). Client and
-- server must agree exactly for an honest client's preview to match what
-- actually gets saved — this is what makes the "server-derived shares equal
-- client preview" test case meaningful rather than a coincidence.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Schema changes
-- ----------------------------------------------------------------------------

-- receipt_imports promoted subtotal_cents/tax_cents to real columns in
-- checkpoint E but missed discount_cents, even though Receipt/ReceiptItem
-- (receipt-validator.ts) has carried `discountCents` since checkpoint E's
-- own validator was written -- an oversight from that migration, not new
-- scope here. confirm_receipt needs it as an authoritative (not
-- client-supplied) input to the discount-allocation step, so this fixes it
-- now rather than routing around it by reading raw_model_response ad hoc.
alter table public.receipt_imports
  add column discount_cents int check (discount_cents is null or discount_cents >= 0);

-- receipt_imports already has linked_expense_id/confirmed_at (built ahead of
-- their own writer in checkpoint E's migration) — only WHO confirmed it is
-- new here, same composite-FK pattern as uploaded_by_household_member_id.
alter table public.receipt_imports
  add column confirmed_by_household_member_id uuid;

alter table public.receipt_imports
  add constraint receipt_imports_confirmed_by_check
  check ((status = 'confirmed') = (confirmed_by_household_member_id is not null));

alter table public.receipt_imports
  add foreign key (confirmed_by_household_member_id, household_id)
  references public.household_members (id, household_id) on delete restrict;

-- household_product_memory (checkpoint C) had no place to remember an
-- add-to-Kitchen preference — the barcode-confirm flow never needed one.
-- The receipt flow is the first writer that does (plan section 16 /
-- adjustment 5), and it's the same low-stakes "wrong default, one-tap fix"
-- shape as every other remembered field on this table.
alter table public.household_product_memory
  add column default_add_to_kitchen boolean not null default true;

-- ----------------------------------------------------------------------------
-- private helpers — pure SQL (no side effects), each a direct port of one
-- receipt-math.ts function. Cents-maps are represented as a jsonb object
-- {member_id: amount_cents}, not a relational shape, because they're
-- transient intermediate values inside one function call, never persisted —
-- the actual persisted shares go into expense_shares/expense rows exactly
-- like every other domain table (plan section 3's "no uuid[]" rule is about
-- persisted relationships, not scratch math).
-- ----------------------------------------------------------------------------

-- Mirrors splitEqualCents: base = floor(total/n), and the remainder cents go
-- to the FIRST `remainder` entries of p_member_ids IN ARRAY ORDER — not
-- sorted by member_id. `with ordinality` is what makes "array order" a real,
-- reproducible thing in SQL rather than an accident of query planning.
create or replace function private.split_equal_cents_ordered(p_total_cents int, p_member_ids jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with members as (
    select value as member_id, ord
    from jsonb_array_elements_text(p_member_ids) with ordinality as t(value, ord)
  ),
  n as (
    select count(*) as cnt from members
  ),
  calc as (
    select
      case when (select cnt from n) = 0 then 0 else p_total_cents / (select cnt from n) end as base_cents,
      case when (select cnt from n) = 0 then 0
           else p_total_cents - (p_total_cents / (select cnt from n)) * (select cnt from n)
      end as remainder_cents
  )
  select coalesce(
    jsonb_object_agg(
      m.member_id,
      c.base_cents + (case when m.ord <= c.remainder_cents then 1 else 0 end)
    ),
    '{}'::jsonb
  )
  from members m cross join calc c;
$$;

revoke all on function private.split_equal_cents_ordered(int, jsonb) from public;

-- Mirrors allocateProportionalCents: largest-remainder (Hare quota)
-- allocation, tie-broken by ascending member_id — the SAME tie-break rule
-- generate_next_bill_occurrence already uses for its own remainder cents
-- (`order by household_member_id`), just applied to arbitrary (not equal)
-- weights here. p_weights is a cents-map of pre-tax subtotal per member;
-- returns a cents-map of the same shape. Empty weights or a non-positive
-- weight sum returns all zeros rather than raising — a mid-review session
-- with nobody assigned anything yet must never crash this function.
create or replace function private.allocate_proportional_cents(p_total_cents int, p_weights jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with weights as (
    select key as member_id, (value)::numeric as weight_cents
    from jsonb_each_text(p_weights)
  ),
  sum_weights as (
    select coalesce(sum(weight_cents), 0) as total_weight from weights
  ),
  floored as (
    select
      w.member_id,
      case when p_total_cents = 0 or sw.total_weight <= 0 then 0
           else floor(p_total_cents::numeric * w.weight_cents / sw.total_weight)::int
      end as base_cents,
      case when p_total_cents = 0 or sw.total_weight <= 0 then 0::numeric
           else (p_total_cents::numeric * w.weight_cents / sw.total_weight)
                - floor(p_total_cents::numeric * w.weight_cents / sw.total_weight)
      end as remainder
    from weights w cross join sum_weights sw
  ),
  totals as (
    select coalesce(sum(base_cents), 0) as allocated from floored
  ),
  ranked as (
    select
      f.member_id,
      f.base_cents,
      row_number() over (order by f.remainder desc, f.member_id asc) as rnk
    from floored f
  ),
  remaining as (
    select (p_total_cents - t.allocated) as remaining_cents from totals t
  )
  select coalesce(
    jsonb_object_agg(
      r.member_id,
      r.base_cents + (case when r.rnk <= (select remaining_cents from remaining) then 1 else 0 end)
    ),
    '{}'::jsonb
  )
  from ranked r;
$$;

revoke all on function private.allocate_proportional_cents(int, jsonb) from public;

-- Sums two cents-maps key-wise (union of both key sets) — used to accumulate
-- each item's equal-split result into the running per-member pre-tax total.
create or replace function private.merge_cents_maps(p_a jsonb, p_b jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(combined.member_id, combined.total_cents), '{}'::jsonb)
  from (
    select member_id, sum(amount_cents)::int as total_cents
    from (
      select key as member_id, (value)::numeric as amount_cents from jsonb_each_text(p_a)
      union all
      select key as member_id, (value)::numeric as amount_cents from jsonb_each_text(p_b)
    ) x
    group by member_id
  ) combined;
$$;

revoke all on function private.merge_cents_maps(jsonb, jsonb) from public;

-- Mirrors subtractShares: iterates p_base's member set only (discount/tax
-- allocations are always computed over exactly that member set upstream, so
-- no member can appear in one map and not the other).
create or replace function private.subtract_cents_map(p_base jsonb, p_subtract jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(b.key, (b.value)::int - coalesce((p_subtract ->> b.key)::int, 0)),
    '{}'::jsonb
  )
  from jsonb_each_text(p_base) b;
$$;

revoke all on function private.subtract_cents_map(jsonb, jsonb) from public;

-- Mirrors the final memberShares step: pretaxItemShare - allocatedDiscount + allocatedTax.
create or replace function private.finalize_member_shares(p_pretax jsonb, p_discount jsonb, p_tax jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      p.key,
      (p.value)::int - coalesce((p_discount ->> p.key)::int, 0) + coalesce((p_tax ->> p.key)::int, 0)
    ),
    '{}'::jsonb
  )
  from jsonb_each_text(p_pretax) p;
$$;

revoke all on function private.finalize_member_shares(jsonb, jsonb, jsonb) from public;

create or replace function private.sum_cents_map(p_map jsonb)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((value)::int), 0)::int from jsonb_each_text(p_map);
$$;

revoke all on function private.sum_cents_map(jsonb) from public;

-- Kitchen's category enum is closed (plan section 6's check constraint); a
-- receipt line's `category` came from Claude's parse and is only validated
-- as "a non-empty string" client-side (receipt-validator.ts), never
-- constrained to this enum. Inserting an out-of-enum value would abort the
-- whole confirmation transaction over a cosmetic mismatch — this is what
-- keeps that failure mode from ever happening, at the cost of falling back
-- to 'other' for anything it doesn't recognize.
create or replace function private.normalize_kitchen_category(p_category text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case lower(coalesce(btrim(p_category), ''))
    when 'produce' then 'produce'
    when 'dairy' then 'dairy'
    when 'meat' then 'meat'
    when 'grains' then 'grains'
    when 'canned' then 'canned'
    when 'condiments' then 'condiments'
    when 'beverages' then 'beverages'
    when 'snacks' then 'snacks'
    when 'frozen' then 'frozen'
    else 'other'
  end;
$$;

revoke all on function private.normalize_kitchen_category(text) from public;

-- household_product_memory's product_key for a no-barcode item (plan section
-- 11 / migration 008's own note that this checkpoint is its first writer).
-- Deliberately a SUGGESTION-CACHE key only — confirm_receipt never uses this
-- to find-and-merge an existing INVENTORY row (adjustment 2's explicit "do
-- not treat a loose normalized name as globally unique"); it only ever
-- upserts a memory row, which at worst prefills a future receipt's item
-- slightly wrong, never silently merges two different physical products.
create or replace function private.normalize_product_key(p_name text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

revoke all on function private.normalize_product_key(text) from public;

-- ----------------------------------------------------------------------------
-- confirm_receipt
-- ----------------------------------------------------------------------------

create or replace function public.confirm_receipt(
  p_receipt_import_id uuid,
  p_payer_household_member_id uuid,
  -- [{item_id, cleaned_name, total_price_cents, assigned_member_ids: uuid[]
  --   (as a jsonb array, order preserved), add_to_kitchen, category, barcode}]
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt              public.receipt_imports;
  v_caller_member_id     uuid;
  v_item                 record;
  v_assignee_id          uuid;
  v_items_subtotal       int := 0;
  v_unassigned_count     int := 0;
  v_pretax                jsonb := '{}'::jsonb;
  v_discount_alloc        jsonb;
  v_post_discount          jsonb;
  v_tax_alloc              jsonb;
  v_final_shares           jsonb;
  v_total_discrepancy      int;
  v_subtotal_discrepancy   int;
  v_expense               public.expenses;
  v_product_key           text;
  v_inventory             public.inventory_items;
  v_memory                public.household_product_memory;
  v_memory_id             uuid;
  v_kitchen_created       int := 0;
  v_kitchen_restored      int := 0;
  v_kitchen_updated       int := 0;
  v_share_key             text;
  v_result                jsonb;
  v_assigned_ids          jsonb;
begin
  -- 1. Lock + fetch. FOR UPDATE serializes concurrent confirms of the same
  -- receipt (two roommates double-tapping Confirm, or a client retry racing
  -- its own timed-out first attempt) so at most one ever gets past the
  -- status check below.
  select * into v_receipt from public.receipt_imports where id = p_receipt_import_id for update;
  if not found then
    raise exception 'Receipt not found.' using errcode = 'P0003';
  end if;

  select id into v_caller_member_id
  from public.household_members
  where household_id = v_receipt.household_id and user_id = (select auth.uid());
  if v_caller_member_id is null then
    raise exception 'Not a member of this household.' using errcode = '42501';
  end if;

  -- 2. Idempotency. A second confirm (double-tap, or a client retry after a
  -- timed-out-but-actually-succeeded first attempt) returns the already-
  -- created result and touches nothing else — no second expense, no double
  -- Kitchen import, no repeated memory writes.
  if v_receipt.status = 'confirmed' then
    select * into v_expense from public.expenses where id = v_receipt.linked_expense_id;
    return jsonb_build_object(
      'expense_id', v_receipt.linked_expense_id,
      'total_cents', v_receipt.total_cents,
      'payer_household_member_id', v_expense.paid_by_household_member_id,
      'member_shares', (
        select coalesce(jsonb_agg(jsonb_build_object('member_id', household_member_id, 'amount_cents', amount_cents)), '[]'::jsonb)
        from public.expense_shares where expense_id = v_receipt.linked_expense_id
      ),
      'kitchen_items_created', 0,
      'kitchen_items_restored', 0,
      'kitchen_items_updated', 0,
      'already_confirmed', true
    );
  end if;

  -- 3. Payer must belong to this household.
  if not exists (
    select 1 from public.household_members
    where id = p_payer_household_member_id and household_id = v_receipt.household_id
  ) then
    raise exception 'Payer must be a member of this household.' using errcode = '42501';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required.' using errcode = 'P0004';
  end if;

  -- 4. Recompute everything server-side. The client's own computed shares
  -- are never read here at all — p_items only carries names/prices/
  -- assignments, nothing financial is trusted pre-computed.
  for v_item in
    select *
    from jsonb_to_recordset(p_items) with ordinality as x(
      item_id text,
      cleaned_name text,
      total_price_cents int,
      assigned_member_ids jsonb,
      add_to_kitchen boolean,
      category text,
      barcode text,
      ord bigint
    )
    order by ord
  loop
    if v_item.total_price_cents is null or v_item.total_price_cents < 0 then
      raise exception 'Every item needs a valid non-negative price.' using errcode = 'P0004';
    end if;
    if v_item.cleaned_name is null or btrim(v_item.cleaned_name) = '' then
      raise exception 'Every item needs a name.' using errcode = 'P0004';
    end if;

    v_items_subtotal := v_items_subtotal + v_item.total_price_cents;

    -- A crafted payload could send a JSON `null` rather than omitting the
    -- key or sending `[]` -- jsonb_to_recordset would then populate the
    -- column with the *jsonb value* 'null', which is NOT the same as a SQL
    -- NULL and would otherwise blow past the `is null` guard below and crash
    -- jsonb_array_length on a non-array. Normalize both shapes to an empty
    -- array up front so a hostile payload gets a clean rejection, not a raw
    -- error.
    v_assigned_ids := case
      when v_item.assigned_member_ids is null or v_item.assigned_member_ids = 'null'::jsonb
        then '[]'::jsonb
      else v_item.assigned_member_ids
    end;

    if jsonb_typeof(v_assigned_ids) <> 'array' or jsonb_array_length(v_assigned_ids) = 0 then
      v_unassigned_count := v_unassigned_count + 1;
    else
      -- A duplicated id within one item's assignee list would otherwise
      -- silently collapse inside split_equal_cents_ordered's jsonb_object_agg
      -- (last occurrence wins, one position's cents just vanish) rather than
      -- failing loudly -- reject it explicitly instead of relying on the
      -- total-reconciliation check to catch it indirectly.
      if (
        select count(distinct value) from jsonb_array_elements_text(v_assigned_ids)
      ) <> jsonb_array_length(v_assigned_ids) then
        raise exception 'An item cannot assign the same person twice.' using errcode = 'P0004';
      end if;

      -- Every assignee must belong to this receipt's household — checked
      -- per item, not just against the final merged set, so a bad id can
      -- never hide behind a legitimate one that happens to share a key.
      for v_assignee_id in
        select value::uuid from jsonb_array_elements_text(v_assigned_ids)
      loop
        if not exists (
          select 1 from public.household_members
          where id = v_assignee_id and household_id = v_receipt.household_id
        ) then
          raise exception 'One or more assigned members do not belong to this household.' using errcode = '42501';
        end if;
      end loop;

      v_pretax := private.merge_cents_maps(
        v_pretax,
        private.split_equal_cents_ordered(v_item.total_price_cents, v_assigned_ids)
      );
    end if;
  end loop;

  if v_unassigned_count > 0 then
    raise exception 'Every item must have at least one person assigned before confirming.' using errcode = 'P0004';
  end if;

  if v_receipt.subtotal_cents is not null then
    v_subtotal_discrepancy := v_items_subtotal - v_receipt.subtotal_cents;
    if abs(v_subtotal_discrepancy) > 1 then
      raise exception 'Item prices ($%) do not match the receipt''s printed subtotal ($%).',
        (v_items_subtotal::numeric / 100), (v_receipt.subtotal_cents::numeric / 100)
        using errcode = 'P0004';
    end if;
  end if;

  -- A discount larger than the items it's supposed to discount would drive a
  -- member's post-discount share negative, which expense_shares' amount_cents
  -- >= 0 check would catch anyway -- but as a raw constraint-violation error
  -- rather than one of this function's own clear messages. Reject it here
  -- instead, same "never silently absorb the difference" principle as the
  -- subtotal check above.
  if coalesce(v_receipt.discount_cents, 0) > v_items_subtotal then
    raise exception 'The discount ($%) is larger than the items it applies to ($%).',
      (coalesce(v_receipt.discount_cents, 0)::numeric / 100), (v_items_subtotal::numeric / 100)
      using errcode = 'P0004';
  end if;

  v_discount_alloc := private.allocate_proportional_cents(coalesce(v_receipt.discount_cents, 0), v_pretax);
  v_post_discount := private.subtract_cents_map(v_pretax, v_discount_alloc);
  v_tax_alloc := private.allocate_proportional_cents(coalesce(v_receipt.tax_cents, 0), v_post_discount);
  v_final_shares := private.finalize_member_shares(v_pretax, v_discount_alloc, v_tax_alloc);

  v_total_discrepancy := private.sum_cents_map(v_final_shares) - v_receipt.total_cents;
  if v_total_discrepancy <> 0 then
    raise exception 'Assigned shares ($%) do not match the receipt total ($%) — adjust an item or reload the receipt and try again.',
      (private.sum_cents_map(v_final_shares)::numeric / 100), (v_receipt.total_cents::numeric / 100)
      using errcode = 'P0004';
  end if;

  -- 5. Expense + shares. One insert each — this is a brand-new expense, not
  -- an edit, so there's no delete-then-reinsert step like update_expense.
  insert into public.expenses (
    household_id, description, amount_cents, category, paid_by_household_member_id, date, split_mode
  ) values (
    v_receipt.household_id,
    coalesce(nullif(btrim(v_receipt.merchant_name), ''), 'Receipt'),
    v_receipt.total_cents,
    'groceries',
    p_payer_household_member_id,
    -- Never defaults to today when the receipt has a reviewed purchase date
    -- (adjustment 4) — today is only ever a fallback for a receipt that
    -- never had one to begin with.
    coalesce(v_receipt.purchase_date, current_date),
    'custom'
  )
  returning * into v_expense;

  for v_share_key in select jsonb_object_keys(v_final_shares)
  loop
    insert into public.expense_shares (expense_id, household_id, household_member_id, amount_cents)
    values (v_expense.id, v_receipt.household_id, v_share_key::uuid, (v_final_shares ->> v_share_key)::int);
  end loop;

  -- 6. Kitchen import + product memory, per item.
  for v_item in
    select * from jsonb_to_recordset(p_items) as x(
      item_id text, cleaned_name text, total_price_cents int, assigned_member_ids jsonb,
      add_to_kitchen boolean, category text, barcode text
    )
  loop
    if coalesce(v_item.add_to_kitchen, false) then
      if v_item.barcode is not null and btrim(v_item.barcode) <> '' then
        select * into v_inventory from public.inventory_items
        where household_id = v_receipt.household_id and barcode = btrim(v_item.barcode)
        limit 1 for update;

        if found then
          if v_inventory.status = 'out' then
            update public.inventory_items
            set status = 'in_stock', updated_at = now()
            where id = v_inventory.id;
            v_kitchen_restored := v_kitchen_restored + 1;
          else
            -- Increment quantity only when the purchase quantity AND the
            -- existing row's unit are both reliably countable — otherwise a
            -- low-effort status touch only. Never invent a number.
            if v_inventory.unit = 'count' and v_inventory.quantity is not null then
              update public.inventory_items
              set quantity = v_inventory.quantity + 1, status = 'in_stock', updated_at = now()
              where id = v_inventory.id;
            else
              update public.inventory_items
              set status = 'in_stock', updated_at = now()
              where id = v_inventory.id;
            end if;
            v_kitchen_updated := v_kitchen_updated + 1;
          end if;
        else
          select * into v_memory from public.household_product_memory
          where household_id = v_receipt.household_id and product_key = btrim(v_item.barcode)
          limit 1;

          insert into public.inventory_items (household_id, name, category, location, status, barcode)
          values (
            v_receipt.household_id,
            coalesce(nullif(btrim(v_memory.preferred_name), ''), v_item.cleaned_name),
            private.normalize_kitchen_category(coalesce(v_memory.category, v_item.category)),
            coalesce(v_memory.storage_location, 'pantry'),
            'in_stock',
            btrim(v_item.barcode)
          );
          v_kitchen_created := v_kitchen_created + 1;
        end if;
      else
        -- No barcode: ALWAYS create a new item. A normalized-name match
        -- against an existing memory row only prefills defaults on this new
        -- row — it never finds-and-merges into an existing inventory row
        -- (adjustment 2). This is the one place a false-negative (two
        -- receipts for the truly same unbarcoded product become two
        -- inventory rows) is deliberately preferred over a false-positive
        -- (two different products silently merged).
        select * into v_memory from public.household_product_memory
        where household_id = v_receipt.household_id
          and product_key = private.normalize_product_key(v_item.cleaned_name)
        limit 1;

        insert into public.inventory_items (household_id, name, category, location, status)
        values (
          v_receipt.household_id,
          coalesce(nullif(btrim(v_memory.preferred_name), ''), v_item.cleaned_name),
          private.normalize_kitchen_category(coalesce(v_memory.category, v_item.category)),
          coalesce(v_memory.storage_location, 'pantry'),
          'in_stock'
        );
        v_kitchen_created := v_kitchen_created + 1;
      end if;
    end if;

    -- Product memory: remembered for EVERY confirmed item, not just the ones
    -- added to Kitchen this time (adjustment 5) — a never-added item's
    -- assignment/category preference is still worth remembering.
    v_product_key := coalesce(nullif(btrim(v_item.barcode), ''), private.normalize_product_key(v_item.cleaned_name));
    if v_product_key is not null and v_product_key <> '' then
      insert into public.household_product_memory (
        household_id, product_key, barcode, preferred_name, category, default_add_to_kitchen
      ) values (
        v_receipt.household_id,
        v_product_key,
        nullif(btrim(v_item.barcode), ''),
        v_item.cleaned_name,
        v_item.category,
        coalesce(v_item.add_to_kitchen, false)
      )
      on conflict (household_id, product_key) do update
      set preferred_name = excluded.preferred_name,
          category = excluded.category,
          barcode = coalesce(excluded.barcode, public.household_product_memory.barcode),
          default_add_to_kitchen = excluded.default_add_to_kitchen,
          updated_at = now()
      returning id into v_memory_id;

      delete from public.household_product_memory_assignees where memory_id = v_memory_id;
      v_assigned_ids := case
        when v_item.assigned_member_ids is null or v_item.assigned_member_ids = 'null'::jsonb
          then '[]'::jsonb
        else v_item.assigned_member_ids
      end;
      if jsonb_typeof(v_assigned_ids) = 'array' then
        for v_assignee_id in select value::uuid from jsonb_array_elements_text(v_assigned_ids)
        loop
          insert into public.household_product_memory_assignees (memory_id, household_id, household_member_id)
          values (v_memory_id, v_receipt.household_id, v_assignee_id)
          on conflict (memory_id, household_member_id) do nothing;
        end loop;
      end if;
    end if;
  end loop;

  -- 7. Finalize the receipt import — last step, so any failure above has
  -- already rolled back everything (including this) automatically.
  update public.receipt_imports
  set status = 'confirmed',
      confirmed_at = now(),
      confirmed_by_household_member_id = v_caller_member_id,
      linked_expense_id = v_expense.id
  where id = p_receipt_import_id;

  select coalesce(
    jsonb_agg(jsonb_build_object('member_id', key, 'amount_cents', (value)::int)),
    '[]'::jsonb
  ) into v_result
  from jsonb_each_text(v_final_shares);

  return jsonb_build_object(
    'expense_id', v_expense.id,
    'total_cents', v_receipt.total_cents,
    'payer_household_member_id', p_payer_household_member_id,
    'member_shares', v_result,
    'kitchen_items_created', v_kitchen_created,
    'kitchen_items_restored', v_kitchen_restored,
    'kitchen_items_updated', v_kitchen_updated,
    'already_confirmed', false
  );
end;
$$;

revoke all on function public.confirm_receipt(uuid, uuid, jsonb) from public;
grant execute on function public.confirm_receipt(uuid, uuid, jsonb) to authenticated;
