import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type RowProps = {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
};

/** A single horizontal list line: title/subtitle on the left, a value or pill on the right. */
export function Row({ title, subtitle, trailing, onPress }: RowProps) {
  const content = (
    <View style={styles.row}>
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
  textGroup: {
    gap: 2,
  },
  pressed: {
    opacity: 0.6,
  },
});
