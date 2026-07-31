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
  /** True when the global-cache lookup itself failed — the household-memory result (if any) is still usable. */
  lookupFailed: boolean;
};

/**
 * Runs the global product lookup and this household's remembered choice in
 * parallel. Household memory takes priority when prefilling (plan section
 * 1: "prefer the household's previous choices") — that merge happens in the
 * caller, this hook just returns both results. Either half failing doesn't
 * sink the other: a household-memory read failure shouldn't hide a
 * perfectly good external lookup, and vice versa.
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
      const [productResult, memoryResult] = await Promise.allSettled([
        lookupBarcode(barcode),
        fetchProductMemoryByBarcode(householdId, barcode),
      ]);

      if (productResult.status === 'rejected' && memoryResult.status === 'rejected') {
        throw productResult.reason;
      }

      return {
        product: productResult.status === 'fulfilled' ? productResult.value : null,
        memory: memoryResult.status === 'fulfilled' ? memoryResult.value : null,
        lookupFailed: productResult.status === 'rejected',
      };
    },
  });
}

export function useUpsertProductMemory() {
  return useMutation({
    mutationFn: ({ householdId, input }: { householdId: string; input: ProductMemoryInput }) =>
      upsertProductMemory(householdId, input),
  });
}
