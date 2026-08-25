// Which of the assistant's two modes a request is in.
//
//   ask — Echo talks and never acts. No tools reach the model at all, so it
//         cannot decide to post, follow or log anything on your behalf.
//   do  — the 34 tools are offered. Writes still pause on a confirm card;
//         read-only tools still run on their own.
//
// The split is a product decision rather than a safety mechanism — the confirm
// cards were already there — but it also removes 34 tool schemas from every
// request in ask mode, which is most of the prompt on a short question.
//
// Kept free of Deno globals so it can be unit-tested from the main suite.

export type AiMode = 'ask' | 'do';

/**
 * Read the mode off a request body.
 *
 * A missing mode means 'do', deliberately. Clients already in the wild send no
 * mode at all and have always had tools available; defaulting them to 'ask'
 * would silently take the assistant's hands away on an app people are already
 * using. The *screen* opens in ask — that is the client's default, and the
 * client always states its mode explicitly.
 */
export function normalizeAiMode(raw: unknown): AiMode {
  return raw === 'ask' ? 'ask' : 'do';
}

/** The tools to offer for a mode. Empty in ask mode. */
export function toolsForMode<T>(mode: AiMode, tools: readonly T[]): T[] {
  return mode === 'ask' ? [] : [...tools];
}
