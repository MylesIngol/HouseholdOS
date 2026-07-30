import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PillSelector } from '@/components/ui/pill-selector';
import { Row } from '@/components/ui/row';
import { Radii, Spacing } from '@/constants/theme';
import {
  usePurchaseGroceryItem,
  useRemoveGroceryItem,
  useUpdateGroceryItem,
} from '@/features/kitchen/queries';
import type { GroceryListEntry, StorageLocation } from '@/features/kitchen/types';
import { useTheme } from '@/hooks/use-theme';

const LOCATION_OPTIONS: { value: StorageLocation; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'pantry', label: 'Pantry' },
];

type GroceryRowProps = {
  entry: GroceryListEntry;
};

export function GroceryRow({ entry }: GroceryRowProps) {
  const theme = useTheme();
  const [pickingLocation, setPickingLocation] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(entry.name);
  const purchaseGroceryItem = usePurchaseGroceryItem();
  const removeGroceryItem = useRemoveGroceryItem();
  const updateGroceryItem = useUpdateGroceryItem();

  function handlePurchasePress() {
    // Linked entries already know where they belong — restock instantly.
    // Unlinked (manually typed) entries need a quick location pick first.
    if (entry.inventoryItemId) {
      purchaseGroceryItem.mutate({ groceryItemId: entry.id });
    } else {
      setEditing(false);
      setPickingLocation((current) => !current);
    }
  }

  function handleStartEdit() {
    setPickingLocation(false);
    setDraftName(entry.name);
    setEditing(true);
  }

  function handleSaveEdit() {
    if (!draftName.trim()) return;
    updateGroceryItem.mutate({ id: entry.id, name: draftName });
    setEditing(false);
  }

  function handleConfirmLocation(location: StorageLocation) {
    purchaseGroceryItem.mutate({ groceryItemId: entry.id, location });
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
            <Pressable onPress={handleStartEdit} hitSlop={8}>
              <ThemedText type="small" themeColor="muted">
                Edit
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => removeGroceryItem.mutate(entry.id)} hitSlop={8}>
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
      {editing && (
        <View style={styles.editRow}>
          <TextInput
            value={draftName}
            onChangeText={setDraftName}
            autoFocus
            onSubmitEditing={handleSaveEdit}
            returnKeyType="done"
            style={[
              styles.editInput,
              { backgroundColor: theme.backgroundElement, color: theme.text },
            ]}
          />
          <Pressable onPress={() => setEditing(false)} hitSlop={8}>
            <ThemedText type="small" themeColor="muted">
              Cancel
            </ThemedText>
          </Pressable>
          <Pressable onPress={handleSaveEdit} hitSlop={8}>
            <ThemedText type="linkPrimary">Save</ThemedText>
          </Pressable>
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
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  editInput: {
    flex: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
