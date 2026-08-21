import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Screen } from '@/components/ui/screen';
import { Radii, Spacing } from '@/constants/theme';
import { useHouseholdMembers, useMyHousehold } from '@/features/household/queries';
import { BarcodeConfirmSheet } from '@/features/scan/components/barcode-confirm-sheet';
import { BarcodeScannerSheet } from '@/features/scan/components/barcode-scanner-sheet';
import { ReceiptCaptureSheet } from '@/features/scan/components/receipt-capture-sheet';
import { ReceiptReviewSheet } from '@/features/scan/components/receipt-review-sheet';
import { useProcessReceipt } from '@/features/scan/queries';
import type { CapturedReceiptImage } from '@/features/scan/receipt-image';
import { receiptToReviewItems, type ReviewItem } from '@/features/scan/receipt-review-session';
import type { Receipt } from '@/features/scan/receipt-validator';
import { useTheme } from '@/hooks/use-theme';

type ActiveSheet = 'none' | 'barcode' | 'receipt';

// -----------------------------------------------------------------------------
// A scanned barcode is checked against this household's own memory first,
// then (only on a miss) the lookup-barcode Edge Function's cache -> Open
// Food Facts -> UPCitemdb -> unknown chain, landing in a compact
// add-to-Kitchen confirmation sheet either way. `barcodeNote` doubles as the
// confirmation of a successful Add and the surfaced note for the rare case
// where the item saved but "remember for next time" didn't. This is
// deliberately a completely separate piece of state from the receipt flow
// below — the two scanners don't share UI or state, per the explicit
// instruction to leave barcode scanning untouched.
//
// Receipt capture+processing (checkpoint E) is `receiptFlow`: an explicit
// state machine, not a loose "last result string" — every transition fully
// replaces the previous state, so a stale result from one attempt can never
// bleed into the next, and nothing here depends on ReceiptCaptureSheet (or
// this screen) unmounting to reset anything. `lastImageRef` holds the most
// recently accepted (already-compressed) photo so Retry can resend it
// without re-opening the camera; it's a ref, not state, because it's pure
// bookkeeping for the next action, not something that should ever trigger a
// re-render on its own.
//
// Checkpoint G adds `reviewSession`: the editable Receipt Review state,
// auto-populated the moment process-receipt succeeds and opened immediately
// (one continuous scan -> review flow, same "no intermediate summary to
// dismiss" pattern the barcode flow already uses). It's held HERE, not
// inside ReceiptReviewSheet's own local state, specifically so it survives
// a tab switch away and back — this screen already stays mounted across tab
// changes (that's what already lets receiptFlow/barcodeNote survive them
// today), so lifting this up costs nothing extra and needs no new
// persistence layer, per the explicit "if the existing architecture
// supports that without unnecessary complexity" instruction.
// -----------------------------------------------------------------------------

type ReceiptFlowState =
  | { phase: 'idle' }
  | { phase: 'processing' }
  | { phase: 'success'; receipt: Receipt; receiptImportId: string }
  | { phase: 'error'; message: string };

const IDLE: ReceiptFlowState = { phase: 'idle' };

type ReviewSession = {
  receipt: Receipt;
  receiptImportId: string;
  items: ReviewItem[];
  payerId: string | undefined;
};

