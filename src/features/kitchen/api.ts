import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

import type {
  ExpirationInfo,
  GroceryListEntry,
  InventoryItem,
  InventoryStatus,
  NewItemInput,
  Ownership,
  StorageLocation,
} from './types';

// Thin wrappers over supabase-js, same shape as household/api.ts — no
// caching/orchestration here, that's queries.ts's job. RLS is the sole
// authority on what a given user can read/write.

type InventoryRow = Database['public']['Tables']['inventory_items']['Row'];
type GroceryRow = Database['public']['Tables']['grocery_list_entries']['Row'];

function mapInventoryItem(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category as InventoryItem['category'],
    location: row.location as StorageLocation,
    status: row.status as InventoryStatus,
    quantity: row.quantity ?? undefined,
    unit: (row.unit as InventoryItem['unit']) ?? undefined,
    expiration:
      row.expiration_date && row.expiration_confidence
        ? {
            date: row.expiration_date,
            confidence: row.expiration_confidence as ExpirationInfo['confidence'],
          }
        : undefined,
    ownership: row.ownership as Ownership,
    ownerId: row.owner_household_member_id ?? undefined,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
    notes: row.notes ?? undefined,
    barcode: row.barcode ?? undefined,
  };
}

function mapGroceryEntry(row: GroceryRow): GroceryListEntry {
  return {
    id: row.id,
    name: row.name,
    addedAt: row.added_at,
    inventoryItemId: row.inventory_item_id ?? undefined,
  };
}

export async function fetchInventoryItems(householdId: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('household_id', householdId)
    .order('added_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapInventoryItem);
}

export async function fetchGroceryItems(householdId: string): Promise<GroceryListEntry[]> {
  const { data, error } = await supabase
    .from('grocery_list_entries')
    .select('*')
    .eq('household_id', householdId)
    .order('added_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapGroceryEntry);
}

export async function createInventoryItem(
  householdId: string,
  input: NewItemInput,
): Promise<InventoryItem> {
  const hasQuantity = input.quantity !== undefined;

  // `barcode` is only ever a real value when this insert came from the scan
  // flow (checkpoint B) — the key is omitted entirely (not sent as an
  // explicit null) for a plain manual Add Item. This matters beyond style:
  // a household whose Supabase project hasn't yet run the migration that
  // adds the `barcode` column would otherwise get "column barcode does not
  // exist" on every single insert, including ones that have nothing to do
  // with scanning. Confirmed empirically against the actual migration.
  const payload: Database['public']['Tables']['inventory_items']['Insert'] = {
    household_id: householdId,
    name: input.name.trim(),
    category: input.category ?? 'other',
    location: input.location,
    status: input.status ?? 'in_stock',
    quantity: input.quantity ?? null,
    unit: hasQuantity ? (input.unit ?? 'count') : null,
    expiration_date: input.expiration?.date ?? null,
    expiration_confidence: input.expiration?.confidence ?? null,
    ownership: input.ownership ?? 'shared',
    owner_household_member_id: input.ownership === 'personal' ? (input.ownerId ?? null) : null,
    notes: input.notes ?? null,
  };
  if (input.barcode) payload.barcode = input.barcode;

  const { data, error } = await supabase.from('inventory_items').insert(payload).select().single();

  if (error) throw error;
  return mapInventoryItem(data);
}

/**
 * Mirrors the old store's updateItem normalization exactly: shared items
 * never carry an owner, and clearing quantity clears its unit too. Doing
 * this here (not just relying on the DB check constraint) means a bad
 * combination never even reaches the network.
 */
export async function updateInventoryItem(
  id: string,
  patch: Partial<Omit<InventoryItem, 'id' | 'addedAt' | 'updatedAt'>>,
): Promise<InventoryItem> {
  const payload: Database['public']['Tables']['inventory_items']['Update'] = {};

  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.category !== undefined) payload.category = patch.category;
  if (patch.location !== undefined) payload.location = patch.location;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.notes !== undefined) payload.notes = patch.notes || null;

  if ('quantity' in patch) {
    payload.quantity = patch.quantity ?? null;
    payload.unit = patch.quantity === undefined ? null : (patch.unit ?? 'count');
  } else if (patch.unit !== undefined) {
    payload.unit = patch.unit;
  }

  if ('expiration' in patch) {
    payload.expiration_date = patch.expiration?.date ?? null;
    payload.expiration_confidence = patch.expiration?.confidence ?? null;
  }

  if (patch.ownership !== undefined) {
    payload.ownership = patch.ownership;
    payload.owner_household_member_id =
      patch.ownership === 'personal' ? (patch.ownerId ?? null) : null;
  } else if (patch.ownerId !== undefined) {
    payload.owner_household_member_id = patch.ownerId;
  }

  const { data, error } = await supabase
    .from('inventory_items')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return mapInventoryItem(data);
}

/** Permanent removal. The unlink-grocery-entries-on-delete trigger (server side) keeps any linked grocery entry around as a plain manual entry, matching the old store's deleteItem behavior. */
export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id);
  if (error) throw error;
}

export async function createGroceryEntry(
  householdId: string,
  name: string,
  inventoryItemId?: string,
): Promise<GroceryListEntry> {
  const { data, error } = await supabase
    .from('grocery_list_entries')
    .insert({
      household_id: householdId,
      name: name.trim(),
      inventory_item_id: inventoryItemId ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return mapGroceryEntry(data);
}

export async function updateGroceryEntry(id: string, name: string): Promise<GroceryListEntry> {
  const { data, error } = await supabase
    .from('grocery_list_entries')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return mapGroceryEntry(data);
}

export async function deleteGroceryEntry(id: string): Promise<void> {
  const { error } = await supabase.from('grocery_list_entries').delete().eq('id', id);
  if (error) throw error;
}
