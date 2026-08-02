// Shared types for the voice-control feature. Keep the intent list in sync with
// the server prompt in supabase/functions/voice-command/index.ts.

export const VOICE_INTENTS = [
  'navigate',
  'create_post',
  'open_daily_question',
  'search',
  'open_ai_chat',
  'set_language',
  'go_back',
  'read_feed',
  'help',
  'unknown',
] as const;

export type VoiceIntentName = (typeof VOICE_INTENTS)[number];

/** The structured result returned by the voice-command edge function. */
export interface VoiceResult {
  transcript: string;
  locale: string;
  intent: VoiceIntentName;
  args: Record<string, unknown>;
  reply: string;
}

/** State machine for the voice controller UI. */
export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'done' | 'error';
