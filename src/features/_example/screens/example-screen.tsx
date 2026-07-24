import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

import { ExampleListItem } from '../components/example-list-item';
import { useExampleItems } from '../hooks';
import { useExampleUiStore } from '../store';

export function ExampleScreen() {
  const { data, isLoading, error } = useExampleItems();
  const selectedId = useExampleUiStore((state) => state.selectedId);
  const select = useExampleUiStore((state) => state.select);

  if (isLoading) {
    return <ThemedText>Loading…</ThemedText>;
  }

  if (error) {
    return <ThemedText>Failed to load items.</ThemedText>;
  }

  return (
    <ThemedView style={styles.list}>
      {data?.map((item) => (
        <ExampleListItem
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          onPress={() => select(item.id === selectedId ? null : item.id)}
        />
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
});
