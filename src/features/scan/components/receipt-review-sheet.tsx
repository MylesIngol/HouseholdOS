import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { PillSelector } from '@/components/ui/pill-selector';
import { PrimaryButton } from '@/components/ui/primary-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { HouseholdMember } from '@/features/household/types';
import { useTheme } from '@/hooks/use-theme';

import { reconcileReviewSession, type ReviewItem } from '../receipt-review-session';
import type { Receipt } from '../receipt-validator';
import { ReceiptItemRow } from './receipt-item-row';

type ReceiptReviewSheetProps = {
  visible: boolean;
  receipt: Receipt | undefined;
  items: ReviewItem[];
  onChangeItem: (id: string, patch: Partial<ReviewItem>) => void;
  onRemoveItem: (id: string) => void;
  payerId: string | undefined;
  onChangePayerId: (id: string) => void;
  members: HouseholdMember[];
  onClose: () => void;
};

// -----------------------------------------------------------------------------
// Milestone 7 — Checkpoint G: the Receipt Review screen (plan section 13).
// New component, not FullScreenForm — a dynamic per-item list plus a sticky
// footer doesn't fit FullScreenForm's single-title/single-save API, but the
// header mirrors its chrome (Cancel top-left, title center) for visual
// consistency with every other full-screen form in the app.
//
// Fully controlled: every piece of editable state (items, payer) lives in
// the caller (scan-screen.tsx), not here. That's what makes "preserve
// parsed receipt state if the user leaves and returns" free — scan-screen
// already stays mounted across tab switches (same reason receiptFlow and
// barcodeNote already survive them), so lifting this sheet's state up into
// it costs nothing extra and needs no new persistence layer.
//
// reconcileReviewSession (-> receipt-math.ts's reconcileReceiptShares) is
// the ONLY source of truth for member totals/reconciliation, per explicit
// instruction — this component never computes a share or a total itself.
//
// Confirm is NOT wired to any write yet (checkpoint H, not yet approved) —
// tapping it while enabled just surfaces a note saying so, the same
// "not built yet" placeholder pattern checkpoint D used for receipt
// processing before checkpoint E existed.
// -----------------------------------------------------------------------------

export function ReceiptReviewSheet({
  visible,
  receipt,
  items,
  onChangeItem,
  onRemoveItem,
  payerId,
  onChangePayerId,
  members,
  onClose,
}: ReceiptReviewSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [confirmNote, setConfirmNote] = useState<string | undefined>(undefined);

  const reconciliation = useMemo(() => {
    if (!receipt) return undefined;
    return reconcileReviewSession(receipt, items);
  }, [receipt, items]);

  if (!receipt || !reconciliation) return null;

  const formattedDate = receipt.purchaseDate
    ? new Date(`${receipt.purchaseDate}T00:00:00Z`).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : undefined;

  function handleConfirmPress() {
    setConfirmNote("Confirming isn't built yet — that's the next checkpoint.");
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      transparent={false}
      onRequestClose={onClose}
    >
      <ThemedView style={styles.flexFill}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.headerSide}>
            <ThemedText type="linkPrimary">Cancel</ThemedText>
          </Pressable>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.headerTitle}>
            Review Receipt
          </ThemedText>
          <View style={styles.headerSide} />
        </View>

        <ScrollView
          style={styles.flexFill}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.inner}>
            <Card>
              <ThemedText type="smallBold" style={styles.merchantName}>
                {receipt.merchantName ?? 'Receipt'}
              </ThemedText>
              {formattedDate && (
                <ThemedText type="small" themeColor="muted">
                  {formattedDate}
                </ThemedText>
              )}
              <ThemedText type="small" themeColor="muted">
                Total ${(receipt.totalCents / 100).toFixed(2)}
              </ThemedText>
            </Card>

            <View style={styles.field}>
              <ThemedText type="label" themeColor="muted">
                Paid by
              </ThemedText>
              <PillSelector
                options={members.map((member) => ({
                  value: member.id,
                  label: member.isCurrentUser ? 'You' : member.name,
                }))}
                value={payerId}
                onChange={onChangePayerId}
              />
            </View>

            <View style={styles.field}>
              <ThemedText type="label" themeColor="muted">
                {items.length} item{items.length === 1 ? '' : 's'}
              </ThemedText>
              <View style={styles.itemList}>
                {items.map((item) => (
                  <ReceiptItemRow
                    key={item.id}
                    item={item}
                    members={members}
                    onChange={(patch) => onChangeItem(item.id, patch)}
                    onRemove={() => onRemoveItem(item.id)}
                  />
                ))}
                {items.length === 0 && (
                  <ThemedText type="small" themeColor="muted">
                    No items left — every line was removed.
                  </ThemedText>
                )}
              </View>
            </View>
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.three },
          ]}
        >
          <View style={styles.reconcileRow}>
            <SymbolView
              name={reconciliation.isReconciled ? 'checkmark.circle.fill' : 'exclamationmark.circle.fill'}
              size={18}
              tintColor={reconciliation.isReconciled ? theme.success : theme.warning}
            />
            <ThemedText
              type="small"
              style={{ color: reconciliation.isReconciled ? theme.success : theme.warning, flex: 1 }}
            >
              {reconciliation.isReconciled ? 'Reconciles' : reconciliation.warnings[0]}
            </ThemedText>
          </View>

          <PrimaryButton
            label={`Confirm Receipt — $${(receipt.totalCents / 100).toFixed(2)}`}
            onPress={handleConfirmPress}
            disabled={!reconciliation.isReconciled}
          />

          {confirmNote && (
            <ThemedText type="small" themeColor="muted" style={styles.confirmNote}>
              {confirmNote}
            </ThemedText>
          )}
        </View>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flexFill: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  headerSide: {
    flex: 1,
  },
  headerTitle: {
    flex: 2,
    textAlign: 'center',
  },
  scrollContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexGrow: 1,
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  merchantName: {
    fontSize: 18,
  },
  field: {
    gap: Spacing.two,
  },
  itemList: {
    gap: Spacing.two,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  reconcileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  confirmNote: {
    textAlign: 'center',
  },
});
