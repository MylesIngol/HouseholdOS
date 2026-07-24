import { type ReactNode } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PrimaryButtonProps = {
  label: string;
  icon?: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
};

/** The one obvious primary action on a screen or section. Use sparingly. */
export function PrimaryButton({ label, icon, onPress, style }: PrimaryButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {icon}
      <ThemedText type="smallBold" style={{ color: theme.onAccent, fontSize: 16 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: Radii.large,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
});
