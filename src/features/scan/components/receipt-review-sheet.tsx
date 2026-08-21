import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { PillSelector } from '@/components/ui/pill-selector';
import { PrimaryButton } from '@/components/ui/primary-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { HouseholdMember } from '@/features/household/types';
import type { ConfirmReceiptResult } from '@/features/scan/api';
import { useConfirmReceipt } from '@/features/scan/queries';
import { useTheme } from '@/hooks/use-theme';

import { reconcileReviewSession, type ReviewItem } from '../receipt-review-session';
import type { Receipt } from '../receipt-validator';
import { ReceiptItemRow } from './receipt-item-row';

type ReceiptReviewSheetProps = {
  visible: boolean;
  receiptImportId: string | undefined;
  receipt: Receipt | undefined;
  items: ReviewItem[];
  onChangeItem: (id: string, patch: Partial<ReviewItem>) => void;
  onRemoveItem: (id: string) => void;
  payerId: string | undefined;
  onChangePayerId: (id: string) => void;
  members: HouseholdMember[];
  /** Fired the moment confirmation succeeds — lets the caller reset any state referring to the pre-confirmation receipt (e.g. scan-screen's success card) immediately, independent of when the user actually dismisses this sheet's own success view. */
  onConfirmed?: () => void;
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
// Checkpoint H: Confirm calls confirm_receipt (a plain RPC, not an Edge
// Function) and recomputes every cent server-side from the reviewed items —
// this component never sends a pre-computed share, only names/prices/
// assignments (see api.ts's confirmReceipt / the confirm_receipt migration).
// A confirmState machine (mirrors receiptFlow in scan-screen.tsx) replaces
// the old placeholder confirmNote: 'idle' | 'confirming' | 'success' |
// 'error', full-replacement transitions, so a stale result can never bleed
// into the next attempt and nothing depends on this sheet unmounting to
// reset. On success the body/footer swap for a compact success view — no
// auto-navigation into Money or Kitchen (adjustment 9); Done just closes
// this sheet via onClose, same as Cancel.
// -----------------------------------------------------------------------------

type ConfirmState =
  | { phase: 'idle' }
  | { phase: 'confirming' }
  | { phase: 'success'; result: ConfirmReceiptResult }
  | { phase: 'error'; message: string };

const CONFIRM_IDLE: ConfirmState = { phase: 'idle' };

export function ReceiptReviewSheet({
  visible,
  receiptImportId,
  receipt,
  items,
  onChangeItem,
  onRemoveItem,
  payerId,
  onChangePayerId,
  members,
  onConfirmed,
  onClose,
}: ReceiptReviewSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [confirmState, setConfirmState] = useState<ConfirmState>(CONFIRM_IDLE);
  const confirmReceiptMutation = useConfirmReceipt();

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

  async function handleConfirmPress() {
    if (!receiptImportId || !payerId) return;
    setConfirmState({ phase: 'confirming' });
    try {
      const result = await confirmReceiptMutation.mutateAsync({ receiptImportId, payerMemberId: payerId, items });
      setConfirmState({ phase: 'success', result });
      onConfirmed?.();
    } catch (error) {
      setConfirmState({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Could not confirm that receipt.',
      });
    }
  }

  function handleDone() {
    setConfirmState(CONFIRM_IDLE);
    onClose();
  }

  if (confirmState.phase === 'success') {
    const { result } = confirmState;
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" transparent={false}>
        <ThemedView style={styles.flexFill}>
          <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
            <View style={styles.headerSide} />
            <ThemedText type="smallBold" numberOfLines={1} style={styles.headerTitle}>
              Review Receipt
            </ThemedText>
            <View style={styles.headerSide} />
          </View>
          <View style={styles.successBody}>
            <SymbolView name="checkmark.circle.fill" size={40} tintColor={theme.success} />
            <ThemedText type="title" style={styles.successTitle}>
              Receipt added
            </ThemedText>
            <ThemedText type="default" themeColor="muted" style={styles.successDetail}>
              ${(result.totalCents / 100).toFixed(2)} split between {result.memberShares.length}{' '}
              {result.memberShares.length === 1 ? 'person' : 'people'}
            </ThemedText>
            {result.kitchenItemsAdded > 0 && (
              <ThemedText type="default" themeColor="muted" style={styles.successDetail}>
                {result.kitchenItemsAdded} item{result.kitchenItemsAdded === 1 ? '' : 's'} added to Kitchen
              </ThemedText>
            )}
          </View>
          <View
            style={[
              styles.footer,
              { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.three },
            ]}
          >
            <PrimaryButton label="Done" onPress={handleDone} />
          </View>
        </ThemedView>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      transparent={false}
      onRequestClose={onClose}
      onShow={() => setConfirmState(CONFIRM_IDLE)}
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
            label={
              confirmState.phase === 'confirming'
                ? 'Confirming…'
                : `Confirm Receipt — $${(receipt.totalCents / 100).toFixed(2)}`
            }
            icon={confirmState.phase === 'confirming' ? <ActivityIndicator color={theme.onAccent} /> : undefined}
            onPress={handleConfirmPress}
            disabled={!reconciliation.isReconciled || confirmState.phase === 'confirming' || !payerId}
          />

          {confirmState.phase === 'error' && (
            <ThemedText type="small" themeColor="danger" style={styles.confirmNote}>
              {confirmState.message}
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
  successBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.six,
  },
  successTitle: {
    marginTop: Spacing.two,
  },
  successDetail: {
    textAlign: 'center',
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
