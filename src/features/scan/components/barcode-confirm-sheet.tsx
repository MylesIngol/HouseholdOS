import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FullScreenForm } from '@/components/ui/full-screen-form';
import { PillSelector } from '@/components/ui/pill-selector';
import { Radii, Spacing } from '@/constants/theme';
import { useHouseholdMembers, useMyHousehold } from '@/features/household/queries';
import { useAddItem } from '@/features/kitchen/queries';
import type { ItemCategory, Ownership, StorageLocation } from '@/features/kitchen/types';
import { useScanBarcode, useUpsertProductMemory } from '@/features/scan/queries';
import { useTheme } from '@/hooks/use-theme';

type BarcodeConfirmSheetProps = {
  visible: boolean;
  /** The just-scanned code. Looked up automatically as soon as the sheet opens. */
  barcode: string | undefined;
  onClose: () => void;
  /**
   * Fired after a fully successful Add (item created; `note` is set only in
   * the soft partial-failure case — item created but the "remember for
   * next time" write failed — never for a hard failure, which keeps the
   * sheet open with an inline error instead of calling this at all).
   */
  onSaved?: (note?: string) => void;
};

// Duck-typed the same way as item-sheet.tsx's local helper — PostgrestError
// isn't an Error instance, so `instanceof Error` isn't reliable.
function getErrorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string' &&
    (error as { message: string }).message
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

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

const OWNERSHIP_OPTIONS: { value: Ownership; label: string }[] = [
  { value: 'shared', label: 'Shared' },
  { value: 'personal', label: 'Personal' },
];

const KNOWN_CATEGORIES = new Set<string>(CATEGORY_OPTIONS.map((option) => option.value));

// -----------------------------------------------------------------------------
// Compact sibling of Kitchen's ItemSheet (plan section 12) — one screen,
// prefilled name/category/location/ownership in priority order: this
// household's own remembered choice (household_product_memory, checkpoint
// C) first, then the global products cache (checkpoint B), then empty for
// manual entry. Reuses Kitchen's existing useAddItem mutation for the
// actual write — no new inventory write path, just a new caller, exactly as
// kitchen/types.ts anticipated. Saving also upserts this household's memory
// so the next scan of the same barcode needs zero re-entry.
// -----------------------------------------------------------------------------

