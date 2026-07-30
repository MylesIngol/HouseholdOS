import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { useHouseholdMembers, useMyHousehold } from '@/features/household/queries';
import { getItemSubtitle, getPrimaryBadge } from '@/features/kitchen/display';
import type { InventoryItem } from '@/features/kitchen/types';

type InventoryRowProps = {
  item: InventoryItem;
  onPress: () => void;
};

export function InventoryRow({ item, onPress }: InventoryRowProps) {
  const { data: household } = useMyHousehold();
  const { data: householdMembers = [] } = useHouseholdMembers(household?.id);
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
