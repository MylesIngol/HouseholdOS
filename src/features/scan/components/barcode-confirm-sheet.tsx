import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FullScreenForm } from '@/components/ui/full-screen-form';
import { PillSelector } from '@/components/ui/pill-selector';
import { Radii, Spacing } from '@/constants/theme';
import { useAddItem } from '@/features/kitchen/queries';
import type { ItemCategory, StorageLocation } from '@/features/kitchen/types';
import { useLookupBarcode } from '@/features/scan/queries';
import { useTheme } from '@/hooks/use-theme';

type BarcodeConfirmSheetProps = {
  visible: boolean;
  /** The just-scanned code. Looked up automatically as soon as the sheet opens. */
  barcode: string | undefined;
  onClose: () => void;
};

const LOCATION_OPTIONS: { value: StorageLocation; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'pantry', label: 'Pantry' },
];

const CATEGORY_OPTIONS: { value: ItemCategory; label: string }[] = [
  { value: 'produce', label: 'Produce' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'meat', label: 'Meat' },
  { value: 'grains', label: 'Grains' },
  { value: 'canned', label: 'Canned' },
  { value: 'condiments', label: 'Condiments' },
  { value: 'beverages', label: 'Beverages' },
  { value: 'snacks', label: 'Snacks' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'other', label: 'Other' },
];

const KNOWN_CATEGORIES = new Set<string>(CATEGORY_OPTIONS.map((option) => option.value));

// -----------------------------------------------------------------------------
// Compact sibling of Kitchen's ItemSheet (plan section 12) — one screen,
// prefilled when lookup-barcode's provider chain finds something, empty and
// ready for manual entry when it doesn't. Household "remembered" defaults
// (checkpoint C) aren't wired in yet; this checkpoint is cache/external-
// lookup only. Reuses Kitchen's existing useAddItem mutation — no new write
// path, just a new caller, exactly as kitchen/types.ts anticipated.
// -----------------------------------------------------------------------------

export function BarcodeConfirmSheet({ visible, barcode, onClose }: BarcodeConfirmSheetProps) {
  const theme = useTheme();
  const addItemMutation = useAddItem();
  const lookupMutation = useLookupBarcode();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('other');
  const [location, setLocation] = useState<StorageLocation | undefined>(undefined);
  const [lookupError, setLookupError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!visible || !barcode) return;
    setName('');
    setCategory('other');
    setLocation(undefined);
    setLookupError(undefined);

    lookupMutation.mutate(barcode, {
      onSuccess: (product) => {
        if (!product) return;
        setName(product.name);
        if (product.category && KNOWN_CATEGORIES.has(product.category)) {
          setCategory(product.category as ItemCategory);
        }
      },
      onError: (error) => {
        setLookupError(
          error instanceof Error ? error.message : 'Could not look up that barcode.',
        );
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, barcode]);

  const canSave = name.trim().length > 0 && !!location;

  function handleSave() {
    if (!location || !barcode) return;
    addItemMutation.mutate({
      name: name.trim(),
      category,
      location,
      barcode,
    });
    onClose();
  }

  const isLookingUp = lookupMutation.isPending;
  const wasUnknown = lookupMutation.isSuccess && !lookupMutation.data;

  return (
    <FullScreenForm
      visible={visible}
      onClose={onClose}
      title="Add Scanned Item"
      onSave={canSave ? handleSave : undefined}
      saveLabel="Add"
      saveDisabled={!canSave}
    >
      {isLookingUp && (
        <View style={styles.lookupRow}>
          <ActivityIndicator color={theme.accent} />
          <ThemedText type="small" themeColor="muted">
            Looking up this barcode…
          </ThemedText>
        </View>
      )}

      {!isLookingUp && wasUnknown && (
        <ThemedText type="small" themeColor="muted">
          We don&apos;t recognize this barcode yet — enter the details and we&apos;ll remember it
          next time.
        </ThemedText>
      )}

      {!isLookingUp && lookupError && (
        <ThemedText type="small" themeColor="muted">
          {lookupError} You can still add this item manually.
        </ThemedText>
      )}

      <View style={styles.field}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Item name"
          placeholderTextColor={theme.muted}
          style={[
            styles.nameInput,
            { backgroundColor: theme.backgroundElement, color: theme.text },
          ]}
        />
      </View>

      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          Category
        </ThemedText>
        <PillSelector options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
      </View>

      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          Location
        </ThemedText>
        <PillSelector options={LOCATION_OPTIONS} value={location} onChange={setLocation} />
      </View>
    </FullScreenForm>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  nameInput: {
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  lookupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
