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
          barcode: string | null;
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
          barcode?: string | null;
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
          barcode?: string | null;
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
      products: {
        Row: {
          barcode: string;
          name: string;
          brand: string | null;
          category: string | null;
          image_url: string | null;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          barcode: string;
          name: string;
          brand?: string | null;
          category?: string | null;
          image_url?: string | null;
          source: string;
        };
        Update: {
          name?: string;
          brand?: string | null;
          category?: string | null;
          image_url?: string | null;
          source?: string;
        };
        Relationships: [];
      };
      household_product_memory: {
        Row: {
          id: string;
          household_id: string;
          product_key: string;
          barcode: string | null;
          preferred_name: string;
          category: string | null;
          storage_location: string | null;
          default_ownership: string;
          default_owner_household_member_id: string | null;
          default_add_to_kitchen: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          household_id: string;
          product_key: string;
          barcode?: string | null;
          preferred_name: string;
          category?: string | null;
          storage_location?: string | null;
          default_ownership?: string;
          default_owner_household_member_id?: string | null;
          default_add_to_kitchen?: boolean;
        };
        Update: {
          product_key?: string;
          barcode?: string | null;
          preferred_name?: string;
          category?: string | null;
          storage_location?: string | null;
          default_ownership?: string;
          default_owner_household_member_id?: string | null;
          default_add_to_kitchen?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'household_product_memory_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'household_product_memory_default_owner_household_member_i_fkey';
            columns: ['default_owner_household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
        ];
      };
      household_product_memory_assignees: {
        Row: {
          id: string;
          memory_id: string;
          household_id: string;
          household_member_id: string;
        };
        Insert: {
          memory_id: string;
          household_id: string;
          household_member_id: string;
        };
        Update: {
          household_member_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'household_product_memory_assignees_memory_id_household_i_fkey';
            columns: ['memory_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_product_memory';
            referencedColumns: ['id', 'household_id'];
          },
          {
            foreignKeyName: 'household_product_memory_assignees_household_member_id_ho_fkey';
            columns: ['household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
        ];
      };
      chore_templates: {
        Row: {
          id: string;
          household_id: string;
          title: string;
          description: string | null;
          assignment_type: string;
          assignee_household_member_id: string | null;
          recurrence: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // created only via create_chore_template()
        Update: never; // edited only via update_chore_template()/stop_chore_template()
        Relationships: [
          {
            foreignKeyName: 'chore_templates_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chore_templates_assignee_household_member_id_household_id_fkey';
            columns: ['assignee_household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
        ];
      };
      chore_rotation_members: {
        Row: {
          id: string;
          template_id: string;
          household_id: string;
          household_member_id: string;
          position: number;
        };
        Insert: never; // created only via create_chore_template()/update_chore_template()
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'chore_rotation_members_template_id_household_id_fkey';
            columns: ['template_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'chore_templates';
            referencedColumns: ['id', 'household_id'];
          },
          {
            foreignKeyName: 'chore_rotation_members_household_member_id_household_id_fkey';
            columns: ['household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
        ];
      };
      chore_occurrences: {
        Row: {
          id: string;
          template_id: string;
          household_id: string;
          title: string;
          description: string | null;
          assigned_household_member_id: string;
          due_date: string | null;
          status: string;
          completed_at: string | null;
          completed_by_household_member_id: string | null;
          created_at: string;
        };
        // created only via create_chore_template()/complete_chore_occurrence();
        // edited only via update_chore_template()/complete_chore_occurrence()/
        // undo_chore_completion()/stop_chore_template().
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'chore_occurrences_template_id_household_id_fkey';
            columns: ['template_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'chore_templates';
            referencedColumns: ['id', 'household_id'];
          },
          {
            foreignKeyName: 'chore_occurrences_assigned_household_member_id_household_id_fkey';
            columns: ['assigned_household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          household_id: string;
          description: string;
          amount_cents: number;
          category: string;
          paid_by_household_member_id: string;
          date: string;
          split_mode: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // created only via create_expense()/mark_bill_paid()
        Update: never; // edited only via update_expense()
        Relationships: [
          {
            foreignKeyName: 'expenses_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_paid_by_household_member_id_household_id_fkey';
            columns: ['paid_by_household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
        ];
      };
      expense_shares: {
        Row: {
          id: string;
          expense_id: string;
          household_id: string;
          household_member_id: string;
          amount_cents: number;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'expense_shares_expense_id_household_id_fkey';
            columns: ['expense_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id', 'household_id'];
          },
          {
            foreignKeyName: 'expense_shares_household_member_id_household_id_fkey';
            columns: ['household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
        ];
      };
      settlements: {
        Row: {
          id: string;
          household_id: string;
          from_household_member_id: string;
          to_household_member_id: string;
          amount_cents: number;
          date: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          household_id: string;
          from_household_member_id: string;
          to_household_member_id: string;
          amount_cents: number;
          date: string;
          note?: string | null;
        };
        Update: never; // no editing -- delete and re-record
        Relationships: [
          {
            foreignKeyName: 'settlements_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_from_household_member_id_household_id_fkey';
            columns: ['from_household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
          {
            foreignKeyName: 'settlements_to_household_member_id_household_id_fkey';
            columns: ['to_household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
        ];
      };
      recurring_bill_templates: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          amount_cents: number;
          day_of_month: number;
          responsible_household_member_id: string | null;
          split_mode: string;
          notes: string | null;
          created_at: string;
        };
        Insert: never; // created only via create_bill()
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'recurring_bill_templates_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recurring_bill_templates_responsible_household_member_id_household_id_fkey';
            columns: ['responsible_household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
        ];
      };
      recurring_bill_participants: {
        Row: {
          id: string;
          template_id: string;
          household_id: string;
          household_member_id: string;
          share_amount_cents: number | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'recurring_bill_participants_template_id_household_id_fkey';
            columns: ['template_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'recurring_bill_templates';
            referencedColumns: ['id', 'household_id'];
          },
          {
            foreignKeyName: 'recurring_bill_participants_household_member_id_household_id_fkey';
            columns: ['household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
        ];
      };
      bills: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          amount_cents: number;
          due_date: string;
          responsible_household_member_id: string | null;
          split_mode: string;
          recurrence: string;
          recurring_bill_id: string | null;
          status: string;
          paid_at: string | null;
          linked_expense_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // created only via create_bill()/generate_next_bill_occurrence()
        Update: never; // edited only via update_bill()/mark_bill_paid()/delete_expense()
        Relationships: [
          {
            foreignKeyName: 'bills_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bills_responsible_household_member_id_household_id_fkey';
            columns: ['responsible_household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
          {
            foreignKeyName: 'bills_recurring_bill_id_household_id_fkey';
            columns: ['recurring_bill_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'recurring_bill_templates';
            referencedColumns: ['id', 'household_id'];
          },
          {
            foreignKeyName: 'bills_linked_expense_id_household_id_fkey';
            columns: ['linked_expense_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id', 'household_id'];
          },
        ];
      };
      bill_shares: {
        Row: {
          id: string;
          bill_id: string;
          household_id: string;
          household_member_id: string;
          amount_cents: number;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'bill_shares_bill_id_household_id_fkey';
            columns: ['bill_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'bills';
            referencedColumns: ['id', 'household_id'];
          },
          {
            foreignKeyName: 'bill_shares_household_member_id_household_id_fkey';
            columns: ['household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
        ];
      };
      receipt_imports: {
        Row: {
          id: string;
          household_id: string;
          uploaded_by_household_member_id: string;
          status: string;
          merchant_name: string | null;
          purchase_date: string | null;
          subtotal_cents: number | null;
          tax_cents: number | null;
          discount_cents: number | null;
          total_cents: number;
          raw_model_response: Json;
          linked_expense_id: string | null;
          confirmed_at: string | null;
          confirmed_by_household_member_id: string | null;
          created_at: string;
        };
        // No client-facing INSERT/UPDATE policy at all — written exclusively
        // by process-receipt (create) and confirm_receipt (checkpoint H,
        // confirm) via service-role clients, each after its own independent
        // membership check (plan section 7).
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'receipt_imports_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'receipt_imports_uploaded_by_household_member_id_household__fkey';
            columns: ['uploaded_by_household_member_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'household_members';
            referencedColumns: ['id', 'household_id'];
          },
          {
            foreignKeyName: 'receipt_imports_linked_expense_id_household_id_fkey';
            columns: ['linked_expense_id', 'household_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
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
      create_chore_template: {
        Args: {
          p_household_id: string;
          p_title: string;
          p_description: string | null;
          p_assignment_type: string;
          p_assignee_member_id: string | null;
          p_rotation_member_ids: string[] | null;
          p_recurrence: string;
          p_due_date: string | null;
        };
        Returns: Database['public']['Tables']['chore_templates']['Row'];
      };
      update_chore_template: {
        Args: {
          p_template_id: string;
          p_title: string | null;
          p_description: string | null;
          p_assignment_type: string | null;
          p_assignee_member_id: string | null;
          p_rotation_member_ids: string[] | null;
          p_explicit_current_assignee_id: string | null;
        };
        Returns: Database['public']['Tables']['chore_templates']['Row'];
      };
      stop_chore_template: {
        Args: { p_template_id: string };
        Returns: undefined;
      };
      delete_one_time_chore: {
        Args: { p_template_id: string };
        Returns: undefined;
      };
      complete_chore_occurrence: {
        Args: { p_occurrence_id: string };
        Returns: string | null;
      };
      undo_chore_completion: {
        Args: { p_occurrence_id: string; p_generated_occurrence_id: string | null };
        Returns: undefined;
      };
      create_expense: {
        Args: {
          p_household_id: string;
          p_description: string;
          p_amount_cents: number;
          p_category: string;
          p_paid_by_member_id: string;
          p_date: string;
          p_split_mode: string;
          p_shares: Json;
          p_notes: string | null;
        };
        Returns: Database['public']['Tables']['expenses']['Row'];
      };
      update_expense: {
        Args: {
          p_expense_id: string;
          p_description: string;
          p_amount_cents: number;
          p_category: string;
          p_paid_by_member_id: string;
          p_date: string;
          p_split_mode: string;
          p_shares: Json;
          p_notes: string | null;
        };
        Returns: Database['public']['Tables']['expenses']['Row'];
      };
      delete_expense: {
        Args: { p_expense_id: string };
        Returns: undefined;
      };
      confirm_receipt: {
        Args: {
          p_receipt_import_id: string;
          p_payer_household_member_id: string;
          p_items: Json;
        };
        Returns: Json;
      };
      create_bill: {
        Args: {
          p_household_id: string;
          p_name: string;
          p_amount_cents: number;
          p_due_date: string;
          p_responsible_member_id: string | null;
          p_split_mode: string;
          p_shares: Json;
          p_recurrence: string;
          p_notes: string | null;
        };
        Returns: Database['public']['Tables']['bills']['Row'];
      };
      update_bill: {
        Args: {
          p_bill_id: string;
          p_name: string;
          p_amount_cents: number;
          p_due_date: string;
          p_responsible_member_id: string | null;
          p_split_mode: string;
          p_shares: Json;
          p_notes: string | null;
        };
        Returns: Database['public']['Tables']['bills']['Row'];
      };
      delete_bill: {
        Args: { p_bill_id: string };
        Returns: undefined;
      };
      mark_bill_paid: {
        Args: { p_bill_id: string; p_paid_by_member_id: string; p_payment_date: string | null };
        Returns: Database['public']['Tables']['expenses']['Row'] | null;
      };
      generate_next_bill_occurrence: {
        Args: { p_recurring_bill_id: string };
        Returns: Database['public']['Tables']['bills']['Row'];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
