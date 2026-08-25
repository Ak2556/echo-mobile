import { describe, expect, it } from 'vitest';
import { normalizeAiMode, toolsForMode } from '../supabase/functions/echo-ai/mode';

const TOOLS = ['compose_post', 'follow_user', 'get_today_productivity'];

describe('normalizeAiMode', () => {
  it('takes the mode the client states', () => {
    expect(normalizeAiMode('ask')).toBe('ask');
    expect(normalizeAiMode('do')).toBe('do');
  });

  it('treats a missing mode as do, so installed clients keep their tools', () => {
    // The app in people's hands today sends no mode and has always had tools.
    // Defaulting absent to 'ask' would quietly disable the assistant's actions
    // for everyone who has not updated.
    for (const raw of [undefined, null, '']) {
      expect(normalizeAiMode(raw)).toBe('do');
    }
  });

  it('does not accept a mode it does not recognise as ask', () => {
    // Anything unrecognised behaves like an old client rather than silently
    // removing capability.
    for (const raw of ['ASK', 'chat', 'agent', 0, {}, true]) {
      expect(normalizeAiMode(raw)).toBe('do');
    }
  });
});

describe('toolsForMode', () => {
  it('offers nothing in ask mode', () => {
    expect(toolsForMode('ask', TOOLS)).toEqual([]);
  });

  it('offers every tool in do mode', () => {
    expect(toolsForMode('do', TOOLS)).toEqual(TOOLS);
  });

  it('never hands back the caller’s array to mutate', () => {
    const out = toolsForMode('do', TOOLS);
    out.push('injected');
    expect(TOOLS).toHaveLength(3);
  });
});
