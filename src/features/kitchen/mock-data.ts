import type { ExpiringItem, GroceryItem, KitchenSectionSummary } from './types';

// Local mock data only — no backend yet. Replace with Supabase-backed queries
// once the kitchen feature gets its own api.ts/hooks.ts (see features/_example
// convention, since removed in favor of these real feature folders).

export const kitchenSections: KitchenSectionSummary[] = [
  { key: 'pantry', label: 'Pantry', itemCount: 24 },
  { key: 'fridge', label: 'Fridge', itemCount: 15 },
  { key: 'freezer', label: 'Freezer', itemCount: 9 },
];

export const expiringSoon: ExpiringItem[] = [
  { id: '1', name: 'Greek yogurt', location: 'Fridge', daysLeft: 1 },
  { id: '2', name: 'Spinach', location: 'Fridge', daysLeft: 2 },
  { id: '3', name: 'Sourdough bread', location: 'Pantry', daysLeft: 3 },
];

// Surfaced on Home; not broken out as its own Kitchen section in this milestone.
export const lowStockCount = 7;

export const groceryList: GroceryItem[] = [];
