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

/** Most-recently-out first, so the quickest re-add targets surface first. */
export function getOutItems(items: InventoryItem[]): InventoryItem[] {
  return items
    .filter((item) => item.status === 'out')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
