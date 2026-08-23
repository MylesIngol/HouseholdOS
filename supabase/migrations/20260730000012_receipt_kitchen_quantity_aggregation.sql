-- ============================================================================
-- Milestone 7 — Checkpoint H refinement: receipt Kitchen import quantity
-- aggregation.
--
-- Problem: if the same product appears on multiple receipt lines (e.g. two
-- "Beef Top Blade" lines at different prices), confirm_receipt's Kitchen
-- import previously created one inventory row PER LINE — two lines meant two
-- Kitchen rows, each implicitly "quantity 1." Desired: one Kitchen row,
-- quantity = 2.
--
-- 00010/00011 are already applied to the live database, so this is another
-- additive migration (following 00011's precedent) that CREATE OR REPLACEs
-- public.confirm_receipt with a corrected function body, not an edit to
-- either already-applied file.
--
-- Grouping identity (within ONE p_items array, for THIS confirmation only):
--   1. same barcode -> same product. Barcode is authoritative.
--   2/3. no barcode -> private.normalize_product_key(cleaned_name) — the
--        SAME normalization household_product_memory already uses as a
--        no-barcode product's stable identity (see that function's own
--        comment in 00010). Using it here too is what makes "same stable
--        product-memory identity" and "same normalized cleaned name" the
--        same rule for the no-barcode case, rather than two separate rules
--        that could disagree — there's only one no-barcode identity concept
--        in this schema today, and this is it.
--
-- This grouping is scoped to THIS ONE p_items array only. It decides which
-- RECEIPT LINES represent the same purchased product within one confirmed
-- transaction — it is NOT a general inventory name-merge rule. A no-barcode
-- group still always creates exactly one NEW inventory row and never
-- finds-and-merges into a pre-existing row by name (adjustment 2 / R7's
-- guarantee, which is entirely about EXISTING inventory rows and is
-- untouched by this migration — the grouping subquery below only ever reads
-- from p_items, never from inventory_items).
--
-- purchased_quantity per group = count of matching lines today, since
-- p_items carries no per-line quantity field yet (ReviewItem has none —
-- Checkpoint G's review UI never collects one). The `line_quantity`
-- extraction below already reads an optional `quantity` field per element,
-- for a future caller that sends one, in place of the "1 line = 1 unit"
-- default — but only when it parses as a clean positive integer
-- (`^[1-9][0-9]*$`), never a guess from ambiguous/decimal text. No caller
-- populates this field today, so purchased_quantity is in practice always
-- exactly the matching line count — but the aggregation math is already
-- shaped for the day one does, without needing to change again.
--
-- Existing-row quantity rules only apply when "count semantics" are
-- appropriate for that row — unit is unset or already 'count'. A
-- weight/volume-tracked row ('lb', 'oz', 'g', 'kg', 'ml', 'l') isn't
-- something a receipt LINE COUNT can honestly update, so those keep the
-- same low-effort status-only touch as before:
--   - existing active row, count semantics ok: quantity = coalesce(existing,
--     0) + purchased_quantity (one formula covers both "existing quantity,
--     increment" and "existing quantity null, set" — coalesce(null, 0) +
--     purchased is just purchased).
--   - existing Out row, count semantics ok: quantity is SET to
--     purchased_quantity, not incremented — an Out row's old quantity was
--     however-much-was-left when it was marked Out (i.e. stale/depleted),
--     so adding to it would double count; the newly purchased amount is
--     what's actually on hand after this restock. This is the "update
--     quantity conservatively" rule.
--   - either row shape, count semantics NOT ok (a weight/volume unit):
--     status-only touch, exactly as before this migration.
--
-- Money/reconciliation is completely unchanged — the equal-split/
-- discount/tax allocation loop (this function's step 4/5) still walks
-- EVERY p_items line individually, in original order, exactly as before.
-- Only step 6 (Kitchen import) groups lines; expense_shares still reflects
-- each line's own independent assignment. Product-memory writes (step 6b)
-- also stay per-line, unaggregated — repeated lines for the same product
-- just upsert the same memory row more than once, which was already
-- idempotent (on conflict do update) and is unaffected by this migration.
-- ============================================================================

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
  v_count_semantics_ok    boolean;
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
  --
  -- jsonb_array_elements(...) with ordinality as t(elem, ord), rather than
  -- jsonb_to_recordset(...) with ordinality as x(...col defs...) — see
  -- migration 00011's header (WITH ORDINALITY cannot combine with a column
  -- definition list without ROWS FROM()). `elem` is walked in p_items' own
  -- array order via `ord`, and each field is pulled out explicitly below.
  for v_item in
    select
      elem ->> 'item_id' as item_id,
      elem ->> 'cleaned_name' as cleaned_name,
      (elem ->> 'total_price_cents')::int as total_price_cents,
      elem -> 'assigned_member_ids' as assigned_member_ids,
      (elem ->> 'add_to_kitchen')::boolean as add_to_kitchen,
      elem ->> 'category' as category,
      elem ->> 'barcode' as barcode,
      ord
    from jsonb_array_elements(p_items) with ordinality as t(elem, ord)
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
    -- key or sending `[]` -- that would otherwise blow past the `is null`
    -- guard below and crash jsonb_array_length on a non-array. Normalize
    -- both shapes to an empty array up front so a hostile payload gets a
    -- clean rejection, not a raw error.
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
  -- Unaffected by Kitchen aggregation below: every receipt LINE still
  -- contributes its own equal-split to v_pretax above, in original order.
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

  -- 6. Kitchen import, AGGREGATED per receipt (this migration's change).
  -- Group add_to_kitchen=true lines by barcode-or-normalized-name (see this
  -- migration's header for the full rationale), then write ONE inventory
  -- row per group instead of one per line.
  for v_item in
    select
      group_key,
      (array_agg(cleaned_name order by ord))[1] as cleaned_name,
      (array_agg(barcode order by ord) filter (where barcode is not null))[1] as barcode,
      (array_agg(category order by ord) filter (where category is not null))[1] as category,
      sum(line_quantity)::int as purchased_quantity
    from (
      select
        elem ->> 'cleaned_name' as cleaned_name,
        nullif(btrim(elem ->> 'barcode'), '') as barcode,
        nullif(btrim(elem ->> 'category'), '') as category,
        -- Only trust a per-line `quantity` field when it's a clean positive
        -- integer string — no caller sends this field today (see header),
        -- so this always falls through to "1 line = 1 unit" in practice.
        case
          when (elem ->> 'quantity') ~ '^[1-9][0-9]*$' then (elem ->> 'quantity')::int
          else 1
        end as line_quantity,
        case
          when nullif(btrim(elem ->> 'barcode'), '') is not null
            then 'barcode:' || nullif(btrim(elem ->> 'barcode'), '')
          else 'name:' || private.normalize_product_key(elem ->> 'cleaned_name')
        end as group_key,
        ord
      from jsonb_array_elements(p_items) with ordinality as t(elem, ord)
      where coalesce((elem ->> 'add_to_kitchen')::boolean, false)
    ) lines
    group by group_key
  loop
    if v_item.barcode is not null then
      select * into v_inventory from public.inventory_items
      where household_id = v_receipt.household_id and barcode = v_item.barcode
      limit 1 for update;

      if found then
        -- Count semantics only apply when the existing row's unit is unset
        -- or already 'count' — a weight/volume-tracked row isn't something
        -- a receipt line count can honestly update.
        v_count_semantics_ok := (v_inventory.unit is null or v_inventory.unit = 'count');

        if v_inventory.status = 'out' then
          if v_count_semantics_ok then
            -- SET, not increment — see header's "update quantity
            -- conservatively" note.
            update public.inventory_items
            set status = 'in_stock', quantity = v_item.purchased_quantity, unit = 'count', updated_at = now()
            where id = v_inventory.id;
          else
            update public.inventory_items
            set status = 'in_stock', updated_at = now()
            where id = v_inventory.id;
          end if;
          v_kitchen_restored := v_kitchen_restored + 1;
        else
          if v_count_semantics_ok then
            -- coalesce(existing, 0) + purchased covers both "existing
            -- quantity -> increment" and "existing quantity null -> set"
            -- with one formula.
            update public.inventory_items
            set status = 'in_stock',
                quantity = coalesce(v_inventory.quantity, 0) + v_item.purchased_quantity,
                unit = 'count',
                updated_at = now()
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
        where household_id = v_receipt.household_id and product_key = v_item.barcode
        limit 1;

        insert into public.inventory_items (household_id, name, category, location, status, quantity, unit, barcode)
        values (
          v_receipt.household_id,
          coalesce(nullif(btrim(v_memory.preferred_name), ''), v_item.cleaned_name),
          private.normalize_kitchen_category(coalesce(v_memory.category, v_item.category)),
          coalesce(v_memory.storage_location, 'pantry'),
          'in_stock',
          v_item.purchased_quantity,
          'count',
          v_item.barcode
        );
        v_kitchen_created := v_kitchen_created + 1;
      end if;
    else
      -- No barcode: ALWAYS create a new item, grouped by normalized name
      -- WITHIN this receipt only — never finds-and-merges into an existing
      -- inventory row (adjustment 2, R7's guarantee, unchanged).
      select * into v_memory from public.household_product_memory
      where household_id = v_receipt.household_id
        and product_key = private.normalize_product_key(v_item.cleaned_name)
      limit 1;

      insert into public.inventory_items (household_id, name, category, location, status, quantity, unit)
      values (
        v_receipt.household_id,
        coalesce(nullif(btrim(v_memory.preferred_name), ''), v_item.cleaned_name),
        private.normalize_kitchen_category(coalesce(v_memory.category, v_item.category)),
        coalesce(v_memory.storage_location, 'pantry'),
        'in_stock',
        v_item.purchased_quantity,
        'count'
      );
      v_kitchen_created := v_kitchen_created + 1;
    end if;
  end loop;

  -- 6b. Product memory: remembered for EVERY confirmed item, not just the
  -- ones added to Kitchen (adjustment 5) — unaffected by the aggregation
  -- above, still runs per RECEIPT LINE. Repeated lines for the same product
  -- just upsert the same memory row more than once, which is harmless and
  -- was already idempotent (on conflict do update).
  for v_item in
    select * from jsonb_to_recordset(p_items) as x(
      item_id text, cleaned_name text, total_price_cents int, assigned_member_ids jsonb,
      add_to_kitchen boolean, category text, barcode text
    )
  loop
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
