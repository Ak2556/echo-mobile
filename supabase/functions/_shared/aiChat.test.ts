import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROVIDER_TIMEOUT_MS, chatCompletion, geminiModelId } from './aiChat';

// The breaker keeps its state in Postgres through supabase-js (an esm.sh
// import vitest cannot load). Here it is a pass-through, so these tests see
// the provider calls exactly as made; breakerPolicy.test covers the breaker.
vi.mock('./breaker.ts', () => ({
  guardedFetch: (_provider: string, input: string, init?: RequestInit) => fetch(input, init),
}));

const env: Record<string, string> = {};
const ok = (message: unknown) => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
  vi.stubGlobal('Deno', { env: { get: (k: string) => env[k] } });
});
afterEach(() => vi.unstubAllGlobals());

const req = { model: 'google/gemini-2.5-flash', messages: [{ role: 'user', content: 'hi' }], title: 'Test' };

describe('chatCompletion', () => {
  it('calls Google directly with the prefix stripped, and never touches OpenRouter on success', async () => {
    env.GEMINI_API_KEY = 'g';
    env.OPENROUTER_API_KEY = 'o';
    const fetchMock = vi.fn().mockResolvedValue(ok({ content: 'hello' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(chatCompletion(req)).resolves.toEqual({ content: 'hello', tool_calls: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(JSON.parse(init.body).model).toBe('gemini-2.5-flash');
    expect(JSON.parse(init.body).provider).toBeUndefined();
  });

  it('falls back to OpenRouter when Google refuses', async () => {
    env.GEMINI_API_KEY = 'g';
    env.OPENROUTER_API_KEY = 'o';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('quota', { status: 429 }))
      .mockResolvedValueOnce(ok({ content: 'from openrouter' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(chatCompletion(req)).resolves.toMatchObject({ content: 'from openrouter' });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toContain('openrouter.ai');
    expect(JSON.parse(init.body).model).toBe('google/gemini-2.5-flash');
  });

  it('reports both failures when neither provider answers', async () => {
    env.GEMINI_API_KEY = 'g';
    env.OPENROUTER_API_KEY = 'o';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('quota', { status: 429 }))
      .mockResolvedValueOnce(new Response('no credits', { status: 402 })));

    await expect(chatCompletion(req)).rejects.toThrow(/Gemini 429.*OpenRouter 402/);
  });

  it('uses OpenRouter alone when there is no Gemini key', async () => {
    env.OPENROUTER_API_KEY = 'o';
    const fetchMock = vi.fn().mockResolvedValue(ok({ content: 'x' }));
    vi.stubGlobal('fetch', fetchMock);
    await chatCompletion(req);
    expect(fetchMock.mock.calls[0][0]).toContain('openrouter.ai');
  });

  it('gives tool calls an id when the provider leaves it out', async () => {
    env.GEMINI_API_KEY = 'g';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({
      content: null,
      tool_calls: [{ id: '', type: 'function', function: { name: 'search', arguments: '{}' } }],
    })));
    const out = await chatCompletion({ ...req, tools: [{ type: 'function', function: { name: 'search' } }] });
    expect(out.content).toBe('');
    expect(out.tool_calls?.[0].id).toMatch(/^call_/);
  });
});

describe('geminiModelId', () => {
  it('drops only the OpenRouter vendor prefix', () => {
    expect(geminiModelId('google/gemini-2.5-flash-lite')).toBe('gemini-2.5-flash-lite');
    expect(geminiModelId('gemini-2.5-pro')).toBe('gemini-2.5-pro');
  });
});

// A provider that accepts the connection and never answers; it only ends when its signal fires.
const hangs = () => vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_res, rej) => {
  init.signal?.addEventListener('abort', () => rej(init.signal!.reason));
}));

describe('chatCompletion timeouts', () => {
  it('gives every attempt a 25 second limit by default', async () => {
    env.GEMINI_API_KEY = 'g';
    const fetchMock = vi.fn().mockResolvedValue(ok({ content: 'hi' }));
    vi.stubGlobal('fetch', fetchMock);
    await chatCompletion(req);
    expect(PROVIDER_TIMEOUT_MS).toBe(25_000);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('falls back to OpenRouter when Google stalls', async () => {
    env.GEMINI_API_KEY = 'g';
    env.OPENROUTER_API_KEY = 'o';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stalled = hangs();
    const fetchMock = vi.fn((url: string, init: RequestInit) =>
      url.includes('openrouter.ai') ? Promise.resolve(ok({ content: 'from openrouter' })) : stalled(url, init));
    vi.stubGlobal('fetch', fetchMock);

    const started = Date.now();
    await expect(chatCompletion({ ...req, timeoutMs: 30 })).resolves.toMatchObject({ content: 'from openrouter' });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports both timeouts when neither provider answers, and does so promptly', async () => {
    env.GEMINI_API_KEY = 'g';
    env.OPENROUTER_API_KEY = 'o';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', hangs());

    const started = Date.now();
    await expect(chatCompletion({ ...req, timeoutMs: 30 })).rejects.toThrow(/Gemini: no answer within .*; OpenRouter: no answer within/);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('times out OpenRouter alone when there is no Gemini key', async () => {
    env.OPENROUTER_API_KEY = 'o';
    vi.stubGlobal('fetch', hangs());
    await expect(chatCompletion({ ...req, timeoutMs: 30 })).rejects.toThrow(/^OpenRouter: no answer within/);
  });

  it('does not retry on the other provider when the caller itself aborts', async () => {
    env.GEMINI_API_KEY = 'g';
    env.OPENROUTER_API_KEY = 'o';
    const stalled = hangs();
    vi.stubGlobal('fetch', stalled);
    const caller = new AbortController();
    const pending = chatCompletion({ ...req, signal: caller.signal, timeoutMs: 5000 });
    setTimeout(() => caller.abort(), 20);
    await expect(pending).rejects.toBeTruthy();
    expect(stalled).toHaveBeenCalledTimes(1);
  });
});
