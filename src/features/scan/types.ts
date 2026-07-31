import type { Ownership, StorageLocation } from '@/features/kitchen/types';

// Checkpoint B/C scope: barcode lookup result + household product memory
// shapes. Receipt-related types (Receipt, ReceiptItem, etc. — plan section
// 9) land in checkpoint E alongside the process-receipt Edge Function that
// produces them.

export type ScannedProductSource = 'open_food_facts' | 'upcitemdb' | 'manual';

export type ScannedProduct = {
  barcode: string;
  name: string;
  brand?: string;
  /**
   * Already mapped onto the Kitchen `ItemCategory` set (or `undefined` if
   * nothing matched) server-side, by lookup-barcode's category keyword
   * matcher — never an arbitrary provider string the client has to trust.
   */
  category?: string;
  imageUrl?: string;
  source: ScannedProductSource;
};

/**
 * This household's own remembered choices for a product — distinct from
 * `ScannedProduct` (the global, cross-household cache): two households can
 * share the same barcode's global product row while remembering completely
 * different names/categories/locations/ownership for it (plan section 2).
 * Takes priority over `ScannedProduct` when prefilling the confirm sheet.
 */
export type ProductMemory = {
  id: string;
  productKey: string;
  barcode?: string;
  preferredName: string;
  category?: string;
  storageLocation?: StorageLocation;
  defaultOwnership: Ownership;
  defaultOwnerId?: string;
};
