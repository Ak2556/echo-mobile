import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type AuthCallbackParams = {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  type: string | null;
  error: string | null;
  errorDescription: string | null;
};

export type AuthCallbackResult =
  | { status: 'ignored'; type: string | null }
  | { status: 'success'; type: string | null; session: Session | null }
  | { status: 'error'; type: string | null; error: string };

function emptyParams(): AuthCallbackParams {
  return {
    accessToken: null,
    refreshToken: null,
    code: null,
    type: null,
    error: null,
    errorDescription: null,
  };
}

function readParams(raw: string | null | undefined): URLSearchParams {
  if (!raw) return new URLSearchParams();
  return new URLSearchParams(raw.replace(/^[?#]/, ''));
}

function mergeParams(target: URLSearchParams, source: URLSearchParams): void {
  source.forEach((value, key) => {
    if (!target.has(key)) target.set(key, value);
  });
}

export function parseAuthCallbackUrl(url: string): AuthCallbackParams {
  const merged = new URLSearchParams();

  try {
    const parsed = new URL(url);
    mergeParams(merged, readParams(parsed.search));
    mergeParams(merged, readParams(parsed.hash));
  } catch {
    const questionIndex = url.indexOf('?');
    const hashIndex = url.indexOf('#');

    if (questionIndex >= 0) {
      const end = hashIndex > questionIndex ? hashIndex : undefined;
      mergeParams(merged, readParams(url.slice(questionIndex + 1, end)));
    }
    if (hashIndex >= 0) {
      mergeParams(merged, readParams(url.slice(hashIndex + 1)));
    }
  }

  if ([...merged.keys()].length === 0) return emptyParams();

  return {
    accessToken: merged.get('access_token'),
    refreshToken: merged.get('refresh_token'),
    code: merged.get('code'),
    type: merged.get('type'),
    error: merged.get('error'),
    errorDescription: merged.get('error_description'),
  };
}

export function hasAuthCallbackPayload(url: string): boolean {
  const params = parseAuthCallbackUrl(url);
  return Boolean(
    params.accessToken ||
    params.refreshToken ||
    params.code ||
    params.error ||
    params.type === 'signup' ||
    params.type === 'recovery' ||
    params.type === 'magiclink' ||
    params.type === 'invite' ||
    params.type === 'email_change'
  );
}

export async function consumeAuthCallbackUrl(url: string): Promise<AuthCallbackResult> {
  const params = parseAuthCallbackUrl(url);

  if (!hasAuthCallbackPayload(url)) {
    return { status: 'ignored', type: params.type };
  }

  if (params.error) {
    return {
      status: 'error',
      type: params.type,
      error: params.errorDescription ? `${params.error}: ${params.errorDescription}` : params.error,
    };
  }

  try {
    if (params.accessToken || params.refreshToken) {
      if (!params.accessToken || !params.refreshToken) {
        return {
          status: 'error',
          type: params.type,
          error: 'Auth callback was missing a refresh token. Please sign in again.',
        };
      }

      const { data, error } = await supabase.auth.setSession({
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
      });
      if (error) {
        return { status: 'error', type: params.type, error: error.message };
      }
      return { status: 'success', type: params.type, session: data.session };
    }

    if (params.code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
      if (error) {
        return { status: 'error', type: params.type, error: error.message };
      }
      return { status: 'success', type: params.type, session: data.session };
    }

    return { status: 'ignored', type: params.type };
  } catch (e: any) {
    return {
      status: 'error',
      type: params.type,
      error: e?.message ?? 'Authentication failed. Please sign in again.',
    };
  }
}
