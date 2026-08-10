import { useMutation } from '@tanstack/react-query';

import {
  fetchProductMemoryByBarcode,
  lookupBarcode,
  upsertProductMemory,
  type ProductMemoryInput,
} from './api';
import type { ProductMemory, ScannedProduct } from './types';

// Mutations, not queries — every one of these is a one-shot action fired by
// a scan/save event, not cacheable/refetchable data keyed by anything
// stable. Matches how the rest of the app already draws that line (queries
// for lists/records, mutations for actions).

/** Standalone global-cache lookup — kept separate from useScanBarcode below in case it's ever needed on its own. */
export function useLookupBarcode() {
  return useMutation({
    mutationFn: (barcode: string) => lookupBarcode(barcode),
  });
}

type ScanBarcodeResult = {
  product: ScannedProduct | null;
  memory: ProductMemory | null;
  /** True when the household-memory read itself failed (not just "no memory found"). */
  memoryFailed: boolean;
  /** True when the lookup-barcode Edge Function call failed. Only ever set when memory was a genuine miss — a known product short-circuits before this runs at all. */
  lookupFailed: boolean;
};

/**
 * Lookup order is exactly: this household's own remembered choice first,
 * then (only on a miss) the lookup-barcode Edge Function's own chain
 * (global cache -> Open Food Facts -> UPCitemdb -> unknown). This is a real
 * sequential short-circuit, not just a priority-on-merge — a barcode this
 * household has already scanned before never touches the network at all,
 * which also means a known product still works perfectly even if the Edge
 * Function itself is down.
 *
 * Never throws: a failure on either side is captured into a flag rather
 * than rejecting the mutation, so the caller can always fall through to
 * manual entry with a clear (non-blocking) explanation instead of a dead
 * end.
 */
export function useScanBarcode() {
  return useMutation({
    mutationFn: async ({
      householdId,
      barcode,
    }: {
      householdId: string;
      barcode: string;
    }): Promise<ScanBarcodeResult> => {
      let memory: ProductMemory | null = null;
      let memoryFailed = false;
      try {
        memory = await fetchProductMemoryByBarcode(householdId, barcode);
      } catch (error) {
        memoryFailed = true;
        if (__DEV__) console.error('[scan] household memory lookup failed', error); // TEMP DIAGNOSTIC
      }

      if (memory) {
        if (__DEV__) console.log('[scan] resolved from household memory, skipping Edge Function', barcode); // TEMP DIAGNOSTIC
        return { product: null, memory, memoryFailed, lookupFailed: false };
      }

      let product: ScannedProduct | null = null;
      let lookupFailed = false;
      try {
        product = await lookupBarcode(barcode);
      } catch (error) {
        lookupFailed = true;
        if (__DEV__) console.error('[scan] lookup-barcode failed', error); // TEMP DIAGNOSTIC
      }

      return { product, memory: null, memoryFailed, lookupFailed };
    },
  });
}

export function useUpsertProductMemory() {
  return useMutation({
    mutationFn: ({ householdId, input }: { householdId: string; input: ProductMemoryInput }) =>
      upsertProductMemory(householdId, input),
  });
}
