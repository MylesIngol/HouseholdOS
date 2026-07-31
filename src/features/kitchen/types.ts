// -----------------------------------------------------------------------------
// Core inventory model
//
// Designed so a future receipt/barcode scan pipeline can create and update
// these same records through the same store actions (addItem/updateItem) that
// manual entry uses — no redesign needed, just a new caller.
// -----------------------------------------------------------------------------

export type StorageLocation = 'pantry' | 'fridge' | 'freezer';

/**
 * The three states cover "low-stock state" from the product spec too — a
 * separate boolean would just be a second source of truth for the same fact
 * as status === 'low', so it isn't modeled separately.
 */
export type InventoryStatus = 'in_stock' | 'low' | 'out';

export type ItemCategory =
  | 'produce'
  | 'dairy'
  | 'meat'
  | 'grains'
  | 'canned'
  | 'condiments'
  | 'beverages'
  | 'snacks'
  | 'frozen'
  | 'other';

/** count-based items track a plain number; unit defaults to 'count' and isn't user-editable yet. */
export type QuantityUnit = 'count' | 'oz' | 'lb' | 'g' | 'kg' | 'ml' | 'l' | 'pack';

export type ExpirationConfidence = 'exact' | 'estimated';

export type ExpirationInfo = {
  /** ISO date string (yyyy-mm-dd). */
  date: string;
  confidence: ExpirationConfidence;
};

export type Ownership = 'shared' | 'personal';

// HouseholdMember lives in src/features/household/types.ts now — Kitchen
// references the shared roster (via ownerId below) rather than keeping its
// own member type.

export type InventoryItem = {
  id: string;
  name: string;
  category: ItemCategory;
  location: StorageLocation;
  status: InventoryStatus;
  /** Present only for items that are naturally counted (eggs, cans, bottles, packs). */
  quantity?: number;
  unit?: QuantityUnit;
  /** Absent means unknown/not tracked — most pantry staples won't have one. */
  expiration?: ExpirationInfo;
  ownership: Ownership;
  /** Only meaningful when ownership === 'personal'. */
  ownerId?: string;
  /** ISO date string. */
  addedAt: string;
  /** ISO date string, bumped on every edit — also used to sort "recently out". */
  updatedAt: string;
  notes?: string;
  /** Present only for items added via barcode scan (or, later, receipt import). */
  barcode?: string;
};

/** Fields a user (or, later, a scan) supplies to create an item; everything else gets defaults. */
export type NewItemInput = {
  name: string;
  location: StorageLocation;
  category?: ItemCategory;
  status?: InventoryStatus;
  quantity?: number;
  unit?: QuantityUnit;
  expiration?: ExpirationInfo;
  ownership?: Ownership;
  ownerId?: string;
  notes?: string;
  barcode?: string;
};

// -----------------------------------------------------------------------------
// Grocery list
// -----------------------------------------------------------------------------

export type GroceryListEntry = {
  id: string;
  name: string;
  addedAt: string;
  /**
   * Links this entry back to the inventory item it was added from (e.g. via
   * "Add to Grocery List" on a Low/Out item). When present, purchasing this
   * entry restocks that exact item instead of asking where it goes.
   */
  inventoryItemId?: string;
};
