-- ============================================================================
-- pgTAP suite for confirm_receipt (Milestone 7 — Checkpoint H, adjustment 10).
-- Covers the transaction/RPC-level guarantees plain-Node tests can't reach:
-- server-authoritative math, cross-household rejection, idempotency,
-- atomicity, and the three Kitchen-matching rules. The math ALGORITHM itself
-- (largest-remainder allocation, equal-split remainder rules) is already
-- exhaustively covered by receipt-math.test.ts — this file spot-checks that
-- the SQL port produces the same answer on one representative fixture rather
-- than re-deriving every arithmetic edge case a second time.
--
-- Uses basejump-supabase_test_helpers (installed by 000-setup-tests-hooks.sql)
-- for user/session mocking, and household setup goes through the app's own
-- create_household / create_household_invite / join_household_with_code RPCs
-- rather than raw inserts — the same state a real signup flow would produce.
-- `test_ctx` is a scratch key-value table so ids created mid-file (household,
-- member, expense ids) can be referenced later without psql `\gset` fragility.
-- ============================================================================

begin;

select plan(23);

create temporary table test_ctx (key text primary key, value text);

-- ----------------------------------------------------------------------------
-- Fixture: Household A (owner + member2) and Household B (unrelated member),
-- for the cross-household rejection tests.
-- ----------------------------------------------------------------------------

select tests.create_supabase_user('receipt_owner', 'owner@confirm-receipt-test.dev');
select tests.create_supabase_user('receipt_member2', 'member2@confirm-receipt-test.dev');
select tests.create_supabase_user('other_household_user', 'other@confirm-receipt-test.dev');

select tests.authenticate_as('receipt_owner');
select public.create_household('CR Test Household A');
insert into test_ctx (key, value) select 'household_a_id', id::text from public.households where name = 'CR Test Household A';
insert into test_ctx (key, value)
  select 'owner_member_id', id::text from public.household_members
  where household_id = (select value::uuid from test_ctx where key = 'household_a_id')
    and user_id = tests.get_supabase_uid('receipt_owner');
insert into test_ctx (key, value)
  select 'invite_code', code from public.create_household_invite((select value::uuid from test_ctx where key = 'household_a_id'));

select tests.authenticate_as('receipt_member2');
select public.join_household_with_code((select value from test_ctx where key = 'invite_code'));
insert into test_ctx (key, value)
  select 'member2_id', id::text from public.household_members
  where household_id = (select value::uuid from test_ctx where key = 'household_a_id')
    and user_id = tests.get_supabase_uid('receipt_member2');

select tests.authenticate_as('other_household_user');
select public.create_household('CR Test Household B');
insert into test_ctx (key, value) select 'household_b_id', id::text from public.households where name = 'CR Test Household B';
insert into test_ctx (key, value)
  select 'other_member_id', id::text from public.household_members
  where household_id = (select value::uuid from test_ctx where key = 'household_b_id')
    and user_id = tests.get_supabase_uid('other_household_user');

-- ----------------------------------------------------------------------------
-- R1: happy path — two items, no tax/discount, exact reconciliation. Also
-- smuggles an unexpected `final_share_cents` field into item 1's JSON to
-- prove confirm_receipt never reads a client-supplied share (adjustment 1's
-- "malicious client shares cannot alter the final result" case): the field
-- is simply not in jsonb_to_recordset's column list, so it's silently
-- dropped, not merely overridden.
-- Milk $10.00 split owner+member2 -> 500/500. Bread $5.00 to owner only ->
-- 500. Owner total 1000, member2 total 500, sum 1500 = receipt total.
-- ----------------------------------------------------------------------------

select tests.authenticate_as_service_role();
insert into public.receipt_imports (id, household_id, uploaded_by_household_member_id, merchant_name, purchase_date, subtotal_cents, tax_cents, discount_cents, total_cents, raw_model_response)
values (
  '00000000-0000-0000-0000-000000000001',
  (select value::uuid from test_ctx where key = 'household_a_id'),
  (select value::uuid from test_ctx where key = 'owner_member_id'),
  'Test Grocery Co', '2026-08-01', 1500, 0, 0, 1500, '{}'::jsonb
);

