import EventSource from 'react-native-sse';
import { supabase } from './supabase';

// Direct connection to the Supabase Edge Function "echo-ai".
// We don't expose the OpenRouter key — it lives in the function's env.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const ECHO_AI_URL = `${SUPABASE_URL}/functions/v1/echo-ai`;

export type EchoAIEvent =
  | { type: 'conversation'; id: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call_pending'; id: string; name: string; args: any; preview: string; requiresConfirm?: boolean }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; result?: any; error?: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * True when the message text matches the Edge Function's rate-limit error.
 * Lets callers show a dedicated toast/inline UI instead of the generic
 * red-banner treatment for other failures.
 */
export function isRateLimitError(message: string | undefined | null): boolean {
  if (!message) return false;
  return /rate limit reached/i.test(message);
}

export function normalizeEchoAIError(message: string): string {
  const prefix = message.match(/^OpenRouter\s+\d+:\s*/)?.[0] ?? '';
  const raw = prefix ? message.slice(prefix.length) : message;

  try {
    const parsed = JSON.parse(raw);
    const inner = parsed?.error;
    if (typeof inner?.message === 'string') {
      return prefix ? `${prefix}${inner.message}` : inner.message;
    }
    if (typeof parsed?.message === 'string') {
      return prefix ? `${prefix}${parsed.message}` : parsed.message;
    }
  } catch {
    // Keep original text when this is not a JSON error payload.
  }

  return message;
}

export type EchoAIModel = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.0-flash-lite';

// Map the in-app model key to Google models routed through Google AI Studio.
const AI_MODEL_MAP: Record<EchoAIModel, string> = {
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
  'gemini-2.0-flash-lite': 'google/gemini-2.0-flash-lite-001',
};

interface StreamArgs {
  message?: string;
  conversationId?: string;
  confirm?: { tool_call_id: string; tool_name: string; args: any; approve: boolean };
  localResult?: {
    tool_call_id: string;
    tool_name: string;
    args: any;
    ok: boolean;
    result?: any;
    error?: string;
  };
  /** When set, overrides the default model on the Edge Function side. */
  preferredModel?: EchoAIModel;
  /** Expo Router pathname of the screen the user is currently on (e.g. '/(tabs)/home'). Injected into the system prompt so the AI knows context. */
  currentScreen?: string;
  /** Compact private personalization summary learned from the user's own chats. */
  personaContext?: string;
  /**
   * Called immediately once the stream opens with a `stop()` function.
   * Calling `stop()` closes the SSE connection and resolves the promise cleanly.
   */
  onAbortHandle?: (stop: () => void) => void;
  onEvent: (event: EchoAIEvent) => void;
}

/** Parse a raw XHR responseText that might be JSON with a `message` field. */
function parseErrorMessage(raw: string | undefined, xhrStatus?: number): string {
  if (!raw) {
    return xhrStatus ? `Connection error (HTTP ${xhrStatus})` : 'Connection error — check your network';
  }
  try {
    const obj = JSON.parse(raw);
    if (typeof obj?.message === 'string') return obj.message;
    if (typeof obj?.error === 'string') return obj.error;
  } catch {
    // not JSON — use raw text
  }
  return raw;
}

interface StreamError extends Error {
  status?: number;
  receivedEvent?: boolean;
}

function createStreamError(message: string, status?: number, receivedEvent?: boolean): StreamError {
  const err: StreamError = new Error(message);
  err.status = status;
  err.receivedEvent = receivedEvent;
  return err;
}

export function parseEchoAISSEPayload(raw: string, onEvent: StreamArgs['onEvent']): void {
  const chunks = raw
    .replace(/\r\n/g, '\n')
    .split('\n\n')
    .map(chunk => chunk.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const data = chunk
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.replace(/^data:\s?/, ''))
      .join('\n');

    if (!data || data === '[DONE]') continue;

    const parsed: EchoAIEvent = JSON.parse(data);
    onEvent(parsed);
    if (parsed.type === 'error') {
      throw createStreamError(normalizeEchoAIError(parsed.message));
    }
  }
}

async function openStreamWithFetch(
  jwt: string,
  payload: Record<string, unknown>,
  onEvent: StreamArgs['onEvent'],
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(ECHO_AI_URL, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection error — check your network';
    throw createStreamError(normalizeEchoAIError(message), 0);
  }

  const text = await response.text();
  if (!response.ok) {
    throw createStreamError(normalizeEchoAIError(parseErrorMessage(text, response.status)), response.status);
  }

  parseEchoAISSEPayload(text, onEvent);
}

