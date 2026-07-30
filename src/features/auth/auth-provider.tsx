import type { Session } from '@supabase/supabase-js';
import { createContext, type PropsWithChildren, use, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

// -----------------------------------------------------------------------------
// Root-level session state. A React Context (not Zustand) because this is a
// thin, one-shot subscription to Supabase's own onAuthStateChange listener,
// not app domain data that needs selectors/derivations — see Milestone 6
// plan section 9 for why Zustand's remaining role in this app is narrow.
// -----------------------------------------------------------------------------

type AuthContextValue = {
  session: Session | null;
  /** True only until the very first session check resolves — never true again after that, even during sign-in/out. */
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return <AuthContext value={{ session, isLoading }}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