select tests.authenticate_as('receipt_owner');
insert into test_ctx (key, value)
select 'r1_result', public.confirm_receipt(
  '00000000-0000-0000-0000-000000000001'::uuid,
  (select value::uuid from test_ctx where key = 'owner_member_id'),
  jsonb_build_array(
    jsonb_build_object(
      'item_id', 'item-0', 'cleaned_name', 'Milk', 'total_price_cents', 1000,
      'assigned_member_ids', jsonb_build_array(
        (select value from test_ctx where key = 'owner_member_id'),
        (select value from test_ctx where key = 'member2_id')
      ),
      'add_to_kitchen', false, 'category', 'dairy',
      'final_share_cents', 999999999
    ),
    jsonb_build_object(
      'item_id', 'item-1', 'cleaned_name', 'Bread', 'total_price_cents', 500,
      'assigned_member_ids', jsonb_build_array((select value from test_ctx where key = 'owner_member_id')),
      'add_to_kitchen', false, 'category', 'grains'
    )
  )
)::text;

select is(
  (select (value::jsonb ->> 'total_cents')::int from test_ctx where key = 'r1_result'),
  1500,
  'confirm_receipt returns the receipt total'
);

select is(
  (select count(*) from public.expenses where id = ((select value::jsonb ->> 'expense_id' from test_ctx where key = 'r1_result'))::uuid),
  1::bigint,
  'exactly one expense row was created'
);

select is(
  (select amount_cents from public.expense_shares
   where expense_id = ((select value::jsonb ->> 'expense_id' from test_ctx where key = 'r1_result'))::uuid
     and household_member_id = (select value::uuid from test_ctx where key = 'owner_member_id')),
  1000,
  'owner share matches the hand-computed equal split (500 milk + 500 bread), ignoring the injected final_share_cents field'
);

select is(
  (select amount_cents from public.expense_shares
   where expense_id = ((select value::jsonb ->> 'expense_id' from test_ctx where key = 'r1_result'))::uuid
     and household_member_id = (select value::uuid from test_ctx where key = 'member2_id')),
  500,
  'member2 share matches the hand-computed equal split (500 milk only)'
);

select is(
  (select linked_expense_id from public.receipt_imports where id = '00000000-0000-0000-0000-000000000001'),
  ((select value::jsonb ->> 'expense_id' from test_ctx where key = 'r1_result'))::uuid,
  'receipt_imports.linked_expense_id points at the created expense'
);

select is(
  (select status from public.receipt_imports where id = '00000000-0000-0000-0000-000000000001'),
  'confirmed',
  'receipt status flips to confirmed'
);

select is(
  (select confirmed_by_household_member_id from public.receipt_imports where id = '00000000-0000-0000-0000-000000000001'),
  (select value::uuid from test_ctx where key = 'owner_member_id'),
  'confirmed_by records who confirmed it'
);

-- Duplicate confirm: completely different (nonsense) items must be ignored
-- entirely -- the idempotent branch returns before p_items is even read.
insert into test_ctx (key, value)
select 'r1_result_2', public.confirm_receipt(
  '00000000-0000-0000-0000-000000000001'::uuid,
  (select value::uuid from test_ctx where key = 'member2_id'),
  jsonb_build_array(jsonb_build_object('item_id', 'x', 'cleaned_name', 'Nonsense', 'total_price_cents', 999999, 'assigned_member_ids', '[]'::jsonb, 'add_to_kitchen', true))
)::text;

select is(
  (select (value::jsonb ->> 'already_confirmed')::boolean from test_ctx where key = 'r1_result_2'),
  true,
  'a second confirm on an already-confirmed receipt reports already_confirmed'
);

select is(
  (select count(*) from public.expenses where household_id = (select value::uuid from test_ctx where key = 'household_a_id')),
  1::bigint,
  'duplicate confirm did not create a second expense'
);

-- ----------------------------------------------------------------------------
-- R2: an unassigned item blocks confirmation, regardless of price.
-- ----------------------------------------------------------------------------

select tests.authenticate_as_service_role();
insert into public.receipt_imports (id, household_id, uploaded_by_household_member_id, total_cents, raw_model_response)
values ('00000000-0000-0000-0000-000000000002', (select value::uuid from test_ctx where key = 'household_a_id'), (select value::uuid from test_ctx where key = 'owner_member_id'), 500, '{}'::jsonb);

