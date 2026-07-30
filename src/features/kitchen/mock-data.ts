import { addDaysIso } from './expiration';
import type { GroceryListEntry, InventoryItem } from './types';

// Local mock data only — no backend yet. Dates are generated relative to
// "now" (rather than hardcoded) so the expiring-soon/low-stock demo data
// stays meaningful no matter when this runs. Household members now live in
// src/features/household/mock-data.ts — see item #6 below for how ownership
// references that shared roster.

const now = new Date().toISOString();

export const inventoryItems: InventoryItem[] = [
  {
    id: '1',
    name: 'Milk',
    category: 'dairy',
    location: 'fridge',
    status: 'low',
    ownership: 'shared',
    addedAt: now,
    updatedAt: now,
  },
  {
    id: '2',
    name: 'Eggs',
    category: 'dairy',
    location: 'fridge',
    status: 'in_stock',
    quantity: 8,
    unit: 'count',
    ownership: 'shared',
    addedAt: now,
    updatedAt: now,
  },
  {
    id: '3',
    name: 'Chicken Breast',
    category: 'meat',
    location: 'fridge',
    status: 'in_stock',
    expiration: { date: addDaysIso(1), confidence: 'exact' },
    ownership: 'shared',
    addedAt: now,
    updatedAt: now,
  },
  {
    id: '4',
    name: 'Greek Yogurt',
    category: 'dairy',
    location: 'fridge',
    status: 'in_stock',
    quantity: 4,
    unit: 'pack',
    expiration: { date: addDaysIso(3), confidence: 'estimated' },
    ownership: 'shared',
    addedAt: now,
    updatedAt: now,
  },
  {
    id: '5',
    name: 'Butter',
    category: 'dairy',
    location: 'fridge',
    status: 'out',
    ownership: 'shared',
    addedAt: now,
    updatedAt: now,
  },
  {
    id: '6',
    name: 'Protein Shake',
    category: 'beverages',
    location: 'fridge',
    status: 'in_stock',
    quantity: 6,
    unit: 'count',
    // Was personal to Kitchen's old mock-only "Sam" — now that Kitchen reads
    // the shared household roster (You/Bella/Karyn/Nat), there's no
    // equivalent identity to remap this to, so it becomes shared rather than
    // inventing a relationship between two previously-separate mock people.
    ownership: 'shared',
    addedAt: now,
    updatedAt: now,
  },
  {
    id: '7',
    name: 'Frozen Peas',
    category: 'frozen',
    location: 'freezer',
    status: 'in_stock',
    ownership: 'shared',
    addedAt: now,
    updatedAt: now,
  },
  {
    id: '8',
    name: 'Ice Cream',
    category: 'frozen',
    location: 'freezer',
    status: 'low',
    ownership: 'shared',
    addedAt: now,
    updatedAt: now,
  },
  {
    id: '9',
    name: 'Rice',
    category: 'grains',
    location: 'pantry',
    status: 'in_stock',
    ownership: 'shared',
    addedAt: now,
    updatedAt: now,
  },
  {
    id: '10',
    name: 'Ketchup',
    category: 'condiments',
    location: 'pantry',
    status: 'low',
    ownership: 'shared',
    addedAt: now,
    updatedAt: now,
  },
  {
    id: '11',
    name: 'Cereal',
    category: 'grains',
    location: 'pantry',
    status: 'in_stock',
    expiration: { date: addDaysIso(2), confidence: 'estimated' },
    ownership: 'shared',
    addedAt: now,
    updatedAt: now,
  },
  {
    id: '12',
    name: 'Canned Beans',
    category: 'canned',
    location: 'pantry',
    status: 'in_stock',
    quantity: 6,
    unit: 'count',
    ownership: 'shared',
    addedAt: now,
    updatedAt: now,
  },
  {
    id: '13',
    name: 'Olive Oil',
    category: 'condiments',
    location: 'pantry',
    status: 'out',
    ownership: 'shared',
    addedAt: now,
    updatedAt: now,
  },
];

export const groceryListEntries: GroceryListEntry[] = [];
