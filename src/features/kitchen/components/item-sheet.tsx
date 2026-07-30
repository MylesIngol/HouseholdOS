import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FullScreenForm } from '@/components/ui/full-screen-form';
import { PillSelector } from '@/components/ui/pill-selector';
import { Radii, Spacing } from '@/constants/theme';
import { addDaysIso, formatExpirationLabel } from '@/features/kitchen/expiration';
import {
  useAddInventoryItemToGrocery,
  useAddItem,
  useDeleteItem,
  useUpdateItem,
} from '@/features/kitchen/queries';
import type {
  ExpirationInfo,
  InventoryItem,
  InventoryStatus,
  Ownership,
  StorageLocation,
} from '@/features/kitchen/types';
import { useHouseholdMembers, useMyHousehold } from '@/features/household/queries';
import { useTheme } from '@/hooks/use-theme';

type ItemSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Omit to open the sheet in "add" mode. */
  item?: InventoryItem;
};

const LOCATION_OPTIONS: { value: StorageLocation; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'pantry', label: 'Pantry' },
];

const STATUS_OPTIONS: { value: InventoryStatus; label: string }[] = [
  { value: 'in_stock', label: 'In Stock' },
  { value: 'low', label: 'Low' },
  { value: 'out', label: 'Out' },
];

const OWNERSHIP_OPTIONS: { value: Ownership; label: string }[] = [
  { value: 'shared', label: 'Shared' },
  { value: 'personal', label: 'Personal' },
];

type ExpirationOptionValue = 'none' | 'today' | 'tomorrow' | '3days' | '1week';

const EXPIRATION_OPTIONS: { value: ExpirationOptionValue; label: string; days: number | null }[] = [
  { value: 'none', label: 'None', days: null },
  { value: 'today', label: 'Today', days: 0 },
  { value: 'tomorrow', label: 'Tomorrow', days: 1 },
  { value: '3days', label: '3 days', days: 3 },
  { value: '1week', label: '1 week', days: 7 },
];

