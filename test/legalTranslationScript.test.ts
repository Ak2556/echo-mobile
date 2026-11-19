import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(process.cwd(), 'scripts/generate-legal-translations.mjs'), 'utf8');

describe('generate-legal-translations.mjs', () => {
  it('defaults to a current model, not the 2.5 generation Google is retiring', () => {
    const model = src.match(/^const MODEL = .*$/m)?.[0] ?? '';
    // It defaulted to google/gemini-2.5-pro. Google's API stopped serving the
    // 2.5 flash/pro models to this project on 2026-11-19.
    expect(model).toMatch(/LEGAL_TRANSLATE_MODEL/);
    expect(model).not.toMatch(/gemini-2\.5-/);
  });

  it('caps each reply, so OpenRouter does not reserve the whole output window', () => {
    // Unset, OpenRouter reserves the model's full output (65,536 tokens) against
    // the balance and answers 402 when the balance is small.
    expect(src).toMatch(/max_tokens:\s*\w+/);
  });

  it('refuses a reply the cap cut short instead of writing half a clause', () => {
    expect(src).toMatch(/finish_reason\s*===\s*'length'/);
  });
});
