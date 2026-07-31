import { supabase } from '@/lib/supabase';

import type { ScannedProduct } from './types';

// Thin wrapper over supabase.functions.invoke, same shape as every other
// feature's api.ts. The cache -> Open Food Facts -> UPCitemdb -> unknown
// provider chain lives entirely in the lookup-barcode Edge Function (plan
// section 2 / approval adjustment 2) — this file never calls a provider
// directly.

type LookupBarcodeResponse = {
  product: {
    barcode: string;
    name: string;
    brand: string | null;
    category: string | null;
    image_url: string | null;
    source: string;
  } | null;
  error?: string;
};

/**
 * Resolves to `null` for a genuinely unknown barcode — not an error, the
 * caller should fall through to manual entry (plan section 18). Throws only
 * for a real invoke/network/auth failure, with a plain-language message
 * matching the `getErrorMessage`/`mapAuthError` convention used elsewhere.
 */
export async function lookupBarcode(barcode: string): Promise<ScannedProduct | null> {
  const { data, error } = await supabase.functions.invoke<LookupBarcodeResponse>(
    'lookup-barcode',
    { body: { barcode } },
  );

  if (error) {
    throw new Error('Could not look up that barcode — check your connection and try again.');
  }
  if (!data || data.error) {
    throw new Error(data?.error ?? 'Could not look up that barcode.');
  }
  if (!data.product) return null;

  return {
    barcode: data.product.barcode,
    name: data.product.name,
    brand: data.product.brand ?? undefined,
    category: data.product.category ?? undefined,
    imageUrl: data.product.image_url ?? undefined,
    source: data.product.source as ScannedProduct['source'],
  };
}
