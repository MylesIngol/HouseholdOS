import { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

type ScreenProps = PropsWithChildren<{
  /** Disable the ScrollView wrapper for screens that manage their own centered layout (e.g. Scan). */
  scroll?: boolean;
}>;

/**
 * Standard screen wrapper: safe-area aware, scrollable by default, centers content
 * with a max width on wide viewports. Every top-level tab screen should use this
 * instead of hand-rolling SafeAreaView/ScrollView boilerplate.
 */
export function Screen({ children, scroll = true }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + Spacing.four,
    paddingBottom: insets.bottom + BottomTabInset + Spacing.five,
  };

  const inner = <View style={[styles.inner, padding]}>{children}</View>;

  return (
    <ThemedView style={styles.flexFill}>
      {scroll ? (
        // KeyboardAvoidingView is what keeps a focused input (e.g. the
        // Kitchen grocery quick-add field) above the keyboard instead of
        // hidden behind it — no hardcoded offset, it just reserves however
        // much space the keyboard actually needs, and un-reserves it when
        // the keyboard closes. keyboardShouldPersistTaps lets a nearby
        // "Add"/link Pressable still register its tap on the first press
        // instead of only dismissing the keyboard.
        <KeyboardAvoidingView
          style={styles.flexFill}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.flexFill}
            contentContainerStyle={styles.centerRow}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {inner}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.centerRowFlex}>{inner}</View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flexFill: {
    flex: 1,
  },
  centerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexGrow: 1,
  },
  centerRowFlex: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    gap: Spacing.five,
  },
});
