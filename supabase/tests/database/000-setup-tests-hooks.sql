-- ============================================================================
-- pgTAP pre-test hook (Milestone 7 — Checkpoint H's test infrastructure).
-- Runs first (alphabetical order — `000-` prefix), installs pgTAP itself
-- plus the basejump-supabase_test_helpers package (dbdev-distributed) that
-- every later test file in this directory relies on for
-- tests.create_supabase_user / tests.authenticate_as / tests.get_supabase_uid
-- — mocking auth.uid() by hand for every test would be far more error-prone
-- than using the community-standard, Supabase-documented helper package.
--
-- Requires network access to database.dev the first time `supabase test db`
-- runs locally (to install dbdev + the helpers package) — a one-time cost,
-- not a per-run one. See https://supabase.com/docs/guides/local-development/testing/pgtap-extended.
-- ============================================================================

create extension if not exists pgtap with schema extensions;

create extension if not exists http with schema extensions;
create extension if not exists pg_tle;
drop extension if exists "supabase-dbdev";
select pgtle.uninstall_extension_if_exists('supabase-dbdev');
select
    pgtle.install_extension(
        'supabase-dbdev',
        resp.contents ->> 'version',
        'PostgreSQL package manager',
        resp.contents ->> 'sql'
    )
from extensions.http(
    (
        'GET',
        'https://api.database.dev/rest/v1/'
        || 'package_versions?select=sql,version'
        || '&package_name=eq.supabase-dbdev'
        || '&order=version.desc'
        || '&limit=1',
        array[
            ('apiKey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtdXB0cHBsZnZpaWZyYndtbXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODAxMDczNzIsImV4cCI6MTk5NTY4MzM3Mn0.z2CN0mvO2No8wSi46Gw59DFGCTJrzM0AQKsu_5k134s')::extensions.http_header
        ],
        null,
        null
    )
) x,
lateral (
    select
        ((row_to_json(x) -> 'content') #>> '{}')::json -> 0
) resp(contents);
create extension "supabase-dbdev";
select dbdev.install('supabase-dbdev');
drop extension if exists "supabase-dbdev";
create extension "supabase-dbdev";

select dbdev.install('basejump-supabase_test_helpers');
create extension if not exists "basejump-supabase_test_helpers" version '0.0.6';

begin;
select plan(1);
select ok(true, 'pgTAP + test helpers installed successfully');
select * from finish();
rollback;
