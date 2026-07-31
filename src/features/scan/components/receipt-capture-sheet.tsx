import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// -----------------------------------------------------------------------------
// Capture + retake only, per checkpoint D's scope in the milestone 7 plan —
// compression/resizing before upload and everything past "the user is happy
// with this photo" belongs to later checkpoints. `onUsePhoto` currently just
// hands back the raw picked-image URI.
// -----------------------------------------------------------------------------

type ReceiptCaptureSheetProps = {
  visible: boolean;
  onClose: () => void;
  onUsePhoto: (uri: string) => void;
};

export function ReceiptCaptureSheet({ visible, onClose, onUsePhoto }: ReceiptCaptureSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = ImagePicker.useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [permissionDenied, setPermissionDenied] = useState(false);
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

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled) {
      onClose();
      return;
    }
    setPhotoUri(result.assets[0].uri);
  }

  useEffect(() => {
    if (visible && !hasLaunchedRef.current) {
      hasLaunchedRef.current = true;
      setPhotoUri(undefined);
      setPermissionDenied(false);
      openCamera();
    }
    if (!visible) {
      hasLaunchedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleClose() {
    setPhotoUri(undefined);
    onClose();
  }

  function handleRetake() {
    setPhotoUri(undefined);
    openCamera();
  }

  function handleUsePhoto() {
    if (!photoUri) return;
    const uri = photoUri;
    setPhotoUri(undefined);
    onUsePhoto(uri);
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

        {photoUri ? (
          <>
            <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="contain" />
            <View style={[styles.previewActions, { paddingBottom: insets.bottom + Spacing.four }]}>
              <Pressable onPress={handleRetake} hitSlop={8} style={styles.retakeButton}>
                <ThemedText type="linkPrimary">Retake</ThemedText>
              </Pressable>
              <PrimaryButton label="Use Photo" onPress={handleUsePhoto} />
            </View>
          </>
        ) : (
          permissionDenied && (
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
          )
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
