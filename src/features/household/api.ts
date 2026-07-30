import { supabase } from '@/lib/supabase';

import type { Household, HouseholdInvite, HouseholdMember } from './types';

// -----------------------------------------------------------------------------
// Thin wrappers over supabase-js — no caching/state here, that's queries.ts's
// job. Every household-scoped read/write goes through RLS on the server;
// nothing here does its own authorization checks.
// -----------------------------------------------------------------------------

function mapHousehold(row: { id: string; name: string; created_by: string; created_at: string; updated_at: string }): Household {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInvite(row: {
  id: string;
  household_id: string;
  code: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  max_uses: number;
  use_count: number;
}): HouseholdInvite {
  return {
    id: row.id,
    householdId: row.household_id,
    code: row.code,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
  };
}

/** The current user's household, or `null` if they haven't created/joined one yet — this is the onboarding gate's source of truth. */
export async function fetchMyHousehold(userId: string): Promise<Household | null> {
  const { data, error } = await supabase
    .from('household_members')
    .select('households(*)')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.households) return null;
  return mapHousehold(data.households as never);
}

/** The full roster for a household, shaped as the app-wide HouseholdMember type every feature already reads. */
export async function fetchHouseholdMembers(
  householdId: string,
  currentUserId: string,
): Promise<HouseholdMember[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('id, user_id, joined_at, profiles(display_name)')
    .eq('household_id', householdId)
    .order('joined_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as { display_name: string } | null;
    return {
      id: row.id,
      userId: row.user_id,
      name: profile?.display_name ?? 'Household member',
      isCurrentUser: row.user_id === currentUserId,
    };
  });
}

/** Whether the current user is the `owner` of a household — gates invite creation/revocation in the UI (RLS enforces the same rule server-side regardless). */
export async function fetchIsHouseholdOwner(householdId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.role === 'owner';
}

export async function createHousehold(name: string): Promise<Household> {
  const { data, error } = await supabase.rpc('create_household', { p_name: name });
  if (error) throw error;
  return mapHousehold(data);
}

export async function joinHouseholdWithCode(code: string): Promise<Household> {
  const { data, error } = await supabase.rpc('join_household_with_code', { p_code: code });
  if (error) throw error;
  return mapHousehold(data);
}

/** The household's current active (non-revoked, non-expired, not-yet-exhausted) invite, if any — for the "share this code" UI. */
export async function fetchActiveInvite(householdId: string): Promise<HouseholdInvite | null> {
  const { data, error } = await supabase
    .from('household_invites')
    .select('*')
    .eq('household_id', householdId)
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapInvite(data) : null;
}

export async function createHouseholdInvite(householdId: string): Promise<HouseholdInvite> {
  const { data, error } = await supabase.rpc('create_household_invite', {
    p_household_id: householdId,
  });
  if (error) throw error;
  return mapInvite(data);
}

export async function revokeHouseholdInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('household_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) throw error;
}
