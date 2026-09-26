import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A sealed DM's plaintext exists only on the participants' devices. The DM
 * screen has three features that send message text to the server (translate,
 * and two echo-ai prompts built from the conversation), and each would put
 * that plaintext exactly where end-to-end encryption says it cannot be.
 *
 * These read the screen source, like chatRenderer.test, because the guards are
 * one-line filters that are easy to drop in a refactor.
 */
const src = readFileSync(resolve(__dirname, '../app/messages/[id].tsx'), 'utf8');

describe('sealed DMs never reach a server-side model', () => {
  it('translation skips sealed messages', () => {
    expect(src).toMatch(/const handleTranslate = useCallback\(async \(msg: NormalizedMessage\) => \{[\s\S]{0,200}?if \(!msg\.content \|\| msg\.encrypted\) return;/);
  });

  it('smart-reply and catch-up transcripts are built from plaintext messages only', () => {
    expect(src).toMatch(/const recent = messages\.filter\(m => [^)]*!m\.encrypted\)/);
    expect(src).toMatch(/const unreadPartnerMsgs = useMemo\(\(\) => \{[\s\S]*?\.filter\(m => [^)]*!m\.encrypted\)/);
  });

  it('a new echo-ai call on this screen gets reviewed against E2EE', () => {
    // smart reply, catch-up, translate, and polishDraft (the user's own unsent
    // draft, sent only when they ask for a rewrite). A fifth call must decide
    // whether it can see sealed content, then update this.
    expect(src.match(/\bstreamEchoAI\(/g)?.length).toBe(4);
  });
});
