import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import type { Ownership, StorageLocation } from '@/features/kitchen/types';

import type { Receipt } from './receipt-validator';
import type { ProductMemory, ScannedProduct } from './types';

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
 * for a real invoke/network/auth failure.
 *
 * Deliberately does NOT collapse every failure into one generic "check your
 * connection" message — `supabase.functions.invoke`'s `error` can mean three
 * very different things, and conflating them was itself a bug: a
 * `FunctionsHttpError` means the function ran and returned OUR OWN JSON body
 * (e.g. "Not authenticated.", the products-cache read failure message, an
 * expired session) — that body is read and surfaced directly. A
 * `FunctionsFetchError`/`FunctionsRelayError` means the function couldn't be
 * reached at all (not deployed, genuine network outage) — that's the only
 * case that actually warrants a "check your connection" style message.
 */
export async function lookupBarcode(barcode: string): Promise<ScannedProduct | null> {
  const { data, error } = await supabase.functions.invoke<LookupBarcodeResponse>(
    'lookup-barcode',
    { body: { barcode } },
  );

  if (error) {
    if (error instanceof FunctionsHttpError) {
      let serverMessage: string | undefined;
      let status: number | undefined;
      try {
        status = error.context?.status;
        const responseBody = await error.context.json();
        serverMessage = typeof responseBody?.error === 'string' ? responseBody.error : undefined;
      } catch (parseError) {
        if (__DEV__) console.error('[scan] could not parse lookup-barcode error body', parseError);
      }
      // TEMP DIAGNOSTIC (barcode workflow bug hunt) — remove once confirmed
      // working against the live project.
      if (__DEV__) console.error('[scan] lookup-barcode HTTP error', { status, serverMessage });

      if (status === 401) {
        throw new Error('Your session has expired — sign out and back in, then try scanning again.');
      }
      throw new Error(serverMessage ?? 'Could not look up that barcode.');
    }
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      if (__DEV__) console.error('[scan] lookup-barcode unreachable', error);
      throw new Error(
        'Could not reach the barcode lookup service — check your connection and try again.',
      );
    }
    if (__DEV__) console.error('[scan] lookup-barcode failed', error);
    throw new Error('Could not look up that barcode.');
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

// -----------------------------------------------------------------------------
// household_product_memory — checkpoint C. Plain RLS reads/writes (Kitchen's
// pattern, not Money/Tasks' RPC-only pattern — plan section 7), scoped to
// the barcode-keyed path only; the no-barcode name-fingerprint path is
// exercised for the first time by the receipt flow, not here.
// -----------------------------------------------------------------------------

type MemoryRow = Database['public']['Tables']['household_product_memory']['Row'];

function mapProductMemory(row: MemoryRow): ProductMemory {
  return {
    id: row.id,
    productKey: row.product_key,
    barcode: row.barcode ?? undefined,
    preferredName: row.preferred_name,
    category: row.category ?? undefined,
    storageLocation: (row.storage_location as StorageLocation | null) ?? undefined,
    defaultOwnership: row.default_ownership as Ownership,
    defaultOwnerId: row.default_owner_household_member_id ?? undefined,
  };
}

/** Resolves to `null` when this household has never scanned this barcode before — not an error. */
export async function fetchProductMemoryByBarcode(
  householdId: string,
  barcode: string,
): Promise<ProductMemory | null> {
  const { data, error } = await supabase
    .from('household_product_memory')
    .select('*')
    .eq('household_id', householdId)
    .eq('barcode', barcode)
    .maybeSingle();

  if (error) {
    if (__DEV__) console.error('[scan] household_product_memory read failed', error); // TEMP DIAGNOSTIC
    throw error;
  }
  if (__DEV__) console.log('[scan] household memory', barcode, data ? 'hit' : 'miss'); // TEMP DIAGNOSTIC
  return data ? mapProductMemory(data) : null;
}

export type ProductMemoryInput = {
  barcode: string;
  preferredName: string;
  category?: string;
  storageLocation?: StorageLocation;
  defaultOwnership: Ownership;
  defaultOwnerId?: string;
};

/**
 * Upserts this household's remembered choice for a barcode, keyed on
 * (household_id, product_key) — `product_key` is just the barcode itself
 * for this checkpoint's barcode-only path. Called after a successful Add so
 * the next scan of the same barcode in this household needs zero re-entry
 * (plan section 12).
 */
export async function upsertProductMemory(
  householdId: string,
  input: ProductMemoryInput,
): Promise<void> {
  const { error } = await supabase.from('household_product_memory').upsert(
    {
      household_id: householdId,
      product_key: input.barcode,
      barcode: input.barcode,
      preferred_name: input.preferredName,
      category: input.category ?? null,
      storage_location: input.storageLocation ?? null,
      default_ownership: input.defaultOwnership,
      default_owner_household_member_id:
        input.defaultOwnership === 'personal' ? (input.defaultOwnerId ?? null) : null,
    },
    { onConflict: 'household_id,product_key' },
  );

  if (__DEV__) {
    // TEMP DIAGNOSTIC (barcode workflow bug hunt) — remove once confirmed
    // working against the live project.
    console.log('[scan] upsertProductMemory', { householdId, input, error: error?.message });
  }
  if (error) throw error;
}

// -----------------------------------------------------------------------------
// process-receipt — checkpoint E. Deliberately minimal: this only proves the
// Edge Function end to end (photo in, validated Receipt + receipt_imports.id
// out). Per the explicit checkpoint E scope, the Receipt Review screen that
// would actually DO something with this Receipt is checkpoint G, gated until
// this has been confirmed working against a real photographed receipt.
// -----------------------------------------------------------------------------

type ProcessReceiptResponse = {
  receiptImportId: string;
  receipt: Receipt;
  error?: string;
};

export type ProcessReceiptResult = {
  receiptImportId: string;
  receipt: Receipt;
};

// A Claude vision call plus everything around it is normally a few seconds,
// but nothing guarantees the underlying fetch ever settles (a dropped
// connection mid-request can hang indefinitely rather than erroring). Without
// a ceiling here, the caller's "processing" state could get stuck forever
// with no way out — this is what makes "capture/processing state resets
// correctly after failure" and "must always be able to scan another receipt"
// actually true even in that worst case, not just in the happy path. If the
// underlying invoke eventually does resolve after this fires, its result is
// simply ignored — harmless, since the caller has already moved on.
const PROCESS_RECEIPT_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Same error-shape discipline as lookupBarcode above: a `FunctionsHttpError`
 * means the function ran and returned OUR OWN JSON body (auth failure,
 * validation failure, abuse-guard rejection, etc.) — that message is
 * surfaced directly rather than collapsed into one generic string. A
 * `FunctionsFetchError`/`FunctionsRelayError` means the function couldn't be
 * reached at all.
 */
export async function processReceipt(
  householdId: string,
  image: { base64: string; mimeType: string },
): Promise<ProcessReceiptResult> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke<ProcessReceiptResponse>('process-receipt', {
      body: { householdId, imageBase64: image.base64, mimeType: image.mimeType },
    }),
    PROCESS_RECEIPT_TIMEOUT_MS,
    'This is taking too long — check your connection and try again.',
  );

  if (error) {
    if (error instanceof FunctionsHttpError) {
      let serverMessage: string | undefined;
      let status: number | undefined;
      try {
        status = error.context?.status;
        const responseBody = await error.context.json();
        serverMessage = typeof responseBody?.error === 'string' ? responseBody.error : undefined;
      } catch (parseError) {
        if (__DEV__) console.error('[scan] could not parse process-receipt error body', parseError);
      }
      if (__DEV__) console.error('[scan] process-receipt HTTP error', { status, serverMessage });

      if (status === 401) {
        throw new Error('Your session has expired — sign out and back in, then try again.');
      }
      throw new Error(serverMessage ?? 'Could not process that receipt.');
    }
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      if (__DEV__) console.error('[scan] process-receipt unreachable', error);
      throw new Error('Could not reach the receipt-scanning service — check your connection and try again.');
    }
    if (__DEV__) console.error('[scan] process-receipt failed', error);
    throw new Error('Could not process that receipt.');
  }
  if (!data || data.error) {
    throw new Error(data?.error ?? 'Could not process that receipt.');
  }

  return { receiptImportId: data.receiptImportId, receipt: data.receipt };
}
