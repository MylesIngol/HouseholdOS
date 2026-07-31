import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { useMyHousehold } from '@/features/household/queries';
import { householdKeys } from '@/features/household/query-keys';
import { kitchenKeys } from '@/features/kitchen/query-keys';
import { moneyKeys } from '@/features/money/query-keys';
import { tasksKeys } from '@/features/tasks/query-keys';
import { supabase } from '@/lib/supabase';

// -----------------------------------------------------------------------------
// One Postgres Changes realtime channel per household (plan section 13 —
// approved for this small roommate-beta scale), covering every table any
// screen reads. On any insert/update/delete we don't try to merge the
// change payload into the cache ourselves — no second manual cache-merging
// system — we just invalidate the relevant TanStack Query key(s) and let
// the existing query functions refetch, the exact same codepath a manual
// pull-to-refresh already uses. That refetch is what actually updates the
// screen; this hook's only job is deciding *when* to trigger one.
//
// This complements (doesn't replace) the AppState/expo-network wiring in
// query-client.ts: realtime catches a roommate's change while this device
// is in the foreground and connected; the focus/online managers catch
// everything else (this device was backgrounded, or its connection dropped
// and came back — Supabase Realtime reconnects its own socket
// automatically, but re-subscribing this hook's channel on a fresh
// `household` value, or simply letting the next foreground focus-triggered
// refetch catch up, means a missed event while fully disconnected is never
// silently lost for long).
// -----------------------------------------------------------------------------

const HOUSEHOLD_ID_TABLES = [
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
  'bill_shares',
] as const;

/** Mounted once in (app)'s root layout — by the time that layout can render, RootNavigator has already guaranteed a household exists. */
export function useHouseholdRealtimeSync() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { data: household } = useMyHousehold();
  const householdId = household?.id;
  const userId = session?.user.id;

  useEffect(() => {
    if (!householdId || !userId) return;

    function invalidate(queryKey: readonly unknown[]) {
      queryClient.invalidateQueries({ queryKey });
    }

    const channel = supabase.channel(`household-sync-${householdId}`);

    // households itself has no household_id column — its own `id` IS the
    // household id, so it needs a different filter column than every other
    // table here.
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'households', filter: `id=eq.${householdId}` },
      () => invalidate(householdKeys.mine(userId)),
    );

    for (const table of HOUSEHOLD_ID_TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
        () => {
          switch (table) {
            case 'household_members':
              invalidate(householdKeys.members(householdId));
              invalidate(householdKeys.mine(userId));
              invalidate(householdKeys.isOwner(householdId, userId));
              break;
            case 'household_invites':
              invalidate(householdKeys.invite(householdId));
              break;
            case 'inventory_items':
              invalidate(kitchenKeys.items(householdId));
              break;
            case 'grocery_list_entries':
              invalidate(kitchenKeys.groceryItems(householdId));
              break;
            case 'chore_templates':
            case 'chore_rotation_members':
              invalidate(tasksKeys.templates(householdId));
              break;
            case 'chore_occurrences':
              invalidate(tasksKeys.occurrences(householdId));
              break;
            case 'expenses':
            case 'expense_shares':
              invalidate(moneyKeys.expenses(householdId));
              break;
            case 'settlements':
              invalidate(moneyKeys.settlements(householdId));
              break;
            case 'bills':
            case 'bill_shares':
              invalidate(moneyKeys.bills(householdId));
              break;
          }
        },
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, userId, queryClient]);
}
