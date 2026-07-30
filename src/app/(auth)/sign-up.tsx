import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Screen } from '@/components/ui/screen';
import { Radii, Spacing } from '@/constants/theme';
import { mapAuthError, validateEmail, validatePassword } from '@/features/auth/errors';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

export default function SignUpScreen() {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSignUp() {
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError || passwordError) {
      setError(emailError ?? passwordError);
      return;
    }

    setError(undefined);
    setIsSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() || undefined } },
    });
    setIsSubmitting(false);

    if (signUpError) {
      setError(mapAuthError(signUpError));
      return;
    }

    // If email confirmation is enabled on the project, signUp succeeds but
    // returns no session yet — tell the user to check their inbox instead of
    // silently doing nothing. If confirmation is disabled (e.g. local/dev),
    // a session comes back immediately and the root layout's listener moves
    // on by itself.
    if (!data.session) setConfirmationSent(true);
  }

  if (confirmationSent) {
    return (
      <Screen>
        <View style={styles.header}>
          <ThemedText type="title">Check your email</ThemedText>
          <ThemedText themeColor="textSecondary">
            We sent a confirmation link to {email.trim()}. Open it to finish creating your
            account, then come back and sign in.
          </ThemedText>
        </View>
        <PrimaryButton label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="title">Create account</ThemedText>
        <ThemedText themeColor="textSecondary">Join or start a household on HouseholdOS.</ThemedText>
      </View>

      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          Name
        </ThemedText>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="What should we call you?"
          placeholderTextColor={theme.muted}
          textContentType="name"
          style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />
      </View>

      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          Email
        </ThemedText>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />
      </View>

      <View style={styles.field}>
        <ThemedText type="label" themeColor="muted">
          Password
        </ThemedText>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          placeholderTextColor={theme.muted}
          secureTextEntry
          textContentType="newPassword"
          style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />
      </View>

      {error && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      )}

      <PrimaryButton
        label={isSubmitting ? 'Creating account…' : 'Create account'}
        onPress={isSubmitting ? undefined : handleSignUp}
        style={isSubmitting ? styles.disabled : undefined}
      />

      <Link href="/(auth)/sign-in" asChild>
        <Pressable hitSlop={8} style={styles.footerLink}>
          <ThemedText type="small" themeColor="textSecondary">
            Already have an account? <ThemedText type="linkPrimary">Sign in</ThemedText>
          </ThemedText>
        </Pressable>
      </Link>
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
  footerLink: {
    alignItems: 'center',
    paddingTop: Spacing.two,
  },
});
