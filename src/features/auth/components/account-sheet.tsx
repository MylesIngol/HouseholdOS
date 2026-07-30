import { Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { FullScreenForm } from '@/components/ui/full-screen-form';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Row } from '@/components/ui/row';
import { Section } from '@/components/ui/section';
import { Radii, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { getMemberInitials } from '@/features/household/display';
import {
  useCreateHouseholdInvite,
  useHouseholdInvite,
  useHouseholdMembers,
  useIsHouseholdOwner,
  useMyHousehold,
  useRevokeHouseholdInvite,
} from '@/features/household/queries';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type AccountSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Reachable from a small header affordance on Home rather than a new tab —
 * this app's navigation is 5 tabs plus modal-style full-screen forms, and an
 * account/household screen fits the second category, not the first.
 */
export function AccountSheet({ visible, onClose }: AccountSheetProps) {
  const theme = useTheme();
  const { session } = useAuth();

  const { data: household } = useMyHousehold();
  const { data: members = [] } = useHouseholdMembers(household?.id);
  const { data: isOwner } = useIsHouseholdOwner(household?.id);
  const { data: invite } = useHouseholdInvite(household?.id);
  const createInvite = useCreateHouseholdInvite(household?.id);
  const revokeInvite = useRevokeHouseholdInvite(household?.id);

  async function handleSignOut() {
    await supabase.auth.signOut();
    onClose();
  }

  async function handleShareInvite() {
    if (!invite) return;
    await Share.share({
      message: `Join our household "${household?.name}" on HouseholdOS. Open the app, choose "Join with a code," and enter: ${invite.code}`,
    });
  }

  return (
    <FullScreenForm visible={visible} onClose={onClose} title="Account">
      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          Signed in as
        </ThemedText>
        <ThemedText type="default">{session?.user.email ?? 'Unknown'}</ThemedText>
      </View>

      {household && (
        <Section title={household.name}>
          <Card>
            {members.map((member) => (
              <Row
                key={member.id}
                title={member.isCurrentUser ? 'You' : member.name}
                subtitle={getMemberInitials(member)}
              />
            ))}
          </Card>
        </Section>
      )}

      {household && (
        <View style={styles.field}>
          <ThemedText type="label" themeColor="muted">
            Invite a roommate
          </ThemedText>
          {invite ? (
            <>
              <View style={[styles.codeBox, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="title" style={styles.codeText}>
                  {invite.code}
                </ThemedText>
              </View>
              <PrimaryButton label="Share invite code" onPress={handleShareInvite} />
              {isOwner && (
                <PrimaryButton
                  label={revokeInvite.isPending ? 'Revoking…' : 'Revoke this code'}
                  onPress={
                    revokeInvite.isPending ? undefined : () => revokeInvite.mutate(invite.id)
                  }
                  style={{ backgroundColor: theme.backgroundElement }}
                />
              )}
            </>
          ) : isOwner ? (
            <PrimaryButton
              label={createInvite.isPending ? 'Creating…' : 'Create invite code'}
              onPress={createInvite.isPending ? undefined : () => createInvite.mutate()}
            />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Only the household owner can create an invite code right now.
            </ThemedText>
          )}
        </View>
      )}

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
  codeBox: {
    borderRadius: Radii.medium,
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
  codeText: {
    fontSize: 28,
    letterSpacing: 2,
  },
});
