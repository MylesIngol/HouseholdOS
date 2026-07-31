import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// -----------------------------------------------------------------------------
// Live barcode scanning only — this component's job ends the moment a
// barcode is decoded. What happens with that barcode (cache lookup, external
// provider fallback, unknown-barcode manual entry) is checkpoint B's Edge
// Function, not this screen's concern. Kept deliberately dumb.
// -----------------------------------------------------------------------------

// The four grocery-relevant symbologies (checkpoint plan section 2) — not the
// full BarcodeType union, so QR/PDF417/etc never trigger a scan here.
const GROCERY_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

type BarcodeScannerSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Fires once per scan session — the sheet stops scanning after the first hit and shows a confirm/scan-again state, rather than firing repeatedly for the same code held under the camera. */
  onScanned: (barcode: string) => void;
};

export function BarcodeScannerSheet({ visible, onClose, onScanned }: BarcodeScannerSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedCode, setScannedCode] = useState<string | undefined>(undefined);

  function handleClose() {
    setScannedCode(undefined);
    onClose();
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scannedCode) return; // already showing a result — ignore further frames
    setScannedCode(result.data);
  }

  function handleUseCode() {
    if (!scannedCode) return;
    const code = scannedCode;
    setScannedCode(undefined);
    onScanned(code);
  }

  function handleScanAgain() {
    setScannedCode(undefined);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...GROCERY_BARCODE_TYPES] }}
            onBarcodeScanned={scannedCode ? undefined : handleBarcodeScanned}
          />
        ) : (
          <View style={[styles.permissionFallback, { backgroundColor: theme.background }]}>
            <ThemedText type="default" style={styles.permissionText}>
              {permission?.canAskAgain === false
                ? 'Camera access is off for HouseholdOS. Enable it in Settings to scan barcodes.'
                : 'HouseholdOS needs camera access to scan barcodes.'}
            </ThemedText>
            <PrimaryButton
              label={permission?.canAskAgain === false ? 'Open Settings' : 'Allow Camera'}
              onPress={
                permission?.canAskAgain === false ? () => Linking.openSettings() : requestPermission
              }
            />
          </View>
        )}

        <View style={[styles.topBar, { paddingTop: insets.top + Spacing.two }]}>
          <Pressable onPress={handleClose} hitSlop={8} style={styles.cancelButton}>
            <ThemedText type="linkPrimary" style={styles.cancelText}>
              Cancel
            </ThemedText>
          </Pressable>
        </View>

        {permission?.granted && !scannedCode && (
          <View style={styles.hintWrap} pointerEvents="none">
            <View style={[styles.scanFrame, { borderColor: theme.onAccent }]} />
            <ThemedText type="small" style={styles.hintText}>
              Point the camera at a barcode
            </ThemedText>
          </View>
        )}

        {scannedCode && (
          <View
            style={[
              styles.resultSheet,
              { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.four },
            ]}
          >
            <ThemedText type="label" themeColor="muted">
              Scanned
            </ThemedText>
            <ThemedText type="title" style={styles.codeText}>
              {scannedCode}
            </ThemedText>
            <PrimaryButton label="Use this code" onPress={handleUseCode} />
            <Pressable onPress={handleScanAgain} hitSlop={8} style={styles.scanAgain}>
              <ThemedText type="linkPrimary">Scan again</ThemedText>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  cancelButton: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  cancelText: {
    color: '#FFFFFF',
  },
  hintWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  scanFrame: {
    width: 260,
    height: 160,
    borderWidth: 2,
    borderRadius: Radii.medium,
  },
  hintText: {
    color: '#FFFFFF',
  },
  permissionFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.six,
  },
  permissionText: {
    textAlign: 'center',
  },
  resultSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: Radii.large,
    borderTopRightRadius: Radii.large,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.five,
    gap: Spacing.three,
  },
  codeText: {
    fontSize: 28,
    letterSpacing: 1,
  },
  scanAgain: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
});
