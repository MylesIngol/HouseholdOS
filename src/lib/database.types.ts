// -----------------------------------------------------------------------------
// Hand-authored to match supabase/migrations/*.sql exactly, in the same shape
// the Supabase CLI's `supabase gen types typescript` produces. Once a real
// project is linked, run `npm run db:types` to regenerate this file from the
// live schema — at that point this file becomes generated output and should
// not be hand-edited. Grows one section per checkpoint (D adds Kitchen, E
// adds Tasks, F adds Money).
// -----------------------------------------------------------------------------

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // created only by the auth.users trigger
        Update: {
          display_name?: string;
          updated_at?: string;
        };
      };
      households: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // created only via create_household()
        Update: {
          name?: string;
          updated_at?: string;
        };
      };
      household_members: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          role: 'owner' | 'member';
          joined_at: string;
        };
        Insert: never; // created only via create_household()/join_household_with_code()
        Update: never;
      };
      household_invites: {
        Row: {
          id: string;
          household_id: string;
          code: string;
          created_by: string;
          created_at: string;
          expires_at: string | null;
          revoked_at: string | null;
          max_uses: number;
          use_count: number;
        };
        Insert: never; // created only via create_household_invite()
        Update: {
          revoked_at?: string | null;
        };
      };
    };
    Functions: {
      create_household: {
        Args: { p_name: string };
        Returns: Database['public']['Tables']['households']['Row'];
      };
      join_household_with_code: {
        Args: { p_code: string };
        Returns: Database['public']['Tables']['households']['Row'];
      };
      create_household_invite: {
        Args: { p_household_id: string };
        Returns: Database['public']['Tables']['household_invites']['Row'];
      };
    };
  };
};
