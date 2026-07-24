import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PillTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

type PillProps = {
  label: string;
  tone?: PillTone;
};

const toneColorKey = {
  neutral: 'muted',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  accent: 'accent',
} as const;

/** A small, softly-tinted status chip — e.g. "Due tonight", "Low stock". */
export function Pill({ label, tone = 'neutral' }: PillProps) {
  const theme = useTheme();
  const color = theme[toneColorKey[tone]];

  return (
    <View style={[styles.pill, { backgroundColor: `${color}1F` }]}>
      <ThemedText type="small" style={{ color }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
});
