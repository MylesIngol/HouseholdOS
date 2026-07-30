import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import type { Database } from './database.types';

// -----------------------------------------------------------------------------
// The one Supabase client for the app. Only the publishable key (client-safe
// by design — Supabase's own naming for what used to be called the "anon
// key") ever lives here; there is no service-role/secret key anywhere in this
// codebase. Access control is entirely enforced by Postgres Row Level
// Security on the server, not by anything this file does.
// -----------------------------------------------------------------------------

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copy .env.example to .env and fill in your Supabase project values.',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase's session auto-refresh timer only makes sense while the app is
// actually in the foreground — without this, a backgrounded app keeps trying
// (and failing, wastefully) to refresh on a timer, and a foregrounded app
// that was backgrounded past its token's expiry won't proactively refresh
// until the next request. This is the current official guidance for
// non-browser environments (React Native, Electron).
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
