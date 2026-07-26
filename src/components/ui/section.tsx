import { PropsWithChildren } from 'react';
import { type Href, Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type SectionAction = { label: string } & (
  { href: Href; onPress?: never } | { href?: never; onPress: () => void }
);

type SectionProps = PropsWithChildren<{
  title?: string;
  action?: SectionAction;
}>;

/**
 * A titled vertical block with an optional "view all" style action. The
 * action either navigates (`href`) or runs a callback (`onPress`, e.g. to
 * open a bottom sheet) — never both.
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
          {action && 'href' in action && action.href ? (
            <Link href={action.href} asChild>
              <Pressable hitSlop={8}>
                <ThemedText type="linkPrimary">{action.label}</ThemedText>
              </Pressable>
            </Link>
          ) : action ? (
            <Pressable hitSlop={8} onPress={action.onPress}>
              <ThemedText type="linkPrimary">{action.label}</ThemedText>
            </Pressable>
          ) : null}
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
