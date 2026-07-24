import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { expiringSoon, groceryList, kitchenSections } from '@/features/kitchen/mock-data';

export function KitchenScreen() {
  return (
    <Screen>
      <ThemedText type="title" style={styles.title}>
        Kitchen
      </ThemedText>

      <Section title="Storage">
        <Card>
          {kitchenSections.map((section) => (
            <Row key={section.key} title={section.label} subtitle={`${section.itemCount} items`} />
          ))}
        </Card>
      </Section>

      <Section title="Expiring soon">
        <Card>
          {expiringSoon.map((item) => (
            <Row
              key={item.id}
              title={item.name}
              subtitle={item.location}
              trailing={
                <Pill
                  label={item.daysLeft <= 1 ? 'Today' : `${item.daysLeft} days`}
                  tone={item.daysLeft <= 1 ? 'danger' : 'warning'}
                />
              }
            />
          ))}
        </Card>
      </Section>

      <Section title="Grocery list">
        {groceryList.length === 0 ? (
          <EmptyState
            title="Nothing on the list"
            subtitle="Scan a receipt or barcode to add items"
          />
        ) : (
          <Card>
            {groceryList.map((item) => (
              <Row key={item.id} title={item.name} />
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 34,
    lineHeight: 40,
  },
});
