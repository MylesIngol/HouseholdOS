import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { useHouseholdStore } from '@/features/household/store';
import { getItemSubtitle, getPrimaryBadge } from '@/features/kitchen/display';
import type { InventoryItem } from '@/features/kitchen/types';

type InventoryRowProps = {
  item: InventoryItem;
  onPress: () => void;
};

export function InventoryRow({ item, onPress }: InventoryRowProps) {
  const householdMembers = useHouseholdStore((state) => state.members);
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
