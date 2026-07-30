import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FullScreenForm } from '@/components/ui/full-screen-form';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Radii, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type AccountSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Reachable from a small header affordance on Home rather than a new tab —
 * this app's navigation is 5 tabs plus modal-style full-screen forms, and an
 * account/sign-out screen fits the second category, not the first.
 */
export function AccountSheet({ visible, onClose }: AccountSheetProps) {
  const theme = useTheme();
  const { session } = useAuth();

  async function handleSignOut() {
    await supabase.auth.signOut();
    onClose();
  }

  return (
    <FullScreenForm visible={visible} onClose={onClose} title="Account">
      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          Signed in as
        </ThemedText>
        <ThemedText type="default">{session?.user.email ?? 'Unknown'}</ThemedText>
      </View>

      <PrimaryButton
        label="Sign out"
        onPress={handleSignOut}
        style={{ borderRadius: Radii.large, backgroundColor: theme.backgroundElement }}
      />
    </FullScreenForm>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
});
