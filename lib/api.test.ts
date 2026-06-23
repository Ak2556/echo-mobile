import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

// react-native-sse is an RN-only module; mock it before importing the SUT.
// so vitest in node doesn't choke trying to load native bridges.
vi.mock('react-native-sse', () => ({
  default: class FakeEventSource {
    constructor(_url: string, _opts: unknown) {}
    addEventListener() {}
    removeAllEventListeners() {}
    close() {}
  },
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      refreshSession: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

import { isRateLimitError, normalizeEchoAIError, parseEchoAISSEPayload, streamEchoAI } from './api';
import { supabase } from './supabase';

const getSession = supabase.auth.getSession as unknown as Mock;
const refreshSession = supabase.auth.refreshSession as unknown as Mock;

describe('isRateLimitError', () => {
  it('matches the friendly Edge Function message', () => {
    expect(isRateLimitError('Rate limit reached. Try again in an hour.')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isRateLimitError('rate LIMIT reached for you')).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isRateLimitError('Network unreachable')).toBe(false);
    expect(isRateLimitError('OpenRouter 500: server down')).toBe(false);
  });

  it('handles null / undefined / empty without throwing', () => {
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
    expect(isRateLimitError('')).toBe(false);
  });
});

describe('normalizeEchoAIError', () => {
  it('passes plain text through unchanged', () => {
    expect(normalizeEchoAIError('Boom')).toBe('Boom');
  });

  it('extracts the inner JSON message field', () => {
    const raw = '{"error":{"message":"Quota exceeded"}}';
    expect(normalizeEchoAIError(raw)).toBe('Quota exceeded');
  });

  it('preserves the OpenRouter status prefix', () => {
    const raw = 'OpenRouter 429: {"error":{"message":"Slow down"}}';
    expect(normalizeEchoAIError(raw)).toBe('OpenRouter 429: Slow down');
  });
});

describe('parseEchoAISSEPayload', () => {
  it('dispatches text and done events from a complete SSE payload', () => {
    const events: unknown[] = [];

    parseEchoAISSEPayload(
      [
        'data: {"type":"text_delta","delta":"Hi"}',
        '',
        'data: {"type":"done"}',
        '',
      ].join('\n'),
      event => events.push(event),
    );

    expect(events).toEqual([
      { type: 'text_delta', delta: 'Hi' },
      { type: 'done' },
    ]);
  });

  it('throws normalized errors from SSE error events', () => {
    expect(() => {
      parseEchoAISSEPayload(
        'data: {"type":"error","message":"OpenRouter 429: {\\"error\\":{\\"message\\":\\"Slow down\\"}}"}\n\n',
        () => undefined,
      );
    }).toThrow('OpenRouter 429: Slow down');
  });
});

describe('streamEchoAI', () => {
  beforeEach(() => {
    getSession.mockReset();
    refreshSession.mockReset();
  });

  it('throws a clear error when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    refreshSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(
      streamEchoAI({ message: 'hi', onEvent: () => undefined }),
    ).rejects.toThrow(/Not signed in/i);
  });

  it('propagates getSession errors as authentication failures', async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: new Error('network down'),
    });
    refreshSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(
      streamEchoAI({ message: 'hi', onEvent: () => undefined }),
    ).rejects.toThrow(/Not signed in/i);
  });
});