select tests.authenticate_as('receipt_owner');
select throws_ok(
  $$ select public.confirm_receipt(
    '00000000-0000-0000-0000-000000000002'::uuid,
    (select id from public.household_members where household_id = (select id from public.households where name = 'CR Test Household A') and user_id = tests.get_supabase_uid('receipt_owner')),
    jsonb_build_array(jsonb_build_object('item_id', 'x', 'cleaned_name', 'Mystery Item', 'total_price_cents', 500, 'assigned_member_ids', '[]'::jsonb, 'add_to_kitchen', false))
  ) $$,
  'P0004',
  'Every item must have at least one person assigned before confirming.',
  'an item with no assignees blocks confirmation'
);

-- ----------------------------------------------------------------------------
-- R3: cross-household ids are rejected for both the payer and an assignee.
-- ----------------------------------------------------------------------------

select tests.authenticate_as_service_role();
insert into public.receipt_imports (id, household_id, uploaded_by_household_member_id, total_cents, raw_model_response)
values ('00000000-0000-0000-0000-000000000003', (select value::uuid from test_ctx where key = 'household_a_id'), (select value::uuid from test_ctx where key = 'owner_member_id'), 500, '{}'::jsonb);

select tests.authenticate_as('receipt_owner');
select throws_ok(
  $$ select public.confirm_receipt(
    '00000000-0000-0000-0000-000000000003'::uuid,
    (select id from public.household_members where household_id = (select id from public.households where name = 'CR Test Household B') and user_id = tests.get_supabase_uid('other_household_user')),
    jsonb_build_array(jsonb_build_object('item_id', 'x', 'cleaned_name', 'Mystery Item', 'total_price_cents', 500, 'assigned_member_ids', jsonb_build_array((select id::text from public.household_members where household_id = (select id from public.households where name = 'CR Test Household A') and user_id = tests.get_supabase_uid('receipt_owner'))), 'add_to_kitchen', false))
  ) $$,
  '42501',
  'Payer must be a member of this household.',
  'a payer from a different household is rejected'
);

select throws_ok(
  $$ select public.confirm_receipt(
    '00000000-0000-0000-0000-000000000003'::uuid,
    (select id from public.household_members where household_id = (select id from public.households where name = 'CR Test Household A') and user_id = tests.get_supabase_uid('receipt_owner')),
    jsonb_build_array(jsonb_build_object('item_id', 'x', 'cleaned_name', 'Mystery Item', 'total_price_cents', 500, 'assigned_member_ids', jsonb_build_array((select id::text from public.household_members where household_id = (select id from public.households where name = 'CR Test Household B') and user_id = tests.get_supabase_uid('other_household_user'))), 'add_to_kitchen', false))
  ) $$,
  '42501',
  'One or more assigned members do not belong to this household.',
  'an assignee from a different household is rejected'
);

