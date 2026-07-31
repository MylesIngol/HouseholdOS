import { useMutation } from '@tanstack/react-query';

import { lookupBarcode } from './api';

// A mutation, not a query — this is a one-shot action triggered by a scan
// event, not cacheable/refetchable data keyed by anything stable. Matches
// how the rest of the app already draws that line (queries for lists/
// records, mutations for actions).
export function useLookupBarcode() {
  return useMutation({
    mutationFn: (barcode: string) => lookupBarcode(barcode),
  });
}
