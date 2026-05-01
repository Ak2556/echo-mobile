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
  | { type: 'tool_call_pending'; id: string; name: string; args: any; preview: string }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; result?: any; error?: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

// Map the in-app model key to the OpenRouter model identifier.
const AI_MODEL_MAP: Record<string, string> = {
  'gpt-3.5': 'openai/gpt-3.5-turbo',
  'gpt-4':   'openai/gpt-4-turbo',
  'gpt-4o':  'openai/gpt-4o',
};

interface StreamArgs {
  message?: string;
  conversationId?: string;
  confirm?: { tool_call_id: string; tool_name: string; args: any; approve: boolean };
  /** When set, overrides the default model on the Edge Function side. */
  preferredModel?: 'gpt-3.5' | 'gpt-4' | 'gpt-4o';
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
}

/** Open a single SSE stream and return a Promise that resolves on "done". */
function openStream(
  jwt: string,
  payload: Record<string, unknown>,
  onEvent: StreamArgs['onEvent'],
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const es = new EventSource(ECHO_AI_URL, {
      method: 'POST',
      headers: {
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

    es.addEventListener('message', (event: any) => {
      if (!event.data || event.data === '[DONE]') return;
      try {
        const parsed: EchoAIEvent = JSON.parse(event.data);
        onEvent(parsed);
        if (parsed.type === 'done') {
          cleanup();
          resolve();
        } else if (parsed.type === 'error') {
          cleanup();
          reject(new Error(parsed.message));
        }
      } catch {
        // ignore malformed SSE lines
      }
    });

    es.addEventListener('error', (event: any) => {
      cleanup();
      const status: number | undefined = event?.xhrStatus;
      const rawMsg: string | undefined = event?.message;
      const msg = parseErrorMessage(rawMsg, status);
      console.error(`[EchoAI] SSE error — status:${status ?? 'N/A'} raw:${rawMsg ?? '(empty)'}`);
      // Tag 401s so the caller can decide whether to refresh + retry.
      const err: StreamError = new Error(msg);
      err.status = status;
      reject(err);
    });
  });
}

export async function streamEchoAI({
  message,
  conversationId,
  confirm,
  preferredModel,
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
  if (preferredModel && AI_MODEL_MAP[preferredModel]) {
    payload.preferred_model = AI_MODEL_MAP[preferredModel];
  }

  try {
    await openStream(jwt, payload, onEvent);
  } catch (err: any) {
    // On 401: silently refresh the token and retry ONCE.
    if ((err as StreamError)?.status === 401) {
      console.warn('[EchoAI] 401 — attempting token refresh then retry');
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (!refreshErr && refreshed.session?.access_token) {
        await openStream(refreshed.session.access_token, payload, onEvent);
        return;
      }
      // Refresh failed — sign the user out so they hit the login screen.
      await supabase.auth.signOut();
      throw new Error('Your session expired — please sign in again');
    }
    throw err;
  }
}

// Legacy back-compat export. Drops tool events; only forwards text.
export const apiClient = {
  async sendMessage(
    message: string,
    onChunk: (chunk: string) => void,
  ): Promise<{ id: string; role: 'assistant'; content: string }> {
    let acc = '';
    await streamEchoAI({
      message,
      onEvent: (e) => {
        if (e.type === 'text_delta') {
          acc += e.delta;
          onChunk(acc);
        }
      },
    });
    return { id: Date.now().toString(), role: 'assistant', content: acc };
  },
};