-- ----------------------------------------------------------------------------
-- R4: atomicity. Temporarily corrupts the Kitchen category normalizer so
-- phase 6 (Kitchen import, which runs AFTER phase 5's expense+shares insert)
-- fails with a real check_violation -- proving the whole function body is one
-- atomic unit, not just "reject before writing anything." The corrupted
-- definition only lives inside this test transaction; the outer `rollback;`
-- at the end of this file undoes the DDL along with everything else.
-- ----------------------------------------------------------------------------

select tests.authenticate_as_service_role();
insert into public.receipt_imports (id, household_id, uploaded_by_household_member_id, total_cents, raw_model_response)
values ('00000000-0000-0000-0000-000000000004', (select value::uuid from test_ctx where key = 'household_a_id'), (select value::uuid from test_ctx where key = 'owner_member_id'), 500, '{}'::jsonb);

create or replace function private.normalize_kitchen_category(p_category text)
returns text language sql immutable security definer set search_path = '' as $inner$
  select 'not-a-real-category';
$inner$;

select tests.authenticate_as('receipt_owner');
select throws_ok(
  $$ select public.confirm_receipt(
    '00000000-0000-0000-0000-000000000004'::uuid,
    (select id from public.household_members where household_id = (select id from public.households where name = 'CR Test Household A') and user_id = tests.get_supabase_uid('receipt_owner')),
    jsonb_build_array(jsonb_build_object(
      'item_id', 'x', 'cleaned_name', 'Rollback Test Item', 'total_price_cents', 500,
      'assigned_member_ids', jsonb_build_array((select id::text from public.household_members where household_id = (select id from public.households where name = 'CR Test Household A') and user_id = tests.get_supabase_uid('receipt_owner'))),
      'add_to_kitchen', true, 'category', 'dairy'
    ))
  ) $$,
  '23514',
  'a Kitchen-phase failure aborts the whole confirmation, including the already-inserted expense'
);

select is(
  (select count(*) from public.expenses where household_id = (select value::uuid from test_ctx where key = 'household_a_id') and description = 'Receipt'),
  0::bigint,
  'no dangling expense was left behind by the aborted confirmation'
);

select is(
  (select status from public.receipt_imports where id = '00000000-0000-0000-0000-000000000004'),
  'ready_for_review',
  'the receipt itself is untouched -- still ready for a retry'
);

create or replace function private.normalize_kitchen_category(p_category text)
returns text language sql immutable security definer set search_path = '' as $inner$
  select case lower(coalesce(btrim(p_category), ''))
    when 'produce' then 'produce' when 'dairy' then 'dairy' when 'meat' then 'meat'
    when 'grains' then 'grains' when 'canned' then 'canned' when 'condiments' then 'condiments'
    when 'beverages' then 'beverages' when 'snacks' then 'snacks' when 'frozen' then 'frozen'
    else 'other'
  end;
$inner$;

-- ----------------------------------------------------------------------------
-- R5: an existing Out item with a matching barcode is restored, not
-- duplicated -- and this item's memory/assignees get written along the way.
-- ----------------------------------------------------------------------------

select tests.authenticate_as('receipt_owner');
insert into public.inventory_items (household_id, name, category, location, status, barcode)
values ((select value::uuid from test_ctx where key = 'household_a_id'), 'Frozen Peas', 'frozen', 'freezer', 'out', '00011');
insert into test_ctx (key, value)
  select 'r5_inventory_id', id::text from public.inventory_items
  where household_id = (select value::uuid from test_ctx where key = 'household_a_id') and barcode = '00011';

select tests.authenticate_as_service_role();
insert into public.receipt_imports (id, household_id, uploaded_by_household_member_id, total_cents, raw_model_response)
values ('00000000-0000-0000-0000-000000000005', (select value::uuid from test_ctx where key = 'household_a_id'), (select value::uuid from test_ctx where key = 'owner_member_id'), 300, '{}'::jsonb);

select tests.authenticate_as('receipt_owner');
select public.confirm_receipt(
  '00000000-0000-0000-0000-000000000005'::uuid,
  (select value::uuid from test_ctx where key = 'owner_member_id'),
  jsonb_build_array(jsonb_build_object(
    'item_id', 'x', 'cleaned_name', 'Frozen Peas', 'total_price_cents', 300,
    'assigned_member_ids', jsonb_build_array((select value from test_ctx where key = 'owner_member_id'), (select value from test_ctx where key = 'member2_id')),
    'add_to_kitchen', true, 'category', 'frozen', 'barcode', '00011'
  ))
);

select is(
  (select status from public.inventory_items where id = (select value::uuid from test_ctx where key = 'r5_inventory_id')),
  'in_stock',
  'an existing Out item with a matching barcode is restored to In Stock, not duplicated'
);

select is(
  (select count(*) from public.inventory_items where household_id = (select value::uuid from test_ctx where key = 'household_a_id') and barcode = '00011'),
  1::bigint,
  'restoring an Out item does not create a second row for the same barcode'
);

select is(
  (select count(*) from public.household_product_memory where household_id = (select value::uuid from test_ctx where key = 'household_a_id') and product_key = '00011'),
  1::bigint,
  'household_product_memory remembers this barcode-identified product'
);

select is(
  (select count(*) from public.household_product_memory_assignees a
   join public.household_product_memory m on m.id = a.memory_id
   where m.household_id = (select value::uuid from test_ctx where key = 'household_a_id') and m.product_key = '00011'),
  2::bigint,
  'both assignees for this item were remembered in product memory'
);

-- ----------------------------------------------------------------------------
-- R6: an existing active item with a matching barcode and a reliably
-- countable quantity is incremented, not overwritten with a guess.
-- ----------------------------------------------------------------------------

select tests.authenticate_as('receipt_owner');
insert into public.inventory_items (household_id, name, category, location, status, quantity, unit, barcode)
values ((select value::uuid from test_ctx where key = 'household_a_id'), 'Paper Towels', 'other', 'pantry', 'in_stock', 3, 'count', '00022');
insert into test_ctx (key, value)
  select 'r6_inventory_id', id::text from public.inventory_items
  where household_id = (select value::uuid from test_ctx where key = 'household_a_id') and barcode = '00022';

select tests.authenticate_as_service_role();
insert into public.receipt_imports (id, household_id, uploaded_by_household_member_id, total_cents, raw_model_response)
values ('00000000-0000-0000-0000-000000000006', (select value::uuid from test_ctx where key = 'household_a_id'), (select value::uuid from test_ctx where key = 'owner_member_id'), 400, '{}'::jsonb);

select tests.authenticate_as('receipt_owner');
select public.confirm_receipt(
  '00000000-0000-0000-0000-000000000006'::uuid,
  (select value::uuid from test_ctx where key = 'owner_member_id'),
  jsonb_build_array(jsonb_build_object(
    'item_id', 'x', 'cleaned_name', 'Paper Towels', 'total_price_cents', 400,
    'assigned_member_ids', jsonb_build_array((select value from test_ctx where key = 'owner_member_id')),
    'add_to_kitchen', true, 'category', 'other', 'barcode', '00022'
  ))
);

select is(
  (select quantity from public.inventory_items where id = (select value::uuid from test_ctx where key = 'r6_inventory_id')),
  4,
  'a reliably-countable existing item has its quantity incremented, not overwritten with a guess'
);

select is(
  (select count(*) from public.inventory_items where household_id = (select value::uuid from test_ctx where key = 'household_a_id') and barcode = '00022'),
  1::bigint,
  'a known barcode still matches exactly one existing row, never a duplicate'
);

-- ----------------------------------------------------------------------------
-- R7: a no-barcode item with a normalized-name match to an existing row
-- creates a NEW row -- never a silent name-based merge.
-- ----------------------------------------------------------------------------

select tests.authenticate_as('receipt_owner');
insert into public.inventory_items (household_id, name, category, location, status)
values ((select value::uuid from test_ctx where key = 'household_a_id'), 'Organic Bananas', 'produce', 'pantry', 'in_stock');

select tests.authenticate_as_service_role();
insert into public.receipt_imports (id, household_id, uploaded_by_household_member_id, total_cents, raw_model_response)
values ('00000000-0000-0000-0000-000000000007', (select value::uuid from test_ctx where key = 'household_a_id'), (select value::uuid from test_ctx where key = 'owner_member_id'), 200, '{}'::jsonb);

select tests.authenticate_as('receipt_owner');
select public.confirm_receipt(
  '00000000-0000-0000-0000-000000000007'::uuid,
  (select value::uuid from test_ctx where key = 'owner_member_id'),
  jsonb_build_array(jsonb_build_object(
    'item_id', 'x', 'cleaned_name', 'organic  bananas!!', 'total_price_cents', 200,
    'assigned_member_ids', jsonb_build_array((select value from test_ctx where key = 'owner_member_id')),
    'add_to_kitchen', true, 'category', 'produce'
  ))
);

select is(
  (select count(*) from public.inventory_items where household_id = (select value::uuid from test_ctx where key = 'household_a_id') and lower(name) like '%banana%'),
  2::bigint,
  'a no-barcode item with a similar normalized name creates a new row rather than merging into the existing one'
);

-- ----------------------------------------------------------------------------
-- R8: Add to Kitchen = false never creates an inventory row.
-- ----------------------------------------------------------------------------

select tests.authenticate_as_service_role();
insert into public.receipt_imports (id, household_id, uploaded_by_household_member_id, total_cents, raw_model_response)
values ('00000000-0000-0000-0000-000000000008', (select value::uuid from test_ctx where key = 'household_a_id'), (select value::uuid from test_ctx where key = 'owner_member_id'), 150, '{}'::jsonb);

select tests.authenticate_as('receipt_owner');
select public.confirm_receipt(
  '00000000-0000-0000-0000-000000000008'::uuid,
  (select value::uuid from test_ctx where key = 'owner_member_id'),
  jsonb_build_array(jsonb_build_object(
    'item_id', 'x', 'cleaned_name', 'Kombucha Six Pack Not Added', 'total_price_cents', 150,
    'assigned_member_ids', jsonb_build_array((select value from test_ctx where key = 'owner_member_id')),
    'add_to_kitchen', false, 'category', 'beverages'
  ))
);

select is(
  (select count(*) from public.inventory_items where household_id = (select value::uuid from test_ctx where key = 'household_a_id') and name = 'Kombucha Six Pack Not Added'),
  0::bigint,
  'Add to Kitchen = false never creates an inventory row, even though the item still confirms'
);

select * from finish();

rollback;
