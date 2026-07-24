import { PropsWithChildren } from 'react';
import { type Href, Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type SectionProps = PropsWithChildren<{
  title?: string;
  action?: { label: string; href: Href };
}>;

/**
 * A titled vertical block with an optional "view all" style action link.
 * Used to group related content (e.g. the Kitchen summary on Home).
 */
export function Section({ title, action, children }: SectionProps) {
  return (
    <View style={styles.container}>
      {(title || action) && (
        <View style={styles.header}>
          {title ? (
            <ThemedText type="label" themeColor="muted">
              {title}
            </ThemedText>
          ) : (
            <View />
          )}
          {action && (
            <Link href={action.href} asChild>
              <Pressable hitSlop={8}>
                <ThemedText type="linkPrimary">{action.label}</ThemedText>
              </Pressable>
            </Link>
          )}
        </View>
      )}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  body: {
    gap: Spacing.two,
  },
});
