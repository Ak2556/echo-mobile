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

interface StreamArgs {
  message?: string;
  conversationId?: string;
  language?: string;
  confirm?: { tool_call_id: string; tool_name: string; args: any; approve: boolean };
  onEvent: (event: EchoAIEvent) => void;
}

export async function streamEchoAI({
  message,
  conversationId,
  language,
  confirm,
  onEvent,
}: StreamArgs): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const jwt = session?.access_token;
  if (!jwt) throw new Error('Not signed in');

  const body: Record<string, unknown> = {};
  if (message) body.message = message;
  if (conversationId) body.conversation_id = conversationId;
  if (confirm) body.confirm = confirm;
  if (language) body.language = language;

  return new Promise<void>((resolve, reject) => {
    const es = new EventSource(ECHO_AI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
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
        // ignore malformed lines
      }
    });

    es.addEventListener('error', (event: any) => {
      cleanup();
      reject(new Error(event?.message || 'SSE connection error'));
    });
  });
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
