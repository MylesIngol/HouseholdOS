import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useAddGroceryItem } from '@/features/kitchen/queries';
import { useTheme } from '@/hooks/use-theme';

/** Always-visible single-line add field — no sheet, no modal, just type and submit. */
export function GroceryQuickAdd() {
  const theme = useTheme();
  const [text, setText] = useState('');
  const addGroceryItem = useAddGroceryItem();

  function submit() {
    if (!text.trim()) return;
    addGroceryItem.mutate(text);
    setText('');
  }

  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        returnKeyType="done"
        placeholder="Add to grocery list"
        placeholderTextColor={theme.muted}
        style={[styles.input, { color: theme.text }]}
      />
      {text.trim().length > 0 && (
        <Pressable onPress={submit} hitSlop={8}>
          <ThemedText type="linkPrimary">Add</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
});
