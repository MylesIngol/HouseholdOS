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
// -----------------------------------------------------------------------------

// Connectivity: expo-network's listener drives onlineManager, which gates
// retries and `refetchOnReconnect` — coming back online after a dead
// connection triggers exactly the same refetch a manual pull-to-refresh
// would.
onlineManager.setEventListener((setOnline) => {
  const subscription = Network.addNetworkStateListener((state) => {
    setOnline(!!state.isConnected);
  });
  return () => subscription.remove();
});

// App foreground/background: focusManager drives `refetchOnWindowFocus`
// (the RN equivalent is "app came back to the foreground"). Every screen's
// queries are already `staleTime: 60s`, so this is what actually catches a
// roommate's change made while this device's app was backgrounded, without
// needing realtime for every possible scenario.
function handleAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === 'active');
}

let appStateSubscription: { remove: () => void } | undefined;

/** Called once from the root layout. */
export function startFocusManagerSync() {
  appStateSubscription?.remove();
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
}
