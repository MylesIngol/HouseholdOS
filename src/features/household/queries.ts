import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';

import {
  createHousehold,
  createHouseholdInvite,
  fetchActiveInvite,
  fetchHouseholdMembers,
  fetchIsHouseholdOwner,
  fetchMyHousehold,
  joinHouseholdWithCode,
  revokeHouseholdInvite,
} from './api';
import { householdKeys } from './query-keys';

/** `data` is `undefined` while loading, `null` once resolved with no household — the onboarding gate's exact condition. */
export function useMyHousehold() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: householdKeys.mine(userId),
    queryFn: () => fetchMyHousehold(userId!),
    enabled: !!userId,
  });
}

export function useHouseholdMembers(householdId: string | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: householdKeys.members(householdId),
    queryFn: () => fetchHouseholdMembers(householdId!, userId!),
    enabled: !!householdId && !!userId,
  });
}

export function useCreateHousehold() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (name: string) => createHousehold(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: householdKeys.mine(session?.user.id) });
    },
  });
}

export function useJoinHousehold() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (code: string) => joinHouseholdWithCode(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: householdKeys.mine(session?.user.id) });
    },
  });
}

export function useIsHouseholdOwner(householdId: string | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: householdKeys.isOwner(householdId, userId),
    queryFn: () => fetchIsHouseholdOwner(householdId!, userId!),
    enabled: !!householdId && !!userId,
  });
}

export function useHouseholdInvite(householdId: string | undefined) {
  return useQuery({
    queryKey: householdKeys.invite(householdId),
    queryFn: () => fetchActiveInvite(householdId!),
    enabled: !!householdId,
  });
}

export function useCreateHouseholdInvite(householdId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => createHouseholdInvite(householdId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: householdKeys.invite(householdId) });
    },
  });
}

export function useRevokeHouseholdInvite(householdId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => revokeHouseholdInvite(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: householdKeys.invite(householdId) });
    },
  });
}
