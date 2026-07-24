import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';

type StatProps = {
  label: string;
  value: string;
  tone?: ThemeColor;
};

/** A label paired with a large figure — the primary way numbers are surfaced (balances, counts). */
export function Stat({ label, value, tone = 'text' }: StatProps) {
  return (
    <View style={styles.container}>
      <ThemedText type="label" themeColor="muted">
        {label}
      </ThemedText>
      <ThemedText type="stat" themeColor={tone}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
});
