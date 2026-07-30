import { ThemedText } from '@/components/themed-text';
import { Row } from '@/components/ui/row';
import {
  formatActivityDateLabel,
  getActivitySummary,
  type ActivityTone,
} from '@/features/money/display';
import type { HouseholdMember } from '@/features/household/types';
import type { ActivityEntry } from '@/features/money/types';
import { useTheme } from '@/hooks/use-theme';

type ActivityRowProps = {
  entry: ActivityEntry;
  members: HouseholdMember[];
  currentUserId: string;
  /** When provided, tapping the row drills into the underlying expense/bill/settlement — the caller decides what "drill into" means for each entry type. */
  onPress?: () => void;
};

/** Renders one unified activity entry — never shows IDs or raw record shapes, just the human-readable summary from display.ts. */
export function ActivityRow({ entry, members, currentUserId, onPress }: ActivityRowProps) {
  const theme = useTheme();
  const summary = getActivitySummary(entry, members, currentUserId);

  return (
    <Row
      title={summary.title}
      subtitle={formatActivityDateLabel(entry.date)}
      onPress={onPress}
      trailing={
        <ThemedText type="smallBold" style={{ color: toneToColor(theme, summary.tone) }}>
          {summary.subtitle}
        </ThemedText>
      }
    />
  );
}

function toneToColor(theme: ReturnType<typeof useTheme>, tone: ActivityTone): string {
  switch (tone) {
    case 'success':
      return theme.success;
    case 'warning':
      return theme.warning;
    case 'neutral':
      return theme.text;
  }
}
