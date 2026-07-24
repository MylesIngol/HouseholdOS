// SDK 54's expo-router/unstable-native-tabs only exposes Icon/Label as standalone
// components (NativeTabs.Trigger.Icon/.Label is SDK 55+ only). Same 5 tabs, same
// icons, same order — just the composition syntax the older API requires.
//
// SDK 54's Icon component also has no `md` (Android Material icon name) prop —
// only `sf` (SF Symbol, iOS), `drawable`, or `src`/`androidSrc` (image assets we
// don't have). Android tabs fall back to label-only until real drawable/image
// assets are added.
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}
    >
      <NativeTabs.Trigger name="index">
        <Label>Home</Label>
        <Icon sf="house.fill" selectedColor={colors.accent} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="kitchen">
        <Label>Kitchen</Label>
        <Icon sf="fork.knife" selectedColor={colors.accent} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="scan">
        <Label>Scan</Label>
        <Icon sf="qrcode.viewfinder" selectedColor={colors.accent} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="money">
        <Label>Money</Label>
        <Icon sf="dollarsign.circle.fill" selectedColor={colors.accent} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="tasks">
        <Label>Tasks</Label>
        <Icon sf="checklist" selectedColor={colors.accent} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
