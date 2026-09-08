/**
 * expo-apple-authentication throws at import under node — it is a native
 * module with no JS fallback. Without this alias every suite that transitively
 * reaches lib/auth would fail on import rather than on anything it asserts.
 *
 * Availability is false here on purpose: the code paths that matter in tests
 * are the ones that run when the native sheet cannot be shown.
 */
export const AppleAuthenticationScope = {
  FULL_NAME: 0,
  EMAIL: 1,
} as const;

export const AppleAuthenticationCredentialState = {
  REVOKED: 0,
  AUTHORIZED: 1,
  NOT_FOUND: 2,
  TRANSFERRED: 3,
} as const;

export async function isAvailableAsync(): Promise<boolean> {
  return false;
}

export async function signInAsync(): Promise<never> {
  throw Object.assign(new Error('Apple sign-in is unavailable in tests'), {
    code: 'ERR_REQUEST_CANCELED',
  });
}

export async function getCredentialStateAsync(): Promise<number> {
  return AppleAuthenticationCredentialState.NOT_FOUND;
}

export async function refreshAsync(): Promise<never> {
  throw new Error('not implemented in stub');
}

export async function signOutAsync(): Promise<never> {
  throw new Error('not implemented in stub');
}
