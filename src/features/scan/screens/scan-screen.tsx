import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { BarcodeScannerSheet } from '@/features/scan/components/barcode-scanner-sheet';
import { ReceiptCaptureSheet } from '@/features/scan/components/receipt-capture-sheet';
import { useTheme } from '@/hooks/use-theme';

type ActiveSheet = 'none' | 'barcode' | 'receipt';

// -----------------------------------------------------------------------------
// Checkpoint A scope: camera plumbing for both flows exists and works —
// scanning a barcode or capturing+retaking a receipt photo. Neither flow
// does anything with its result yet beyond a plain confirmation here;
// barcode lookup (checkpoint B) and receipt processing (checkpoint E) are
// separate, not-yet-built steps that will replace these placeholders.
// -----------------------------------------------------------------------------

export function ScanScreen() {
  const theme = useTheme();
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>('none');
  const [lastResult, setLastResult] = useState<string | undefined>(undefined);

  function handleBarcodeScanned(barcode: string) {
    setActiveSheet('none');
    setLastResult(`Scanned barcode ${barcode} — lookup isn't built yet.`);
  }

  function handleReceiptPhoto(_uri: string) {
    setActiveSheet('none');
    setLastResult('Receipt photo captured — processing isn’t built yet.');
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
