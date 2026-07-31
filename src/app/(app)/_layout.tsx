import AppTabs from '@/components/app-tabs';
import { useHouseholdRealtimeSync } from '@/hooks/use-household-realtime-sync';

export default function AppLayout() {
  // Safe to mount unconditionally here: (app) only ever renders once
  // RootNavigator's Stack.Protected guard has confirmed session + household
  // both exist.
  useHouseholdRealtimeSync();
  return <AppTabs />;
}
