import type { ExampleItem } from './types';

// Reference module only — replace with a real Supabase query once lib/supabase.ts exists.
export async function fetchExampleItems(): Promise<ExampleItem[]> {
  return [
    { id: '1', label: 'First item' },
    { id: '2', label: 'Second item' },
    { id: '3', label: 'Third item' },
  ];
}
