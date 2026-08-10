import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { BarcodeConfirmSheet } from '@/features/scan/components/barcode-confirm-sheet';
import { BarcodeScannerSheet } from '@/features/scan/components/barcode-scanner-sheet';
import { ReceiptCaptureSheet } from '@/features/scan/components/receipt-capture-sheet';
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

  function handleReceiptPhoto(image: CapturedReceiptImage) {
    setActiveSheet('none');
    const approxKB = Math.round(image.byteSize / 1024);
    // Checkpoint D scope: capture + compress only — the image is held here
    // in local state, nothing is uploaded or sent to any Edge Function yet.
    // Processing (checkpoint E) will replace this placeholder.
    setLastResult(`Receipt photo ready (${approxKB}KB) — processing isn’t built yet.`);
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
          />
          <PrimaryButton
            label="Scan barcode"
            icon={<SymbolView name="barcode.viewfinder" size={20} tintColor={theme.onAccent} />}
            onPress={() => setActiveSheet('barcode')}
          />
        </View>

        {lastResult && (
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
  lastResult: {
    textAlign: 'center',
  },
});
