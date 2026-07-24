import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, useColorScheme, View, StyleSheet } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Colors, MaxContentWidth, Radii, Spacing } from '@/constants/theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton icon="house.fill">Home</TabButton>
          </TabTrigger>
          <TabTrigger name="kitchen" href="/kitchen" asChild>
            <TabButton icon="fork.knife">Kitchen</TabButton>
          </TabTrigger>
          <TabTrigger name="scan" href="/scan" asChild>
            <ScanTabButton />
          </TabTrigger>
          <TabTrigger name="money" href="/money" asChild>
            <TabButton icon="dollarsign.circle.fill">Money</TabButton>
          </TabTrigger>
          <TabTrigger name="tasks" href="/tasks" asChild>
            <TabButton icon="checklist">Tasks</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

// expo-symbols in SDK 54 only renders real icons on iOS (SymbolView.name is an
// SF Symbol string, and the Android/web implementations render nothing but
// `fallback`). This file only runs on web, so icons render as nothing here —
// the text label carries the tab identity instead, same as it always has.
function TabButton({
  children,
  icon,
  isFocused,
  ...props
}: TabTriggerSlotProps & { icon: SFSymbol }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}
      >
        <SymbolView
          name={icon}
          size={16}
          tintColor={isFocused ? colors.text : colors.textSecondary}
        />
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

// The Scan tab is the app's central action: a raised, accent-filled circle
// rather than another pill in the row, so it visually anchors the tab bar.
function ScanTabButton({ ...props }: TabTriggerSlotProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <View style={[styles.scanCircle, { backgroundColor: colors.accent }]}>
        <SymbolView name="qrcode.viewfinder" size={22} tintColor={colors.onAccent} />
      </View>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        <ThemedText type="smallBold" style={[styles.brandText, { color: colors.accent }]}>
          HouseholdOS
        </ThemedText>

        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Radii.full,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  brandText: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.small,
  },
  scanCircle: {
    width: 44,
    height: 44,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
  },
});
