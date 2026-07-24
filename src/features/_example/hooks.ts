import { useQuery } from '@tanstack/react-query';

import { fetchExampleItems } from './api';
import { exampleKeys } from './keys';

export function useExampleItems() {
  return useQuery({
    queryKey: exampleKeys.list(),
    queryFn: fetchExampleItems,
  });
}
