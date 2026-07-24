import { PropsWithChildren } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';

type CardProps = PropsWithChildren<{ style?: ViewStyle }>;

/**
 * A soft surface container. Use only where grouping content actually adds
 * clarity (e.g. a status summary) — not as a default wrapper for every block.
 */
export function Card({ children, style }: CardProps) {
  return (
    <ThemedView type="backgroundElement" style={[styles.card, style]}>
      {children}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.large,
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
