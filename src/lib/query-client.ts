import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, type AppStateStatus } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 2,
    },
  },
});

// -----------------------------------------------------------------------------
// React Native has no browser `window` to derive "focus"/"online" from, so
// TanStack Query's usual web-only defaults (window focus/online events) are
// silent no-ops on RN unless wired up manually — this is that wiring (plan
// section 12).
//
// KNOWN GAP, found debugging a real offline/reconnect sync bug: TanStack's
// onlineManager only notifies its listeners (which is what drives
// refetchOnReconnect) on a *transition* — internally it starts "online",
// and setOnline(x) is a no-op unless x differs from the last known value.
// expo-network's addNetworkStateListener has a confirmed bug
// (https://github.com/expo/expo/issues/37972) where the "went offline"
// event is unreliable — on Android it can fire but still report
// `isConnected: true`; iOS is inconsistent. If that first offline
// transition is ever missed/misreported, onlineManager's internal state
// never actually flips to false, so the *real* reconnect event later looks
// like a no-op (true -> true) and nothing refetches. This is why a device
// that went through airplane mode could come back online and never catch
// up on another roommate's changes.
//
// Fix: don't try to correctly detect the offline->online transition at
// all (the same bug report confirms the reconnect event itself fires
// reliably even when the disconnect event doesn't) — instead,
// invalidateSyncedDomains() below acts directly on any event that
// confirms connectivity, independent of whatever onlineManager's internal
// state believes. onlineManager's own wiring is left in place unchanged
// (it still correctly drives paused-mutation resume); this is an
// addition, not a replacement.
// -----------------------------------------------------------------------------

const syncLog = (...args: unknown[]) => {
  if (__DEV__) console.log('[reconnect-sync]', ...args);
};

// Domain query-key prefixes to catch up on reconnect/foreground. Left as
// bare prefixes (not full keys) so this module doesn't need to know the
// current household id — invalidateQueries does prefix matching by
// default, so `['kitchen']` matches every kitchenKeys.* query regardless of
// which household id it was fetched under. Home has no query keys of its
// own — it composes these same feature hooks — so refetching these four
// covers it too.
const SYNCED_DOMAIN_PREFIXES = ['household', 'kitchen', 'tasks', 'money'] as const;

let lastExplicitRefetchAt = 0;
const EXPLICIT_REFETCH_COOLDOWN_MS = 2000;

function invalidateSyncedDomains(reason: string) {
  const now = Date.now();
  if (now - lastExplicitRefetchAt < EXPLICIT_REFETCH_COOLDOWN_MS) {
    syncLog('skipped invalidate (cooldown):', reason);
    return;
  }
  lastExplicitRefetchAt = now;
  syncLog('invalidating synced domains:', reason);
  for (const prefix of SYNCED_DOMAIN_PREFIXES) {
    queryClient.invalidateQueries({ queryKey: [prefix] });
  }
}

// Connectivity: one network-state subscription drives both (a) onlineManager,
// which gates retries/paused-mutation-resume as before, and (b) the explicit
// reconnect invalidate described above, triggered directly off any event
// reporting real connectivity — not off a believed transition.
onlineManager.setEventListener((setOnline) => {
  const subscription = Network.addNetworkStateListener((state) => {
    syncLog('network state changed:', state);
    setOnline(!!state.isConnected);
    if (state.isConnected) {
      invalidateSyncedDomains('network reconnect');
    }
  });
  return () => subscription.remove();
});

// App foreground/background: focusManager drives `refetchOnWindowFocus` as
// before (AppState transitions are reliable on RN, unlike the network
// listener above, so its own internal gating isn't the problem here) — but
// toggling airplane mode from iOS Control Center often doesn't background
// the app at all, so this can't be relied on as the only reconnect path.
// The explicit invalidate call is a deliberately redundant safety net for
// the cases where the app *was* actually backgrounded.
function handleAppStateChange(status: AppStateStatus) {
  syncLog('app state changed:', status);
  focusManager.setFocused(status === 'active');
  if (status === 'active') {
    invalidateSyncedDomains('app foregrounded');
  }
}

let appStateSubscription: { remove: () => void } | undefined;

/** Called once from the root layout. */
export function startFocusManagerSync() {
  appStateSubscription?.remove();
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
}