export function BarcodeConfirmSheet({ visible, barcode, onClose, onSaved }: BarcodeConfirmSheetProps) {
  const theme = useTheme();
  const { data: household } = useMyHousehold();
  const { data: householdMembers = [] } = useHouseholdMembers(household?.id);
  const addItemMutation = useAddItem();
  const scanMutation = useScanBarcode();
  const upsertMemoryMutation = useUpsertProductMemory();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('other');
  const [location, setLocation] = useState<StorageLocation | undefined>(undefined);
  const [ownership, setOwnership] = useState<Ownership>('shared');
  const [ownerId, setOwnerId] = useState<string | undefined>(undefined);
  const [lookupError, setLookupError] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!visible || !barcode || !household?.id) return;
    setName('');
    setCategory('other');
    setLocation(undefined);
    setOwnership('shared');
    setOwnerId(undefined);
    setLookupError(undefined);
    setSaveError(undefined);

    scanMutation.mutate(
      { householdId: household.id, barcode },
      {
        onSuccess: ({ product, memory, lookupFailed, memoryFailed }) => {
          // Global cache first (lower priority)...
          if (product) {
            setName(product.name);
            if (product.category && KNOWN_CATEGORIES.has(product.category)) {
              setCategory(product.category as ItemCategory);
            }
          }
          // ...then this household's own memory overrides it (plan section 1:
          // "prefer the household's previous choices"). Memory is checked
          // BEFORE the Edge Function is ever called (useScanBarcode) — if
          // memory hit, `product` above is always null and this is the only
          // source of prefill.
          if (memory) {
            setName(memory.preferredName);
            if (memory.category && KNOWN_CATEGORIES.has(memory.category)) {
              setCategory(memory.category as ItemCategory);
            }
            if (memory.storageLocation) setLocation(memory.storageLocation);
            setOwnership(memory.defaultOwnership);
            setOwnerId(memory.defaultOwnerId);
          }
          if (lookupFailed) {
            setLookupError('Could not look up that barcode — check your connection and try again.');
          } else if (memoryFailed) {
            setLookupError(
              "Could not check whether we've seen this barcode before, but you can still add it manually.",
            );
          }
        },
        onError: (error) => {
          setLookupError(getErrorMessage(error, 'Could not look up that barcode.'));
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, barcode, household?.id]);

  function handleOwnershipChange(next: Ownership) {
    setOwnership(next);
    if (next === 'shared') setOwnerId(undefined);
  }

  // Same guard as ItemSheet: a personal item with no owner picked would
  // otherwise reach Supabase and fail the DB's own check constraint.
  const canSave =
    name.trim().length > 0 && !!location && (ownership !== 'personal' || !!ownerId);
  const isSaving = addItemMutation.isPending || upsertMemoryMutation.isPending;

  async function handleSave() {
    if (!location || !barcode) return;
    const trimmedName = name.trim();
    const resolvedOwnerId = ownership === 'personal' ? ownerId : undefined;
    setSaveError(undefined);

    const itemPayload = {
      name: trimmedName,
      category,
      location,
      ownership,
      ownerId: resolvedOwnerId,
      barcode,
    };
    // TEMP DIAGNOSTIC (barcode workflow bug hunt) — remove once confirmed
    // working against the live project.
    if (__DEV__) console.log('[scan] manual fallback submit payload', itemPayload);

    // Primary write: the Kitchen inventory item. This is the part that must
    // succeed and must be visible if it fails — awaited, not fired and
    // forgotten, and the sheet stays open with the real error on failure
    // instead of closing regardless (the exact bug this replaces).
    try {
      const created = await addItemMutation.mutateAsync(itemPayload);
      if (__DEV__) console.log('[scan] Kitchen insert succeeded', created.id);
    } catch (error) {
      if (__DEV__) console.error('[scan] Kitchen insert failed', error);
      setSaveError(getErrorMessage(error, 'Could not add this item.'));
      return;
    }

    // Secondary write: remember this barcode for next time. The item is
    // already safely in Kitchen at this point, so a failure here is
    // deliberately non-blocking — but it is NOT silent: it's surfaced via
    // `onSaved`'s note after this sheet closes (there's no error banner left
    // to show it in once we're past the point of no return on the primary
    // write). Recovery is simple and automatic: the next scan of this same
    // barcode just won't find memory and will fall through to this same
    // manual/prefill flow again, which re-attempts this same upsert.
    let memoryNote: string | undefined;
    if (household?.id) {
      try {
        await upsertMemoryMutation.mutateAsync({
          householdId: household.id,
          input: {
            barcode,
            preferredName: trimmedName,
            category,
            storageLocation: location,
            defaultOwnership: ownership,
            defaultOwnerId: resolvedOwnerId,
          },
        });
        if (__DEV__) console.log('[scan] product memory upsert succeeded');
      } catch (error) {
        if (__DEV__) console.error('[scan] product memory upsert failed', error);
        memoryNote =
          "Added to Kitchen, but couldn't save it for next time — you'll need to re-enter it if you scan this barcode again.";
      }
    }

    onSaved?.(memoryNote);
    onClose();
  }

  const result = scanMutation.data;
  const isLookingUp = scanMutation.isPending;
  const wasUnknown = scanMutation.isSuccess && !result?.product && !result?.memory;
  const wasRemembered = !!result?.memory;

  return (
    <FullScreenForm
      visible={visible}
      onClose={onClose}
      title="Add Scanned Item"
      onSave={canSave ? handleSave : undefined}
      saveLabel="Add"
      saveDisabled={!canSave || isSaving}
    >
      {saveError && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {saveError}
        </ThemedText>
      )}

      {isLookingUp && (
        <View style={styles.lookupRow}>
          <ActivityIndicator color={theme.accent} />
          <ThemedText type="small" themeColor="muted">
            Looking up this barcode…
          </ThemedText>
        </View>
      )}

      {!isLookingUp && wasRemembered && (
        <ThemedText type="small" themeColor="muted">
          You&apos;ve added this before — filled in from last time.
        </ThemedText>
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

      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          Ownership
        </ThemedText>
        <PillSelector
          options={OWNERSHIP_OPTIONS}
          value={ownership}
          onChange={handleOwnershipChange}
        />
        {ownership === 'personal' && (
          <PillSelector
            options={householdMembers.map((member) => ({
              value: member.id,
              label: member.name,
            }))}
            value={ownerId}
            onChange={setOwnerId}
          />
        )}
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
