import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// index.ts is a Deno file with URL imports, so it can't be imported here. These
// tests read it instead, the way the repo's other source-shape guards do.
const src = readFileSync(join(__dirname, 'index.ts'), 'utf8');
const handler = src.slice(src.indexOf('async function handleRequest'), src.indexOf('async function runAgentLoop'));
const at = (needle: string) => handler.indexOf(needle);

describe('echo-ai: every path to the model is metered', () => {
  it('calls the limiter exactly once, in the handler', () => {
    expect(handler.match(/checkAndIncrementRateLimit\(adminSupabase/g)).toHaveLength(1);
  });

  it('meters before any branch that can reach the model', () => {
    // confirm and local_result used to skip the limiter and run up to six model
    // calls each, so a scripted client had unmetered access to the shared Gemini
    // quota that moderation also draws on.
    const meter = at('checkAndIncrementRateLimit(adminSupabase');
    expect(meter).toBeGreaterThan(-1);
    for (const reach of ['recordLocalToolResultAndContinue(', 'runToolAndContinue(', 'runAgentLoop(']) {
      expect(at(reach), reach).toBeGreaterThan(meter);
    }
  });

  it('meters before it creates a conversation row', () => {
    expect(at('checkAndIncrementRateLimit(adminSupabase')).toBeLessThan(at('getOrCreateConversation('));
  });

  it('checks the tool call is pending before confirm or local_result run anything', () => {
    const check = at('findPendingToolCall(');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(at('recordLocalToolResultAndContinue('));
    expect(check).toBeLessThan(at('runToolAndContinue('));
  });

  it('does not close the stream itself, because the finally block already does', () => {
    const between = handler.slice(at('checkAndIncrementRateLimit(adminSupabase'), at('getOrCreateConversation('));
    expect(between).not.toContain('controller.close()');
  });
});
