// -----------------------------------------------------------------------------
// Maps Supabase Auth errors to copy a roommate can actually act on. Keyed
// primarily off `error.code` (present on AuthApiError instances), falling
// back to message substring matching for older/edge-case errors, with a
// distinct branch for network failures so a dropped connection is never
// confused with a real credential rejection.
// -----------------------------------------------------------------------------

type AuthErrorLike = {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
};

const CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: 'That email or password is incorrect.',
  email_not_confirmed: 'Please confirm your email before signing in.',
  user_already_exists: 'An account with that email already exists — try signing in instead.',
  weak_password: 'Please choose a longer password (at least 6 characters).',
  over_email_send_rate_limit: 'Too many attempts — please wait a moment and try again.',
  same_password: 'That is already your current password.',
  user_not_found: 'That email or password is incorrect.',
  signup_disabled: 'New accounts are not being accepted right now.',
};

export function mapAuthError(error: unknown): string {
  if (!error) return 'Something went wrong. Please try again.';

  if (error instanceof TypeError || (error as Error)?.name === 'AuthRetryableFetchError') {
    return "Can't reach the server — check your connection and try again.";
  }

  const err = error as AuthErrorLike;

  if (err.code && CODE_MESSAGES[err.code]) {
    return CODE_MESSAGES[err.code];
  }

  const message = err.message ?? '';
  if (/invalid login credentials/i.test(message)) return CODE_MESSAGES.invalid_credentials;
  if (/already registered|already exists/i.test(message)) return CODE_MESSAGES.user_already_exists;
  if (/email not confirmed/i.test(message)) return CODE_MESSAGES.email_not_confirmed;
  if (/password.*(least|characters|short)/i.test(message)) return CODE_MESSAGES.weak_password;
  if (/network|fetch/i.test(message)) {
    return "Can't reach the server — check your connection and try again.";
  }

  return message || 'Something went wrong. Please try again.';
}

export function validateEmail(email: string): string | undefined {
  const trimmed = email.trim();
  if (!trimmed) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Enter a valid email address.';
  return undefined;
}

export function validatePassword(password: string): string | undefined {
  if (!password) return 'Password is required.';
  if (password.length < 6) return 'Password must be at least 6 characters.';
  return undefined;
}
