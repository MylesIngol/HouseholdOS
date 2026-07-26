import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { GroceryQuickAdd } from '@/features/kitchen/components/grocery-quick-add';
import { GroceryRow } from '@/features/kitchen/components/grocery-row';
import { InventoryRow } from '@/features/kitchen/components/inventory-row';
import { ItemSheet } from '@/features/kitchen/components/item-sheet';
import { OutItemsSheet } from '@/features/kitchen/components/out-items-sheet';
import { PillSelector } from '@/features/kitchen/components/pill-selector';
import {
  getActiveItems,
  getExpiringSoonItems,
  getItemsByLocation,
  getLowStockItems,
  getOutItems,
  type LocationFilter,
} from '@/features/kitchen/selectors';
import { useKitchenStore } from '@/features/kitchen/store';
import type { InventoryItem } from '@/features/kitchen/types';

const FILTER_OPTIONS: { value: LocationFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'pantry', label: 'Pantry' },
];

type SheetTarget = 'new' | InventoryItem;

export function KitchenScreen() {
  const items = useKitchenStore((state) => state.items);
  const groceryItems = useKitchenStore((state) => state.groceryItems);

  const [filter, setFilter] = useState<LocationFilter>('all');
  const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null);
  const [outSheetVisible, setOutSheetVisible] = useState(false);

  const activeItems = getActiveItems(items);
  const expiringSoon = getExpiringSoonItems(items).slice(0, 3);
  const lowStock = getLowStockItems(items).slice(0, 3);
  const filteredItems = getItemsByLocation(activeItems, filter);
  const outCount = getOutItems(items).length;

  const sheetVisible = sheetTarget !== null;
  const sheetItem = sheetTarget && sheetTarget !== 'new' ? sheetTarget : undefined;

  return (
    <Screen>
      <ThemedText type="title" style={styles.title}>
        Kitchen
      </ThemedText>

      <PillSelector options={FILTER_OPTIONS} value={filter} onChange={setFilter} />

      {expiringSoon.length > 0 && (
        <Section title="Expiring soon">
          <Card>
            {expiringSoon.map((item) => (
              <InventoryRow key={item.id} item={item} onPress={() => setSheetTarget(item)} />
            ))}
          </Card>
        </Section>
      )}

      {lowStock.length > 0 && (
        <Section title="Low stock">
          <Card>
            {lowStock.map((item) => (
              <InventoryRow key={item.id} item={item} onPress={() => setSheetTarget(item)} />
            ))}
          </Card>
        </Section>
      )}

      <Section title="Items" action={{ label: 'Add item', onPress: () => setSheetTarget('new') }}>
        {filteredItems.length === 0 ? (
          <EmptyState title="Nothing here yet" subtitle="Add an item to get started" />
        ) : (
          <Card>
            {filteredItems.map((item) => (
              <InventoryRow key={item.id} item={item} onPress={() => setSheetTarget(item)} />
            ))}
          </Card>
        )}
      </Section>

      <Section title="Grocery list">
        <GroceryQuickAdd />
        {groceryItems.length > 0 && (
          <Card>
            {groceryItems.map((entry) => (
              <GroceryRow key={entry.id} entry={entry} />
            ))}
          </Card>
        )}
      </Section>

      {outCount > 0 && (
        <Pressable onPress={() => setOutSheetVisible(true)} hitSlop={8}>
          <ThemedText type="small" themeColor="muted">
            Recently out · {outCount} {outCount === 1 ? 'item' : 'items'}
          </ThemedText>
        </Pressable>
      )}

      <ItemSheet visible={sheetVisible} item={sheetItem} onClose={() => setSheetTarget(null)} />
      <OutItemsSheet visible={outSheetVisible} onClose={() => setOutSheetVisible(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 34,
    lineHeight: 40,
  },
});
