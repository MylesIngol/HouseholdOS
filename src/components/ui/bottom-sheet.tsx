import { type PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radii, Spacing } from '@/constants/theme';

type BottomSheetProps = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
}>;

/**
 * A generic slide-up sheet for quick, contextual interactions (item detail,
 * add item, recently-out) — built on RN's Modal, no extra dependency. Prefer
 * this over pushing a new full screen for anything that's a quick edit.
 */
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={styles.sheetRow}>
          <ThemedView style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.four }]}>
            <View style={styles.handle} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              {children}
            </ScrollView>
          </ThemedView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetRow: {
    width: '100%',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    maxHeight: '85%',
    borderTopLeftRadius: Radii.large,
    borderTopRightRadius: Radii.large,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: Radii.full,
    backgroundColor: 'rgba(120,120,128,0.36)',
    marginBottom: Spacing.three,
  },
  content: {
    gap: Spacing.four,
    paddingBottom: Spacing.two,
  },
});
