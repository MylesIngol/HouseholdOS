import { getCategoryLabel } from './display';
import { getExpirationUrgency } from './expiration';
import type { InventoryItem, StorageLocation } from './types';

// Pure functions over plain arrays — no store dependency, so they're usable
// from the Kitchen store, the Kitchen screen, and Home alike, and are trivial
// to test.

export type LocationFilter = StorageLocation | 'all';

/** Items that should appear in the normal browsing view — "Out" is soft-hidden, not deleted. */
export function getActiveItems(items: InventoryItem[]): InventoryItem[] {
  return items.filter((item) => item.status !== 'out');
}

export function getItemsByLocation(
  items: InventoryItem[],
  filter: LocationFilter,
): InventoryItem[] {
  if (filter === 'all') return items;
  return items.filter((item) => item.location === filter);
}

export function getExpiringSoonItems(
  items: InventoryItem[],
  referenceDate: Date = new Date(),
): InventoryItem[] {
  return getActiveItems(items).filter((item) => {
    const urgency = getExpirationUrgency(item.expiration, referenceDate);
    return (
      urgency === 'expired' || urgency === 'today' || urgency === 'tomorrow' || urgency === 'soon'
    );
  });
}

export function getLowStockItems(items: InventoryItem[]): InventoryItem[] {
  return items.filter((item) => item.status === 'low');
}

/**
 * Case-insensitive substring match against name and category. Callers should
 * pass in an already-active (non-"out") list — this never reintroduces Out
 * items on its own. An empty/whitespace query is a no-op, so this can always
 * be chained after `getItemsByLocation` regardless of whether search is active.
 */
export function filterBySearch(items: InventoryItem[], query: string): InventoryItem[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return items;

  return items.filter((item) => {
    const name = item.name.toLowerCase();
    const categoryLabel = getCategoryLabel(item.category).toLowerCase();
    return name.includes(trimmed) || categoryLabel.includes(trimmed);
  });
}

/** Most-recently-out first, so the quickest re-add targets surface first. */
export function getOutItems(items: InventoryItem[]): InventoryItem[] {
  return items
    .filter((item) => item.status === 'out')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