export function ItemSheet({ visible, onClose, item }: ItemSheetProps) {
  const theme = useTheme();
  const { data: household } = useMyHousehold();
  const { data: householdMembers = [] } = useHouseholdMembers(household?.id);
  const addItemMutation = useAddItem();
  const updateItemMutation = useUpdateItem();
  const addToGroceryMutation = useAddInventoryItemToGrocery();
  const deleteItemMutation = useDeleteItem();

  const isEditMode = !!item;

  const [name, setName] = useState('');
  const [location, setLocation] = useState<StorageLocation | undefined>(undefined);
  const [status, setStatus] = useState<InventoryStatus>('in_stock');
  const [quantity, setQuantity] = useState<number | undefined>(undefined);
  const [expiration, setExpiration] = useState<ExpirationInfo | undefined>(undefined);
  const [expirationOption, setExpirationOption] = useState<ExpirationOptionValue | undefined>(
    undefined,
  );
  const [customDate, setCustomDate] = useState('');
  const [ownership, setOwnership] = useState<Ownership>('shared');
  const [ownerId, setOwnerId] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(item?.name ?? '');
    setLocation(item?.location);
    setStatus(item?.status ?? 'in_stock');
    setQuantity(item?.quantity);
    setExpiration(item?.expiration);
    setExpirationOption(undefined);
    setCustomDate('');
    setOwnership(item?.ownership ?? 'shared');
    setOwnerId(item?.ownerId);
    setNotes(item?.notes ?? '');
    setDetailsExpanded(false);
    setDeleteConfirmOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, item?.id]);

  function handleStatusChange(next: InventoryStatus) {
    setStatus(next);
    if (item) {
      updateItemMutation.mutate({ id: item.id, patch: { status: next } });
    }
  }

  // Quick relative picks (Today, Tomorrow, 3 days, 1 week) are guesses, not a
  // date the user actually looked up — always stored as 'estimated'.
  function handleExpirationPick(option: (typeof EXPIRATION_OPTIONS)[number]) {
    setExpirationOption(option.value);
    setCustomDate('');
    if (option.days === null) {
      setExpiration(undefined);
    } else {
      setExpiration({ date: addDaysIso(option.days), confidence: 'estimated' });
    }
  }

  const isValidCustomDate = /^\d{4}-\d{2}-\d{2}$/.test(customDate.trim());

  // A specific calendar date the user typed in is treated as known, not
  // guessed — stored as 'exact', same confidence a future scanned/label-read
  // date would carry.
  function handleCustomDateApply() {
    const trimmed = customDate.trim();
    if (!isValidCustomDate) return;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return;

    setExpirationOption(undefined);
    setExpiration({ date: trimmed, confidence: 'exact' });
  }

  function handleOwnershipChange(next: Ownership) {
    setOwnership(next);
    if (next === 'shared') setOwnerId(undefined);
  }

  function handleAddToGrocery() {
    if (!item) return;
    addToGroceryMutation.mutate(item.id);
    onClose();
  }

  function handleDelete() {
    if (!item) return;
    deleteItemMutation.mutate(item.id);
    onClose();
  }

  const canSave = name.trim().length > 0 && !!location;

  function handleSave() {
    if (!location) return;
    const trimmedName = name.trim();
    const trimmedNotes = notes.trim();

    if (isEditMode && item) {
      updateItemMutation.mutate({
        id: item.id,
        patch: {
          name: trimmedName,
          location,
          status,
          quantity,
          expiration,
          ownership,
          ownerId: ownership === 'personal' ? ownerId : undefined,
          notes: trimmedNotes || undefined,
        },
      });
    } else {
      addItemMutation.mutate({
        name: trimmedName,
        location,
        status,
        quantity,
        expiration,
        ownership,
        ownerId: ownership === 'personal' ? ownerId : undefined,
        notes: trimmedNotes || undefined,
      });
    }
    onClose();
  }

  const showDetails = isEditMode || detailsExpanded;

  return (
    <FullScreenForm
      visible={visible}
      onClose={onClose}
      title={isEditMode ? 'Edit Item' : 'Add Item'}
      onSave={canSave ? handleSave : undefined}
      saveLabel={isEditMode ? 'Save' : 'Add'}
      saveDisabled={!canSave}
    >
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

      {isEditMode && (
        <View style={styles.field}>
          <ThemedText type="label" themeColor="muted">
            Status
          </ThemedText>
          <PillSelector options={STATUS_OPTIONS} value={status} onChange={handleStatusChange} />
        </View>
      )}

      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          Location
        </ThemedText>
        <PillSelector options={LOCATION_OPTIONS} value={location} onChange={setLocation} />
      </View>

      {!isEditMode && !detailsExpanded && (
        <Pressable onPress={() => setDetailsExpanded(true)} hitSlop={8}>
          <ThemedText type="linkPrimary">More details</ThemedText>
        </Pressable>
      )}

      {showDetails && (
        <>
          <View style={styles.field}>
            <ThemedText type="label" themeColor="muted">
              Quantity
            </ThemedText>
            {quantity === undefined ? (
              <Pressable onPress={() => setQuantity(1)} hitSlop={8}>
                <ThemedText type="linkPrimary">+ Add quantity</ThemedText>
              </Pressable>
            ) : (
              <View style={styles.stepperRow}>
                <Pressable
                  onPress={() => setQuantity((current) => Math.max(0, (current ?? 1) - 1))}
                  style={[styles.stepperButton, { backgroundColor: theme.backgroundElement }]}
                >
                  <ThemedText type="smallBold">−</ThemedText>
                </Pressable>
                <ThemedText type="smallBold" style={styles.stepperValue}>
                  {quantity}
                </ThemedText>
                <Pressable
                  onPress={() => setQuantity((current) => (current ?? 0) + 1)}
                  style={[styles.stepperButton, { backgroundColor: theme.backgroundElement }]}
                >
                  <ThemedText type="smallBold">+</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => setQuantity(undefined)}
                  hitSlop={8}
                  style={styles.removeLink}
                >
                  <ThemedText type="small" themeColor="muted">
                    Remove
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.field}>
            <ThemedText type="label" themeColor="muted">
              Expiration
            </ThemedText>
            {expiration && (
              <ThemedText type="small" themeColor="textSecondary">
                {formatExpirationLabel(expiration)}
              </ThemedText>
            )}
            <PillSelector
              options={EXPIRATION_OPTIONS}
              value={expirationOption}
              onChange={(value) =>
                handleExpirationPick(EXPIRATION_OPTIONS.find((o) => o.value === value)!)
              }
            />
            <View style={styles.customDateRow}>
              <TextInput
                value={customDate}
                onChangeText={setCustomDate}
                placeholder="Or enter exact date (YYYY-MM-DD)"
                placeholderTextColor={theme.muted}
                style={[
                  styles.customDateInput,
                  { backgroundColor: theme.backgroundElement, color: theme.text },
                ]}
              />
              <Pressable onPress={handleCustomDateApply} hitSlop={8} disabled={!isValidCustomDate}>
                <ThemedText
                  type="linkPrimary"
                  style={isValidCustomDate ? undefined : styles.customDateApplyDisabled}
                >
                  Set
                </ThemedText>
              </Pressable>
            </View>
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

          <View style={styles.field}>
            <ThemedText type="label" themeColor="muted">
              Notes
            </ThemedText>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional"
              placeholderTextColor={theme.muted}
              multiline
              style={[
                styles.notesInput,
                { backgroundColor: theme.backgroundElement, color: theme.text },
              ]}
            />
          </View>
        </>
      )}

      {isEditMode && (
        <Pressable onPress={handleAddToGrocery} hitSlop={8}>
          <ThemedText type="linkPrimary">Add to Grocery List</ThemedText>
        </Pressable>
      )}

      {isEditMode &&
        (!deleteConfirmOpen ? (
          <Pressable onPress={() => setDeleteConfirmOpen(true)} hitSlop={8}>
            <ThemedText type="linkPrimary" style={{ color: theme.danger }}>
              Delete Item
            </ThemedText>
          </Pressable>
        ) : (
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Delete this item permanently? This can&apos;t be undone — Mark Out is the reversible
              option if you just want to note it&apos;s gone for now.
            </ThemedText>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setDeleteConfirmOpen(false)} hitSlop={8}>
                <ThemedText type="small" themeColor="muted">
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable onPress={handleDelete} hitSlop={8}>
                <ThemedText type="linkPrimary" style={{ color: theme.danger }}>
                  Delete
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ))}
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
  notesInput: {
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 24,
    textAlign: 'center',
  },
  removeLink: {
    marginLeft: Spacing.two,
  },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  customDateInput: {
    flex: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  customDateApplyDisabled: {
    opacity: 0.4,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
});
