import { type PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FullScreenFormProps = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Omit to hide the right-side action entirely (rare — most forms have a save action). */
  onSave?: () => void;
  saveLabel?: string;
  /** Grays out and disables the save action without hiding it, so its position never shifts as validity changes. */
  saveDisabled?: boolean;
}>;

/**
 * The full-screen counterpart to BottomSheet, for substantial multi-field
 * forms (Add/Edit item, expense, bill, chore) rather than quick or
 * read-mostly interactions, which stay in BottomSheet. Deliberately still a
 * plain RN `Modal` — not an Expo Router route — so no navigation
 * restructuring or new dependency is needed; only the presentation differs.
 *
 * `presentationStyle="fullScreen"` + `transparent={false}` are set
 * explicitly (not left to default inference) so this always renders as a
 * true edge-to-edge full-screen view on iOS, never the automatic
 * pageSheet/formSheet card-with-margins presentation.
 */
export function FullScreenForm({
  visible,
  onClose,
  title,
  onSave,
  saveLabel = 'Save',
  saveDisabled,
  children,
}: FullScreenFormProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

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
            {title}
          </ThemedText>
          <View style={[styles.headerSide, styles.headerSideRight]}>
            {onSave && (
              <Pressable onPress={saveDisabled ? undefined : onSave} hitSlop={8}>
                <ThemedText
                  type="linkPrimary"
                  style={saveDisabled ? { color: theme.muted } : undefined}
                >
                  {saveLabel}
                </ThemedText>
              </Pressable>
            )}
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.flexFill}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.flexFill}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.inner, { paddingBottom: insets.bottom + Spacing.five }]}>
              {children}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  headerSideRight: {
    alignItems: 'flex-end',
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
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
});
