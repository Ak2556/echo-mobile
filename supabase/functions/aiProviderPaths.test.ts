import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Chat model calls go through _shared/aiChat.chatCompletion and nowhere else.
 *
 * On 2026-11-19 Google stopped serving gemini-2.5-flash to this project. The
 * shared client learned to retry on a current model and to send OpenRouter a
 * max_tokens it can afford; five functions that called OpenRouter themselves
 * (mini-app coach, rewrite, fingerprint, translate, identity check) got
 * neither, and every one of them failed. A new direct call would quietly
 * reopen that hole, so this fails on one.
 *
 * Allowed, each for a reason the shared client does not cover:
 *   voice-command        sends audio to Gemini's native endpoint.
 *   embed-echo/moderation image moderation, already capped at 200 tokens on
 *                         a model Google still serves.
 * Embedding endpoints (/embeddings) are a different API and are not matched.
 */
const ALLOWED = new Set(['voice-command/index.ts', 'embed-echo/moderation.ts']);
const DIRECT_CHAT = /openrouter\.ai\/api\/v1\/chat\/completions|generativelanguage\.googleapis\.com/;

const ROOT = join(import.meta.dirname!, '.');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === '_shared' ? [] : sources(path);
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('AI provider paths', () => {
  it('no edge function calls a chat model except through _shared/aiChat', () => {
    const offenders = sources(ROOT)
      .map(p => relative(ROOT, p))
      .filter(rel => !ALLOWED.has(rel) && DIRECT_CHAT.test(readFileSync(join(ROOT, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the allowlist names files that still exist and still need it', () => {
    for (const rel of ALLOWED) {
      expect(DIRECT_CHAT.test(readFileSync(join(ROOT, rel), 'utf8')), rel).toBe(true);
    }
  });
});
