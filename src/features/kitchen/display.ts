import { formatExpirationLabel, getExpirationUrgency } from './expiration';
import type { HouseholdMember, InventoryItem } from './types';

// Single-item presentation helpers — kept separate from selectors.ts (which
// operates on arrays) and from components (which shouldn't need to know the
// priority rules below).

export type BadgeTone = 'warning' | 'danger' | 'neutral';

export type ItemBadge = {
  label: string;
  tone: BadgeTone;
};

/**
 * The one most useful piece of extra info for a row, in priority order:
 * urgent expiration > low stock > quantity > nothing. Never more than one
 * badge — that's what keeps rows scannable.
 */
export function getPrimaryBadge(
  item: InventoryItem,
  referenceDate: Date = new Date(),
): ItemBadge | undefined {
  if (item.expiration) {
    const urgency = getExpirationUrgency(item.expiration, referenceDate);
    if (urgency && urgency !== 'normal') {
      return {
        label: formatExpirationLabel(item.expiration, referenceDate),
        tone: urgency === 'expired' || urgency === 'today' ? 'danger' : 'warning',
      };
    }
  }

  if (item.status === 'low') {
    return { label: 'Low', tone: 'warning' };
  }

  if (item.quantity !== undefined) {
    return { label: `${item.quantity} remaining`, tone: 'neutral' };
  }

  return undefined;
}

export function getLocationLabel(location: InventoryItem['location']): string {
  switch (location) {
    case 'pantry':
      return 'Pantry';
    case 'fridge':
      return 'Fridge';
    case 'freezer':
      return 'Freezer';
  }
}

export function getCategoryLabel(category: InventoryItem['category']): string {
  switch (category) {
    case 'produce':
      return 'Produce';
    case 'dairy':
      return 'Dairy';
    case 'meat':
      return 'Meat';
    case 'grains':
      return 'Grains';
    case 'canned':
      return 'Canned';
    case 'condiments':
      return 'Condiments';
    case 'beverages':
      return 'Beverages';
    case 'snacks':
      return 'Snacks';
    case 'frozen':
      return 'Frozen';
    case 'other':
      return 'Other';
  }
}

export function getStatusLabel(status: InventoryItem['status']): string {
  switch (status) {
    case 'in_stock':
      return 'In Stock';
    case 'low':
      return 'Low';
    case 'out':
      return 'Out';
  }
}

/** Location, plus the owner's name — but only when the item is personal; shared items stay unlabeled. */
export function getItemSubtitle(item: InventoryItem, members: HouseholdMember[]): string {
  const location = getLocationLabel(item.location);
  if (item.ownership !== 'personal') return location;

  const owner = members.find((member) => member.id === item.ownerId);
  return owner ? `${location} · ${owner.name}` : location;
}
