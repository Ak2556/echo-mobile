// Shared types for the voice-control feature. Keep the intent list in sync with
// the server prompt in supabase/functions/voice-command/index.ts.

export const VOICE_INTENTS = [
  'navigate',          // args.destination
  'open_mini_app',     // args.app — open a tool (pomodoro, habits, notes…)
  'create_post',       // args.text
  'open_daily_question',
  'search',            // args.query
  'open_ai_chat',      // args.prompt
  'set_feed',          // args.scope — for you / trending / following / latest
  'set_language',      // args.language
  'set_theme',         // args.theme — dark / light
  'read_feed',
  'read_notifications',
  'go_back',
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
