// -----------------------------------------------------------------------------
// Hand-authored to match supabase/migrations/*.sql exactly, in the same shape
// the Supabase CLI's `supabase gen types typescript` produces (including the
// Relationships arrays postgrest-js needs to type embedded/joined selects
// like `.select('households(*)')`). Once a real project is linked, run
// `npm run db:types` to regenerate this file from the live schema — at that
// point this file becomes generated output and should not be hand-edited.
// Grows one section per checkpoint (D adds Kitchen, E adds Tasks, F adds
// Money).
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
        Relationships: [];
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
        Relationships: [
          {
            foreignKeyName: 'households_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'household_members_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'household_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'household_invites_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_items: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          category: string;
          location: string;
          status: string;
          quantity: number | null;
          unit: string | null;
          expiration_date: string | null;
          expiration_confidence: string | null;
          ownership: string;
          owner_household_member_id: string | null;
          notes: string | null;
          added_at: string;
          updated_at: string;
        };
        Insert: {
          household_id: string;
          name: string;
          category?: string;
          location: string;
          status?: string;
          quantity?: number | null;
          unit?: string | null;
          expiration_date?: string | null;
          expiration_confidence?: string | null;
          ownership?: string;
          owner_household_member_id?: string | null;
          notes?: string | null;
        };
        Update: {
          name?: string;
          category?: string;
          location?: string;
          status?: string;
          quantity?: number | null;
          unit?: string | null;
          expiration_date?: string | null;
          expiration_confidence?: string | null;
          ownership?: string;
          owner_household_member_id?: string | null;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_items_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_items_owner_household_member_id_household_id_fkey';
            columns: ['owner_household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
        ];
      };
      grocery_list_entries: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          added_at: string;
          inventory_item_id: string | null;
        };
        Insert: {
          household_id: string;
          name: string;
          inventory_item_id?: string | null;
        };
        Update: {
          name?: string;
          inventory_item_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'grocery_list_entries_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'grocery_list_entries_inventory_item_id_household_id_fkey';
            columns: ['inventory_item_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_items';
            referencedColumns: ['id', 'household_id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
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
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
