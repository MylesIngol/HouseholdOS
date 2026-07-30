import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { useMyHousehold } from '@/features/household/queries';
import { queryClient } from '@/lib/query-client';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AnimatedSplashOverlay />
          <RootNavigator />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * Gates the three top-level route groups on session + household state via
 * Stack.Protected rather than manual router.replace() redirects —
 * declarative, and it's what avoids a flash of the wrong screen while state
 * is still resolving (the splash screen stays up until BOTH the session
 * check and, once signed in, the first household lookup have resolved).
 */
function RootNavigator() {
  const { session, isLoading: authLoading } = useAuth();
  const { data: household, isLoading: householdLoading } = useMyHousehold();

  // Only wait on the household query once there's a session to look one up
  // for — an unauthenticated user should never be blocked on it.
  const ready = !authLoading && (!session || !householdLoading);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !household}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !!household}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
