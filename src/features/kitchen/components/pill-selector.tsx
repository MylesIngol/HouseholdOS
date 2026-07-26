import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PillSelectorOption<T extends string> = {
  value: T;
  label: string;
};

type PillSelectorProps<T extends string> = {
  options: PillSelectorOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
};

/** A row of tappable pills used for single-choice fields: location, status, ownership, filters. */
export function PillSelector<T extends string>({ options, value, onChange }: PillSelectorProps<T>) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.pill,
              { backgroundColor: selected ? theme.accent : theme.backgroundElement },
            ]}
          >
            <ThemedText
              type="smallBold"
              style={{ color: selected ? theme.onAccent : theme.textSecondary }}
            >
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.full,
  },
});
