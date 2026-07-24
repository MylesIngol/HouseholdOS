import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type EmptyStateProps = {
  title: string;
  subtitle?: string;
};

/** A calm placeholder for a section that genuinely has nothing in it yet. */
export function EmptyState({ title, subtitle }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <ThemedText themeColor="textSecondary">{title}</ThemedText>
      {subtitle && (
        <ThemedText type="small" themeColor="muted">
          {subtitle}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.four,
    alignItems: 'flex-start',
    gap: Spacing.half,
  },
});
