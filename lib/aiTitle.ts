import { streamEchoAI, EchoAIModel } from './api';

// Generate a short session title from the first user message. Streams via the
// existing edge function and accumulates text deltas. Falls back to a heuristic
// if the stream errors or yields nothing.
export async function generateSessionTitle(firstUserMessage: string, model?: EchoAIModel): Promise<string> {
  const fallback = heuristicTitle(firstUserMessage);
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL) return fallback;

  let acc = '';
  try {
    await streamEchoAI({
      preferredModel: model,
      message: `Title this conversation in at most 6 words. Output only the title, no quotes, no punctuation. Conversation start:\n\n${firstUserMessage.slice(0, 800)}`,
      onEvent: (e) => {
        if (e.type === 'text_delta') acc += e.delta;
      },
    });
  } catch {
    return fallback;
  }
  const cleaned = acc.trim().replace(/^["“]|["”]$/g, '').replace(/[\r\n].*$/, '').slice(0, 60);
  return cleaned || fallback;
}

function heuristicTitle(text: string): string {
  const stripped = text.trim().replace(/\s+/g, ' ');
  const words = stripped.split(' ').slice(0, 6).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1) || 'New Chat';
}
