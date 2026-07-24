export type KitchenSectionKey = 'pantry' | 'fridge' | 'freezer';

export type KitchenSectionSummary = {
  key: KitchenSectionKey;
  label: string;
  itemCount: number;
};

export type ExpiringItem = {
  id: string;
  name: string;
  location: 'Pantry' | 'Fridge' | 'Freezer';
  daysLeft: number;
};

export type GroceryItem = {
  id: string;
  name: string;
};
