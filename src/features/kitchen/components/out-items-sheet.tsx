import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { EmptyState } from '@/components/ui/empty-state';
import { Row } from '@/components/ui/row';
import { getLocationLabel } from '@/features/kitchen/display';
import { getOutItems } from '@/features/kitchen/selectors';
import { useKitchenStore } from '@/features/kitchen/store';

type OutItemsSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** The subtle, non-permanent way to get back to Out items — mainly for re-adding them to the grocery list. */
export function OutItemsSheet({ visible, onClose }: OutItemsSheetProps) {
  const items = useKitchenStore((state) => state.items);
  const addToGrocery = useKitchenStore((state) => state.addInventoryItemToGrocery);
  const outItems = getOutItems(items);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ThemedText type="label" themeColor="muted">
        Recently Out
      </ThemedText>
      {outItems.length === 0 ? (
        <EmptyState title="Nothing out right now" />
      ) : (
        outItems.map((item) => (
          <Row
            key={item.id}
            title={item.name}
            subtitle={getLocationLabel(item.location)}
            trailing={
              <Pressable onPress={() => addToGrocery(item.id)} hitSlop={8}>
                <ThemedText type="linkPrimary">Add to list</ThemedText>
              </Pressable>
            }
          />
        ))
      )}
    </BottomSheet>
  );
}
