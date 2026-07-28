import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PillSelector } from '@/components/ui/pill-selector';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { Radii, Spacing } from '@/constants/theme';
import { GroceryQuickAdd } from '@/features/kitchen/components/grocery-quick-add';
import { GroceryRow } from '@/features/kitchen/components/grocery-row';
import { InventoryRow } from '@/features/kitchen/components/inventory-row';
import { ItemSheet } from '@/features/kitchen/components/item-sheet';
import { OutItemsSheet } from '@/features/kitchen/components/out-items-sheet';
import {
  filterBySearch,
  getActiveItems,
  getExpiringSoonItems,
  getItemsByLocation,
  getLowStockItems,
  getOutItems,
  type LocationFilter,
} from '@/features/kitchen/selectors';
import { useKitchenStore } from '@/features/kitchen/store';
import type { InventoryItem } from '@/features/kitchen/types';
import { useTheme } from '@/hooks/use-theme';

const FILTER_OPTIONS: { value: LocationFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'pantry', label: 'Pantry' },
];

type SheetTarget = 'new' | InventoryItem;

export function KitchenScreen() {
  const theme = useTheme();
  const items = useKitchenStore((state) => state.items);
  const groceryItems = useKitchenStore((state) => state.groceryItems);

  const [filter, setFilter] = useState<LocationFilter>('all');
  const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null);
  const [outSheetVisible, setOutSheetVisible] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // All three sections scope to the selected location first, then apply
  // their own rule on top (active-only, expiring-soon, low-stock) — one
  // shared `locationItems` base keeps that scoping in a single place instead
  // of duplicating the location filter three times.
  const locationItems = getItemsByLocation(items, filter);
  const activeItems = getActiveItems(locationItems);
  const expiringSoon = getExpiringSoonItems(locationItems).slice(0, 3);
  const lowStock = getLowStockItems(locationItems).slice(0, 3);
  const filteredItems = filterBySearch(activeItems, searchQuery);
  const isSearching = searchQuery.trim().length > 0;
  const outCount = getOutItems(items).length;

  const sheetVisible = sheetTarget !== null;
  const sheetItem = sheetTarget && sheetTarget !== 'new' ? sheetTarget : undefined;

  function handleToggleSearch() {
    if (searchOpen) {
      setSearchQuery('');
    }
    setSearchOpen((current) => !current);
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <ThemedText type="title" style={styles.title}>
          Kitchen
        </ThemedText>
        <Pressable onPress={handleToggleSearch} hitSlop={8} style={styles.searchToggle}>
          <SymbolView
            name={searchOpen ? 'xmark.circle.fill' : 'magnifyingglass'}
            size={22}
            tintColor={theme.textSecondary}
          />
        </Pressable>
      </View>

      {searchOpen && (
        <View style={styles.searchRow}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search items"
            placeholderTextColor={theme.muted}
            autoFocus
            style={[
              styles.searchInput,
              { backgroundColor: theme.backgroundElement, color: theme.text },
            ]}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <SymbolView name="xmark.circle.fill" size={18} tintColor={theme.muted} />
            </Pressable>
          )}
        </View>
      )}

      <PillSelector options={FILTER_OPTIONS} value={filter} onChange={setFilter} />

      {!searchOpen && expiringSoon.length > 0 && (
        <Section title="Expiring soon">
          <Card>
            {expiringSoon.map((item) => (
              <InventoryRow key={item.id} item={item} onPress={() => setSheetTarget(item)} />
            ))}
          </Card>
        </Section>
      )}

      {!searchOpen && lowStock.length > 0 && (
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
          isSearching ? (
            <EmptyState title="No items found" subtitle="Try a different search" />
          ) : (
            <EmptyState title="Nothing here yet" subtitle="Add an item to get started" />
          )
        ) : (
          <Card>
            {filteredItems.map((item) => (
              <InventoryRow key={item.id} item={item} onPress={() => setSheetTarget(item)} />
            ))}
          </Card>
        )}
      </Section>

      {!searchOpen && (
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
      )}

      {!searchOpen && outCount > 0 && (
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
  },
  searchToggle: {
    padding: Spacing.one,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  searchInput: {
    flex: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
