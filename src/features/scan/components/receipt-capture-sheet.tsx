import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Spacing } from '@/constants/theme';
import { compressReceiptImage, type CapturedReceiptImage } from '@/features/scan/receipt-image';
import { useTheme } from '@/hooks/use-theme';

// -----------------------------------------------------------------------------
// Checkpoint D scope: capture, compress/resize client-side, retake, done —
// nothing is sent anywhere yet. `onUsePhoto` hands back the already-
// compressed image (uri + base64 + dimensions), ready for checkpoint E's
// process-receipt Edge Function to consume directly. The preview shown here
// is the COMPRESSED image, not the raw capture — what you see is what will
// eventually be sent.
// -----------------------------------------------------------------------------

type ReceiptCaptureSheetProps = {
  visible: boolean;
  onClose: () => void;
  onUsePhoto: (image: CapturedReceiptImage) => void;
};

export function ReceiptCaptureSheet({ visible, onClose, onUsePhoto }: ReceiptCaptureSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = ImagePicker.useCameraPermissions();
  const [photo, setPhoto] = useState<CapturedReceiptImage | undefined>(undefined);
  const [isProcessing, setIsProcessing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [captureError, setCaptureError] = useState<string | undefined>(undefined);
  // Guards against launching the camera twice for one "visible" session (e.g.
  // React re-rendering the effect) — launchCameraAsync already shows its own
  // native UI, so a double-launch would stack two camera screens.
  const hasLaunchedRef = useRef(false);

  async function openCamera() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setPermissionDenied(true);
        return;
      }
    }
    setPermissionDenied(false);
    setCaptureError(undefined);

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled) {
      onClose();
      return;
    }

    const asset = result.assets[0];
    setIsProcessing(true);
    try {
      const compressed = await compressReceiptImage(asset.uri, asset.width, asset.height);
      if (__DEV__) {
        console.log('[scan] receipt photo compressed', {
          width: compressed.width,
          height: compressed.height,
          approxKB: Math.round(compressed.byteSize / 1024),
        });
      }
      setPhoto(compressed);
    } catch (error) {
      if (__DEV__) console.error('[scan] receipt compression failed', error);
      setCaptureError('Could not process that photo — try again.');
    } finally {
      setIsProcessing(false);
    }
  }

  useEffect(() => {
    if (visible && !hasLaunchedRef.current) {
      hasLaunchedRef.current = true;
      setPhoto(undefined);
      setPermissionDenied(false);
      setCaptureError(undefined);
      openCamera();
    }
    if (!visible) {
      hasLaunchedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleClose() {
    setPhoto(undefined);
    onClose();
  }

  function handleRetake() {
    setPhoto(undefined);
    openCamera();
  }

  function handleUsePhoto() {
    if (!photo) return;
    const captured = photo;
    setPhoto(undefined);
    onUsePhoto(captured);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + Spacing.two }]}>
          <Pressable onPress={handleClose} hitSlop={8}>
            <ThemedText type="linkPrimary">Cancel</ThemedText>
          </Pressable>
        </View>

        {isProcessing && (
          <View style={styles.centerFill}>
            <ActivityIndicator color={theme.accent} />
            <ThemedText type="small" themeColor="muted">
              Processing photo…
            </ThemedText>
          </View>
        )}

        {!isProcessing && photo && (
          <>
            <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="contain" />
            <View style={[styles.previewActions, { paddingBottom: insets.bottom + Spacing.four }]}>
              <Pressable onPress={handleRetake} hitSlop={8} style={styles.retakeButton}>
                <ThemedText type="linkPrimary">Retake</ThemedText>
              </Pressable>
              <PrimaryButton label="Use Photo" onPress={handleUsePhoto} />
            </View>
          </>
        )}

        {!isProcessing && !photo && captureError && (
          <View style={styles.permissionFallback}>
            <ThemedText type="default" style={styles.permissionText}>
              {captureError}
            </ThemedText>
            <PrimaryButton label="Try Again" onPress={openCamera} />
          </View>
        )}

        {!isProcessing && !photo && !captureError && permissionDenied && (
          <View style={styles.permissionFallback}>
            <ThemedText type="default" style={styles.permissionText}>
              {permission?.canAskAgain === false
                ? 'Camera access is off for HouseholdOS. Enable it in Settings to scan receipts.'
                : 'HouseholdOS needs camera access to scan receipts.'}
            </ThemedText>
            <PrimaryButton
              label={permission?.canAskAgain === false ? 'Open Settings' : 'Allow Camera'}
              onPress={permission?.canAskAgain === false ? () => Linking.openSettings() : openCamera}
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  preview: {
    flex: 1,
    width: '100%',
  },
  previewActions: {
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  retakeButton: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
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
});
