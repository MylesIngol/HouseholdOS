import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Row } from '@/components/ui/row';
import { Spacing } from '@/constants/theme';
import { PillSelector } from '@/features/kitchen/components/pill-selector';
import { useKitchenStore } from '@/features/kitchen/store';
import type { GroceryListEntry, StorageLocation } from '@/features/kitchen/types';

const LOCATION_OPTIONS: { value: StorageLocation; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'pantry', label: 'Pantry' },
];

type GroceryRowProps = {
  entry: GroceryListEntry;
};

export function GroceryRow({ entry }: GroceryRowProps) {
  const [pickingLocation, setPickingLocation] = useState(false);
  const purchaseGroceryItem = useKitchenStore((state) => state.purchaseGroceryItem);
  const removeGroceryItem = useKitchenStore((state) => state.removeGroceryItem);

  function handlePurchasePress() {
    // Linked entries already know where they belong — restock instantly.
    // Unlinked (manually typed) entries need a quick location pick first.
    if (entry.inventoryItemId) {
      purchaseGroceryItem(entry.id);
    } else {
      setPickingLocation((current) => !current);
    }
  }

  function handleConfirmLocation(location: StorageLocation) {
    purchaseGroceryItem(entry.id, location);
    setPickingLocation(false);
  }

  return (
    <View>
      <Row
        title={entry.name}
        trailing={
          <View style={styles.actions}>
            <Pressable onPress={handlePurchasePress} hitSlop={8}>
              <ThemedText type="linkPrimary">Got it</ThemedText>
            </Pressable>
            <Pressable onPress={() => removeGroceryItem(entry.id)} hitSlop={8}>
              <ThemedText type="small" themeColor="muted">
                Remove
              </ThemedText>
            </Pressable>
          </View>
        }
      />
      {pickingLocation && (
        <View style={styles.locationPicker}>
          <ThemedText type="small" themeColor="textSecondary">
            Where does this go?
          </ThemedText>
          <PillSelector
            options={LOCATION_OPTIONS}
            value={undefined}
            onChange={handleConfirmLocation}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  locationPicker: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
});
