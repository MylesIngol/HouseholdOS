import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { getMemberInitials } from '@/features/household/display';
import type { HouseholdMember } from '@/features/household/types';
import { centsToDollarsInput, dollarsToCents } from '@/features/money/money-math';
import { useTheme } from '@/hooks/use-theme';

import type { ReviewItem } from '../receipt-review-session';

type ReceiptItemRowProps = {
  item: ReviewItem;
  members: HouseholdMember[];
  onChange: (patch: Partial<ReviewItem>) => void;
  onRemove: () => void;
};

/**
 * One parsed receipt line: rename, price correction, member-assignment
 * chips (+ "Everyone" shortcut), an Add to Kitchen toggle, and a remove
 * action. Deliberately compact — a 20-line receipt means 20 of these, so
 * this stays visually calm rather than a full card-per-item treatment (plan
 * requirement: calm even with many lines).
 *
 * The price field mirrors ExpenseSheet's amount-field convention: local text
 * state is the source of truth while typing, parsed via money-math.ts's
 * dollarsToCents and only pushed up to the review session once it's a valid
 * amount — an in-progress "12." never corrupts the reconciliation math with
 * a bad intermediate value.
 */
export function ReceiptItemRow({ item, members, onChange, onRemove }: ReceiptItemRowProps) {
  const theme = useTheme();
  const [priceText, setPriceText] = useState(centsToDollarsInput(item.totalPriceCents));

  // Keeps the field in sync if the item's price changes from outside this
  // row (there's no such caller today, but this is what makes the field
  // correct-by-construction rather than correct-by-coincidence).
  useEffect(() => {
    setPriceText(centsToDollarsInput(item.totalPriceCents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.totalPriceCents]);

  function handlePriceChange(text: string) {
    setPriceText(text);
    const parsed = dollarsToCents(text);
    if (parsed !== undefined) onChange({ totalPriceCents: parsed });
  }

  const allSelected = members.length > 0 && members.every((m) => item.assignedMemberIds.includes(m.id));

  function toggleEveryone() {
    onChange({ assignedMemberIds: allSelected ? [] : members.map((m) => m.id) });
  }

  function toggleMember(memberId: string) {
    const isSelected = item.assignedMemberIds.includes(memberId);
    onChange({
      assignedMemberIds: isSelected
        ? item.assignedMemberIds.filter((id) => id !== memberId)
        : [...item.assignedMemberIds, memberId],
    });
  }

  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.topLine}>
        <TextInput
          value={item.cleanedName}
          onChangeText={(text) => onChange({ cleanedName: text })}
          style={[styles.nameInput, { color: theme.text }]}
          placeholder="Item name"
          placeholderTextColor={theme.muted}
        />
        <View style={styles.priceGroup}>
          <ThemedText type="small" themeColor="muted">
            $
          </ThemedText>
          <TextInput
            value={priceText}
            onChangeText={handlePriceChange}
            keyboardType="decimal-pad"
            style={[styles.priceInput, { color: theme.text }]}
          />
        </View>
        <Pressable onPress={onRemove} hitSlop={8}>
          <SymbolView name="xmark.circle.fill" size={18} tintColor={theme.muted} />
        </Pressable>
      </View>

      <View style={styles.chipRow}>
        <Pressable
          onPress={toggleEveryone}
          style={[styles.chip, { backgroundColor: allSelected ? theme.accent : theme.background }]}
        >
          <ThemedText
            type="small"
            style={{ color: allSelected ? theme.onAccent : theme.textSecondary }}
          >
            Everyone
          </ThemedText>
        </Pressable>
        {members.map((member) => {
          const selected = item.assignedMemberIds.includes(member.id);
          return (
            <Pressable
              key={member.id}
              onPress={() => toggleMember(member.id)}
              style={[styles.initialsChip, { backgroundColor: selected ? theme.accent : theme.background }]}
            >
              <ThemedText
                type="small"
                style={{ color: selected ? theme.onAccent : theme.textSecondary }}
              >
                {getMemberInitials(member)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => onChange({ addToKitchen: !item.addToKitchen })}
        style={[
          styles.kitchenToggle,
          { backgroundColor: item.addToKitchen ? theme.accentSurface : 'transparent' },
        ]}
      >
        <SymbolView
          name={item.addToKitchen ? 'checkmark.square.fill' : 'square'}
          size={16}
          tintColor={item.addToKitchen ? theme.accent : theme.muted}
        />
        <ThemedText type="small" themeColor={item.addToKitchen ? undefined : 'muted'}>
          Add to Kitchen
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: Radii.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  nameInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: Spacing.one,
  },
  priceGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceInput: {
    fontSize: 15,
    fontWeight: '600',
    minWidth: 48,
    textAlign: 'right',
    paddingVertical: Spacing.one,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.full,
  },
  initialsChip: {
    width: 30,
    height: 30,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kitchenToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.small,
  },
});