/** Open a single SSE stream and return a Promise that resolves on "done". */
function openStream(
  jwt: string,
  payload: Record<string, unknown>,
  onEvent: StreamArgs['onEvent'],
  onAbortHandle?: StreamArgs['onAbortHandle'],
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let receivedEvent = false;
    const es = new EventSource(ECHO_AI_URL, {
      method: 'POST',
      pollingInterval: 0,
      lineEndingCharacter: '\n',
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });

    const cleanup = () => {
      es.removeAllEventListeners();
      es.close();
    };

    // Expose a stop handle so callers can cancel mid-stream cleanly.
    onAbortHandle?.(() => {
      cleanup();
      resolve();
    });

    es.addEventListener('message', (event: any) => {
      if (!event.data || event.data === '[DONE]') return;
      try {
        const parsed: EchoAIEvent = JSON.parse(event.data);
        receivedEvent = true;
        onEvent(parsed);
        if (parsed.type === 'done') {
          cleanup();
          resolve();
        } else if (parsed.type === 'error') {
          cleanup();
          reject(createStreamError(normalizeEchoAIError(parsed.message), undefined, receivedEvent));
        }
      } catch {
        // ignore malformed SSE lines
      }
    });

    es.addEventListener('error', (event: any) => {
      cleanup();
      const status: number | undefined = event?.xhrStatus;
      const rawMsg: string | undefined = event?.message;
      const msg = normalizeEchoAIError(parseErrorMessage(rawMsg, status));
      console.error(`[EchoAI] SSE error — status:${status ?? 'N/A'} raw:${rawMsg ?? '(empty)'}`);
      // Tag 401s so the caller can decide whether to refresh + retry.
      reject(createStreamError(msg, status, receivedEvent));
    });
  });
}

export async function streamEchoAI({
  message,
  conversationId,
  confirm,
  localResult,
  preferredModel,
  currentScreen,
  personaContext,
  onAbortHandle,
  onEvent,
}: StreamArgs): Promise<void> {
  // Get current cached session.
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('[EchoAI] getSession error:', sessionError.message);
  }

  let jwt = session?.access_token;

  // If no cached token, attempt a silent refresh before giving up.
  if (!jwt && !sessionError) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    jwt = refreshed.session?.access_token;
  }

  if (!jwt) throw new Error('Not signed in — please log out and log in again');

  const payload: Record<string, unknown> = {};
  if (message) payload.message = message;
  if (conversationId) payload.conversation_id = conversationId;
  if (confirm) payload.confirm = confirm;
  if (localResult) payload.local_result = localResult;
  if (preferredModel && AI_MODEL_MAP[preferredModel]) {
    payload.preferred_model = AI_MODEL_MAP[preferredModel];
  }
  if (currentScreen) payload.current_screen = currentScreen;
  if (personaContext) payload.persona_context = personaContext.slice(0, 2800);

  try {
    await openStream(jwt, payload, onEvent, onAbortHandle);
  } catch (err: any) {
    if ((err as StreamError)?.status === 0 && !(err as StreamError)?.receivedEvent) {
      console.warn('[EchoAI] SSE transport failed before first event — retrying with fetch fallback');
      await openStreamWithFetch(jwt, payload, onEvent);
      return;
    }

    // On 401: silently refresh the token and retry ONCE.
    if ((err as StreamError)?.status === 401) {
      console.warn('[EchoAI] 401 — attempting token refresh then retry');
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (!refreshErr && refreshed.session?.access_token) {
        try {
          await openStream(refreshed.session.access_token, payload, onEvent, onAbortHandle);
        } catch (retryErr: any) {
          if ((retryErr as StreamError)?.status === 0 && !(retryErr as StreamError)?.receivedEvent) {
            console.warn('[EchoAI] SSE transport failed after token refresh — retrying with fetch fallback');
            await openStreamWithFetch(refreshed.session.access_token, payload, onEvent);
            return;
          }
          throw retryErr;
        }
        return;
      }
      // Refresh failed — sign the user out so they hit the login screen.
      await supabase.auth.signOut();
      throw new Error('Your session expired — please sign in again');
    }
    throw err;
  }
}
