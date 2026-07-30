import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useMyHousehold } from '@/features/household/queries';

import {
  createGroceryEntry,
  createInventoryItem,
  deleteGroceryEntry,
  deleteInventoryItem,
  fetchGroceryItems,
  fetchInventoryItems,
  updateGroceryEntry,
  updateInventoryItem,
} from './api';
import { kitchenKeys } from './query-keys';
import type { GroceryListEntry, InventoryItem, NewItemInput, StorageLocation } from './types';

export function useInventoryItems() {
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useQuery({
    queryKey: kitchenKeys.items(householdId),
    queryFn: () => fetchInventoryItems(householdId!),
    enabled: !!householdId,
  });
}

export function useGroceryItems() {
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useQuery({
    queryKey: kitchenKeys.groceryItems(householdId),
    queryFn: () => fetchGroceryItems(householdId!),
    enabled: !!householdId,
  });
}

export function useAddItem() {
  const queryClient = useQueryClient();
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useMutation({
    mutationFn: (input: NewItemInput) => createInventoryItem(householdId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kitchenKeys.items(householdId) });
    },
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Omit<InventoryItem, 'id' | 'addedAt' | 'updatedAt'>>;
    }) => updateInventoryItem(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kitchenKeys.items(householdId) });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useMutation({
    mutationFn: (id: string) => deleteInventoryItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kitchenKeys.items(householdId) });
      // The server-side trigger may have unlinked a grocery entry.
      queryClient.invalidateQueries({ queryKey: kitchenKeys.groceryItems(householdId) });
    },
  });
}

export function useAddGroceryItem() {
  const queryClient = useQueryClient();
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useMutation({
    mutationFn: (name: string) => {
      const trimmed = name.trim();
      const existing = queryClient.getQueryData<GroceryListEntry[]>(
        kitchenKeys.groceryItems(householdId),
      );
      const alreadyOnList = existing?.some(
        (entry) => entry.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (!trimmed || alreadyOnList) return Promise.resolve(undefined);
      return createGroceryEntry(householdId!, trimmed);
    },
    onSuccess: (result) => {
      if (result) queryClient.invalidateQueries({ queryKey: kitchenKeys.groceryItems(householdId) });
    },
  });
}

export function useAddInventoryItemToGrocery() {
  const queryClient = useQueryClient();
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useMutation({
    mutationFn: (inventoryItemId: string) => {
      const items = queryClient.getQueryData<InventoryItem[]>(kitchenKeys.items(householdId));
      const item = items?.find((candidate) => candidate.id === inventoryItemId);
      if (!item) return Promise.resolve(undefined);

      const groceryItems = queryClient.getQueryData<GroceryListEntry[]>(
        kitchenKeys.groceryItems(householdId),
      );
      const alreadyOnList = groceryItems?.some(
        (entry) =>
          entry.inventoryItemId === inventoryItemId ||
          entry.name.toLowerCase() === item.name.toLowerCase(),
      );
      if (alreadyOnList) return Promise.resolve(undefined);

      return createGroceryEntry(householdId!, item.name, inventoryItemId);
    },
    onSuccess: (result) => {
      if (result) queryClient.invalidateQueries({ queryKey: kitchenKeys.groceryItems(householdId) });
    },
  });
}

export function useUpdateGroceryItem() {
  const queryClient = useQueryClient();
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateGroceryEntry(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kitchenKeys.groceryItems(householdId) });
    },
  });
}

export function useRemoveGroceryItem() {
  const queryClient = useQueryClient();
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useMutation({
    mutationFn: (id: string) => deleteGroceryEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kitchenKeys.groceryItems(householdId) });
    },
  });
}

/** For unlinked entries, `location` is required — the UI collects it via a quick picker before calling this, same as the old store action. */
export function usePurchaseGroceryItem() {
  const queryClient = useQueryClient();
  const { data: household } = useMyHousehold();
  const householdId = household?.id;

  return useMutation({
    mutationFn: async ({
      groceryItemId,
      location,
    }: {
      groceryItemId: string;
      location?: StorageLocation;
    }) => {
      const groceryItems = queryClient.getQueryData<GroceryListEntry[]>(
        kitchenKeys.groceryItems(householdId),
      );
      const entry = groceryItems?.find((candidate) => candidate.id === groceryItemId);
      if (!entry) return;

      if (entry.inventoryItemId) {
        await updateInventoryItem(entry.inventoryItemId, { status: 'in_stock' });
      } else if (location) {
        await createInventoryItem(householdId!, { name: entry.name, location });
      } else {
        return;
      }

      await deleteGroceryEntry(groceryItemId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kitchenKeys.items(householdId) });
      queryClient.invalidateQueries({ queryKey: kitchenKeys.groceryItems(householdId) });
    },
  });
}
