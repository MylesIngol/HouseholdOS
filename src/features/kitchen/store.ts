import { create } from 'zustand';

import { groceryListEntries as seedGroceryItems, inventoryItems as seedItems } from './mock-data';
import type {
  GroceryListEntry,
  InventoryItem,
  InventoryStatus,
  NewItemInput,
  StorageLocation,
} from './types';

// Local-only state for this milestone. Kept as the single source of truth for
// Kitchen domain data (not TanStack Query — there's nothing async to cache
// yet) so a future Supabase-backed api.ts/hooks.ts can replace the seed +
// mutate-in-place logic here without the screens or selectors changing.

function generateId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

type KitchenState = {
  items: InventoryItem[];
  groceryItems: GroceryListEntry[];

  addItem: (input: NewItemInput) => void;
  updateItem: (
    id: string,
    patch: Partial<Omit<InventoryItem, 'id' | 'addedAt' | 'updatedAt'>>,
  ) => void;
  setStatus: (id: string, status: InventoryStatus) => void;

  addGroceryItem: (name: string) => void;
  addInventoryItemToGrocery: (inventoryItemId: string) => void;
  removeGroceryItem: (id: string) => void;
  /** For unlinked entries, `location` is required — the UI collects it via a quick picker before calling this. */
  purchaseGroceryItem: (groceryItemId: string, location?: StorageLocation) => void;
};

export const useKitchenStore = create<KitchenState>((set, get) => ({
  items: seedItems,
  groceryItems: seedGroceryItems,

  addItem: (input) => {
    const now = new Date().toISOString();
    const hasQuantity = input.quantity !== undefined;
    const newItem: InventoryItem = {
      id: generateId(),
      name: input.name.trim(),
      category: input.category ?? 'other',
      location: input.location,
      status: input.status ?? 'in_stock',
      quantity: input.quantity,
      unit: hasQuantity ? (input.unit ?? 'count') : undefined,
      expiration: input.expiration,
      ownership: input.ownership ?? 'shared',
      ownerId: input.ownership === 'personal' ? input.ownerId : undefined,
      notes: input.notes,
      addedAt: now,
      updatedAt: now,
    };
    set((state) => ({ items: [newItem, ...state.items] }));
  },

  updateItem: (id, patch) => {
    set((state) => ({
      items: state.items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (next.ownership === 'shared') next.ownerId = undefined;
        if (next.quantity === undefined) next.unit = undefined;
        return { ...next, updatedAt: new Date().toISOString() };
      }),
    }));
  },

  setStatus: (id, status) => {
    get().updateItem(id, { status });
  },

  addGroceryItem: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const alreadyOnList = get().groceryItems.some(
      (entry) => entry.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (alreadyOnList) return;

    const entry: GroceryListEntry = {
      id: generateId(),
      name: trimmed,
      addedAt: new Date().toISOString(),
    };
    set((state) => ({ groceryItems: [entry, ...state.groceryItems] }));
  },

  addInventoryItemToGrocery: (inventoryItemId) => {
    const item = get().items.find((candidate) => candidate.id === inventoryItemId);
    if (!item) return;

    const alreadyOnList = get().groceryItems.some(
      (entry) =>
        entry.inventoryItemId === inventoryItemId ||
        entry.name.toLowerCase() === item.name.toLowerCase(),
    );
    if (alreadyOnList) return;

    const entry: GroceryListEntry = {
      id: generateId(),
      name: item.name,
      addedAt: new Date().toISOString(),
      inventoryItemId: item.id,
    };
    set((state) => ({ groceryItems: [entry, ...state.groceryItems] }));
  },

  removeGroceryItem: (id) => {
    set((state) => ({ groceryItems: state.groceryItems.filter((entry) => entry.id !== id) }));
  },

  purchaseGroceryItem: (groceryItemId, location) => {
    const entry = get().groceryItems.find((candidate) => candidate.id === groceryItemId);
    if (!entry) return;

    if (entry.inventoryItemId) {
      get().updateItem(entry.inventoryItemId, { status: 'in_stock' });
    } else if (location) {
      get().addItem({ name: entry.name, location });
    } else {
      return;
    }

    set((state) => ({
      groceryItems: state.groceryItems.filter((candidate) => candidate.id !== groceryItemId),
    }));
  },
}));