export function ScanScreen() {
  const theme = useTheme();
  const { data: household } = useMyHousehold();
  const { data: householdMembers = [] } = useHouseholdMembers(household?.id);
  const processReceiptMutation = useProcessReceipt();
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>('none');
  const [scannedBarcode, setScannedBarcode] = useState<string | undefined>(undefined);
  const [confirmSheetVisible, setConfirmSheetVisible] = useState(false);
  const [barcodeNote, setBarcodeNote] = useState<string | undefined>(undefined);
  const [receiptFlow, setReceiptFlow] = useState<ReceiptFlowState>(IDLE);
  const [reviewSession, setReviewSession] = useState<ReviewSession | undefined>(undefined);
  const lastImageRef = useRef<CapturedReceiptImage | undefined>(undefined);

  function handleBarcodeScanned(barcode: string) {
    setActiveSheet('none');
    setBarcodeNote(undefined);
    setScannedBarcode(barcode);
    setConfirmSheetVisible(true);
  }

  // The one place that actually talks to process-receipt — called both for a
  // fresh capture and for Retry, so both paths get identical, guaranteed
  // start/end state transitions. Checkpoint E scope only: this proves
  // process-receipt end to end (photo in, validated Receipt +
  // receipt_imports.id out) and shows the result. It deliberately does NOT
  // touch Kitchen or Money — that's the future Review + Confirm workflow.
  async function runProcessReceipt(image: CapturedReceiptImage) {
    if (!household?.id) {
      setReceiptFlow({ phase: 'error', message: 'Could not process receipt — no household found.' });
      return;
    }

    setReceiptFlow({ phase: 'processing' });
    try {
      const result = await processReceiptMutation.mutateAsync({
        householdId: household.id,
        image: { base64: image.base64, mimeType: image.mimeType },
      });
      if (__DEV__) {
        // TEMP DIAGNOSTIC (checkpoint E live-device verification) — remove
        // once confirmed working reliably against the live project.
        console.log('[scan] process-receipt succeeded', result.receiptImportId, result.receipt);
      }
      setReceiptFlow({ phase: 'success', receipt: result.receipt, receiptImportId: result.receiptImportId });
      setReviewSession({
        receipt: result.receipt,
        receiptImportId: result.receiptImportId,
        items: receiptToReviewItems(result.receipt, householdMembers.map((member) => member.id)),
        payerId: householdMembers.find((member) => member.isCurrentUser)?.id,
      });
    } catch (error) {
      if (__DEV__) console.error('[scan] process-receipt failed', error); // TEMP DIAGNOSTIC
      setReceiptFlow({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Could not process that receipt.',
      });
    }
  }

  function handleReceiptPhoto(image: CapturedReceiptImage) {
    setActiveSheet('none');
    lastImageRef.current = image;
    // Fire-and-forget from this handler's point of view is fine here: every
    // path inside runProcessReceipt ends in a setReceiptFlow call, so there's
    // no unhandled rejection and no way for this to leave the UI silent.
    void runProcessReceipt(image);
  }

  function handleRetry() {
    if (!lastImageRef.current) return;
    void runProcessReceipt(lastImageRef.current);
  }

  // Review-session edits — every one of these is a full-replacement functional
  // update, not a mutation of the previous items array, so there's never a
  // stale-closure risk from two edits landing in the same tick.
  function handleChangeReviewItem(id: string, patch: Partial<ReviewItem>) {
    setReviewSession((session) =>
      session
        ? { ...session, items: session.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) }
        : session,
    );
  }

  function handleRemoveReviewItem(id: string) {
    setReviewSession((session) =>
      session ? { ...session, items: session.items.filter((item) => item.id !== id) } : session,
    );
  }

  function handleChangePayerId(id: string) {
    setReviewSession((session) => (session ? { ...session, payerId: id } : session));
  }

  const isProcessingReceipt = receiptFlow.phase === 'processing';

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        <View style={styles.heading}>
          <ThemedText type="title" style={styles.title}>
            Scan
          </ThemedText>
          <ThemedText themeColor="textSecondary">Add items in seconds</ThemedText>
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            label="Scan receipt"
            icon={<SymbolView name="doc.text.viewfinder" size={20} tintColor={theme.onAccent} />}
            onPress={() => setActiveSheet('receipt')}
            // The only thing this ever blocks is starting a second capture
            // while one is actively being processed — success and error
            // states leave this fully enabled, so scanning another receipt
            // is always one tap away, per the explicit requirement that this
            // can never get permanently stuck.
            disabled={isProcessingReceipt}
          />
          <PrimaryButton
            label="Scan barcode"
            icon={<SymbolView name="barcode.viewfinder" size={20} tintColor={theme.onAccent} />}
            onPress={() => setActiveSheet('barcode')}
          />
        </View>

        {receiptFlow.phase === 'processing' && (
          <View style={[styles.resultCard, { backgroundColor: theme.backgroundElement }]}>
            <ActivityIndicator color={theme.accent} />
            <ThemedText type="smallBold">Processing receipt…</ThemedText>
            <ThemedText type="small" themeColor="muted" style={styles.resultDetailText}>
              This can take a few seconds.
            </ThemedText>
          </View>
        )}

        {receiptFlow.phase === 'success' && (
          <View style={[styles.resultCard, { backgroundColor: theme.backgroundElement }]}>
            <SymbolView name="checkmark.circle.fill" size={28} tintColor={theme.success} />
            <ThemedText type="smallBold">Receipt processed</ThemedText>
            <ThemedText type="small" themeColor="muted" style={styles.resultDetailText}>
              {receiptFlow.receipt.merchantName ? `${receiptFlow.receipt.merchantName} — ` : ''}
              {receiptFlow.receipt.items.length} item{receiptFlow.receipt.items.length === 1 ? '' : 's'}, $
              {(receiptFlow.receipt.totalCents / 100).toFixed(2)} total
            </ThemedText>
          </View>
        )}

        {receiptFlow.phase === 'error' && (
          <View style={[styles.resultCard, { backgroundColor: theme.backgroundElement }]}>
            <SymbolView name="exclamationmark.triangle.fill" size={28} tintColor={theme.danger} />
            <ThemedText type="smallBold">Couldn&apos;t process that receipt</ThemedText>
            <ThemedText type="small" themeColor="muted" style={styles.resultDetailText}>
              {receiptFlow.message}
            </ThemedText>
            <PrimaryButton label="Retry" onPress={handleRetry} style={styles.retryButton} />
          </View>
        )}

        {barcodeNote && receiptFlow.phase === 'idle' && (
          <ThemedText type="small" themeColor="muted" style={styles.lastResult}>
            {barcodeNote}
          </ThemedText>
        )}
      </View>

      <BarcodeScannerSheet
        visible={activeSheet === 'barcode'}
        onClose={() => setActiveSheet('none')}
        onScanned={handleBarcodeScanned}
      />
      <ReceiptCaptureSheet
        visible={activeSheet === 'receipt'}
        onClose={() => setActiveSheet('none')}
        onUsePhoto={handleReceiptPhoto}
      />
      <BarcodeConfirmSheet
        visible={confirmSheetVisible}
        barcode={scannedBarcode}
        onClose={() => setConfirmSheetVisible(false)}
        onSaved={(note) => setBarcodeNote(note ?? 'Added to Kitchen.')}
      />
      <ReceiptReviewSheet
        visible={!!reviewSession}
        receipt={reviewSession?.receipt}
        items={reviewSession?.items ?? []}
        onChangeItem={handleChangeReviewItem}
        onRemoveItem={handleRemoveReviewItem}
        payerId={reviewSession?.payerId}
        onChangePayerId={handleChangePayerId}
        members={householdMembers}
        onClose={() => setReviewSession(undefined)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.six,
  },
  heading: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.three,
  },
  resultCard: {
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radii.large,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.five,
  },
  resultDetailText: {
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.two,
    alignSelf: 'stretch',
  },
  lastResult: {
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
  },
});
