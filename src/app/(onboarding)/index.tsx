import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PillSelector } from '@/components/ui/pill-selector';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Screen } from '@/components/ui/screen';
import { Radii, Spacing } from '@/constants/theme';
import { mapAuthError } from '@/features/auth/errors';
import { useCreateHousehold, useJoinHousehold } from '@/features/household/queries';
import { useTheme } from '@/hooks/use-theme';

type Mode = 'create' | 'join';

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'create', label: 'Create a household' },
  { value: 'join', label: 'Join with a code' },
];

/**
 * Shown once a signed-in user has no household yet (Stack.Protected guard in
 * the root layout). Not a tab — this route only exists in that gap between
 * "signed in" and "has a household," and the app never lets a user navigate
 * back to it once they've joined/created one.
 */
export default function OnboardingScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('create');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const createHousehold = useCreateHousehold();
  const joinHousehold = useJoinHousehold();
  const isSubmitting = createHousehold.isPending || joinHousehold.isPending;

  async function handleCreate() {
    const name = householdName.trim();
    if (!name) {
      setError('Household name is required.');
      return;
    }
    setError(undefined);
    try {
      await createHousehold.mutateAsync(name);
    } catch (submitError) {
      setError(mapAuthError(submitError));
    }
  }

  async function handleJoin() {
    const code = inviteCode.trim();
    if (!code) {
      setError('Enter the invite code a roommate shared with you.');
      return;
    }
    setError(undefined);
    try {
      await joinHousehold.mutateAsync(code);
    } catch (submitError) {
      setError(mapAuthError(submitError));
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="title">Your household</ThemedText>
        <ThemedText themeColor="textSecondary">
          Create a new household, or join one a roommate already started.
        </ThemedText>
      </View>

      <PillSelector options={MODE_OPTIONS} value={mode} onChange={setMode} />

      {mode === 'create' ? (
        <View style={styles.field}>
          <ThemedText type="label" themeColor="muted">
            Household name
          </ThemedText>
          <TextInput
            value={householdName}
            onChangeText={setHouseholdName}
            placeholder="e.g. Apartment 4B"
            placeholderTextColor={theme.muted}
            style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          />
        </View>
      ) : (
        <View style={styles.field}>
          <ThemedText type="label" themeColor="muted">
            Invite code
          </ThemedText>
          <TextInput
            value={inviteCode}
            onChangeText={(text) => setInviteCode(text.toUpperCase())}
            placeholder="e.g. XK7PM2QRT9"
            placeholderTextColor={theme.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          />
        </View>
      )}

      {error && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      )}

      <PrimaryButton
        label={
          isSubmitting
            ? mode === 'create'
              ? 'Creating…'
              : 'Joining…'
            : mode === 'create'
              ? 'Create household'
              : 'Join household'
        }
        onPress={isSubmitting ? undefined : mode === 'create' ? handleCreate : handleJoin}
        style={isSubmitting ? styles.disabled : undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
  },
  field: {
    gap: Spacing.two,
  },
  input: {
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  disabled: {
    opacity: 0.6,
  },
});
