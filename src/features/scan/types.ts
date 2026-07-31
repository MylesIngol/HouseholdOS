// Checkpoint B scope: barcode lookup result shape only. Receipt-related
// types (Receipt, ReceiptItem, etc. — plan section 9) land in checkpoint E
// alongside the process-receipt Edge Function that produces them.

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
