import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type RowProps = {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  /**
   * Cross-axis alignment between the left content and `trailing`. Defaults
   * to `'center'` (the original behavior). Use `'top'` when `trailing` is a
   * stacked, multi-line column (e.g. a status pill above an action) — with
   * `'center'`, that column's vertical position shifts depending on how tall
   * the left content happens to be (a wrapped title, a subtitle present or
   * not), which is exactly what `'top'` avoids: both sides start at the same
   * offset regardless of content height.
   */
  align?: 'center' | 'top';
};

/** A single horizontal list line: title/subtitle on the left, a value or pill on the right. */
export function Row({ title, subtitle, trailing, onPress, align = 'center' }: RowProps) {
  const content = (
    <View style={[styles.row, align === 'top' && styles.rowAlignTop]}>
      <View style={styles.textGroup}>
        <ThemedText>{title}</ThemedText>
        {subtitle && (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        )}
      </View>
      {trailing}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
  rowAlignTop: {
    alignItems: 'flex-start',
  },
  textGroup: {
    flexShrink: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.6,
  },
});
