import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useMyHousehold } from '@/features/household/queries';
import { BarcodeConfirmSheet } from '@/features/scan/components/barcode-confirm-sheet';
import { BarcodeScannerSheet } from '@/features/scan/components/barcode-scanner-sheet';
import { ReceiptCaptureSheet } from '@/features/scan/components/receipt-capture-sheet';
import { useProcessReceipt } from '@/features/scan/queries';
import type { CapturedReceiptImage } from '@/features/scan/receipt-image';
import { useTheme } from '@/hooks/use-theme';

type ActiveSheet = 'none' | 'barcode' | 'receipt';

// -----------------------------------------------------------------------------
// A scanned barcode is checked against this household's own memory first,
// then (only on a miss) the lookup-barcode Edge Function's cache -> Open
// Food Facts -> UPCitemdb -> unknown chain, landing in a compact
// add-to-Kitchen confirmation sheet either way. `lastResult` here doubles
// as the confirmation of a successful Add and the surfaced note for the
// rare case where the item saved but "remember for next time" didn't.
// Receipt capture (checkpoint D) still just confirms a photo was taken —
// processing that photo is checkpoint E's Edge Function, not yet built.
// -----------------------------------------------------------------------------

export function ScanScreen() {
  const theme = useTheme();
  const { data: household } = useMyHousehold();
  const processReceiptMutation = useProcessReceipt();
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>('none');
  const [scannedBarcode, setScannedBarcode] = useState<string | undefined>(undefined);
  const [confirmSheetVisible, setConfirmSheetVisible] = useState(false);
  const [lastResult, setLastResult] = useState<string | undefined>(undefined);

  function handleBarcodeScanned(barcode: string) {
    setActiveSheet('none');
    setLastResult(undefined);
    setScannedBarcode(barcode);
    setConfirmSheetVisible(true);
  }

  // Checkpoint E scope only: proves process-receipt end to end (photo in,
  // validated Receipt + receipt_imports.id out) — deliberately NOT the
  // Receipt Review UI (checkpoint G), which stays gated until this has
  // successfully processed one real photographed receipt from a device.
  async function handleReceiptPhoto(image: CapturedReceiptImage) {
    setActiveSheet('none');
    setLastResult(undefined);

    if (!household?.id) {
      setLastResult('Could not process receipt — no household found.');
      return;
    }

    try {
      const result = await processReceiptMutation.mutateAsync({
        householdId: household.id,
        image: { base64: image.base64, mimeType: image.mimeType },
      });
      if (__DEV__) {
        // TEMP DIAGNOSTIC (checkpoint E live-device verification) — remove
        // once confirmed working against the live project.
        console.log('[scan] process-receipt succeeded', result.receiptImportId, result.receipt);
      }
      const itemCount = result.receipt.items.length;
      const totalDisplay = (result.receipt.totalCents / 100).toFixed(2);
      const merchant = result.receipt.merchantName ? ` at ${result.receipt.merchantName}` : '';
      setLastResult(
        `Parsed ${itemCount} item${itemCount === 1 ? '' : 's'}${merchant}, total $${totalDisplay}. Saved as receipt_imports/${result.receiptImportId}.`,
      );
    } catch (error) {
      if (__DEV__) console.error('[scan] process-receipt failed', error); // TEMP DIAGNOSTIC
      setLastResult(error instanceof Error ? error.message : 'Could not process that receipt.');
    }
  }

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
            // Client-side guard against double-submitting the same photo
            // while process-receipt is still in flight (plan section 8).
            disabled={processReceiptMutation.isPending}
          />
          <PrimaryButton
            label="Scan barcode"
            icon={<SymbolView name="barcode.viewfinder" size={20} tintColor={theme.onAccent} />}
            onPress={() => setActiveSheet('barcode')}
          />
        </View>

        {processReceiptMutation.isPending && (
          <View style={styles.processingRow}>
            <ActivityIndicator color={theme.accent} />
            <ThemedText type="small" themeColor="muted">
              Processing receipt…
            </ThemedText>
          </View>
        )}

        {!processReceiptMutation.isPending && lastResult && (
          <ThemedText type="small" themeColor="muted" style={styles.lastResult}>
            {lastResult}
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
        onSaved={(note) => setLastResult(note ?? 'Added to Kitchen.')}
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
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  lastResult: {
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
  },
});
