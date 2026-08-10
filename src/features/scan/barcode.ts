// Normalizes a raw scanned barcode into the single canonical form used as a
// lookup/cache key everywhere downstream (lookup-barcode's own cache,
// household_product_memory, and the barcode stored on the inventory item
// itself). UPC-A (12 digits) and EAN-13 (13 digits, leading 0) encode the
// same product — without this, the same physical barcode could scan as
// either depending on which symbology the camera happened to decode,
// causing spurious cache/memory misses (exactly the "second scan isn't
// recognized" failure mode).
//
// Applied exactly once, at the point a barcode is first captured
// (BarcodeScannerSheet) — everything downstream (useScanBarcode,
// BarcodeConfirmSheet, createInventoryItem, upsertProductMemory) treats its
// input as already canonical rather than re-normalizing independently,
// which is what actually guarantees consistency rather than just hoping
// every call site remembers to do it the same way.
//
// Mirrored (not shared/imported) in supabase/functions/lookup-barcode's own
// normalizeBarcode — Edge Functions run on Deno and aren't bundled with the
// app, so this is a deliberate, documented duplicate, not drift.
export function normalizeBarcode(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.length === 12 ? `0${trimmed}` : trimmed;
}
