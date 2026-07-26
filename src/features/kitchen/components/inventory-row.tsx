import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { getItemSubtitle, getPrimaryBadge } from '@/features/kitchen/display';
import { householdMembers } from '@/features/kitchen/mock-data';
import type { InventoryItem } from '@/features/kitchen/types';

type InventoryRowProps = {
  item: InventoryItem;
  onPress: () => void;
};

export function InventoryRow({ item, onPress }: InventoryRowProps) {
  const badge = getPrimaryBadge(item);

  return (
    <Row
      title={item.name}
      subtitle={getItemSubtitle(item, householdMembers)}
      onPress={onPress}
      trailing={badge ? <Pill label={badge.label} tone={badge.tone} /> : undefined}
    />
  );
}
