import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_STANDIN_MODELS,
  OPENROUTER_DEFAULT_MAX_TOKENS,
  OPENROUTER_STANDIN_MODEL,
  PROVIDER_TIMEOUT_MS,
  chatCompletion,
  forgetRetiredModels,
  geminiModelId,
  standInModels,
} from './aiChat';

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
  forgetRetiredModels();
});
afterEach(() => vi.unstubAllGlobals());

const req = { model: 'google/gemini-2.5-flash', messages: [{ role: 'user', content: 'hi' }], title: 'Test' };

describe('chatCompletion', () => {
  it('calls Google directly with the prefix stripped, and never touches OpenRouter on success', async () => {
    env.GEMINI_API_KEY = 'g';
    env.OPENROUTER_API_KEY = 'o';
    const fetchMock = vi.fn().mockResolvedValue(ok({ content: 'hello' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(chatCompletion(req)).resolves.toEqual({ content: 'hello', tool_calls: undefined, model: 'gemini-2.5-flash' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(JSON.parse(init.body).model).toBe('gemini-2.5-flash');
    expect(JSON.parse(init.body).provider).toBeUndefined();
  });

  it('tells the caller why Gemini did not answer when OpenRouter did, for monitoring', async () => {
    env.GEMINI_API_KEY = 'g';
    env.OPENROUTER_API_KEY = 'o';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('quota', { status: 429 }))
      .mockResolvedValueOnce(ok({ content: 'x' })));
    await expect(chatCompletion(req)).resolves.toMatchObject({ fallbackReason: 'Gemini 429 (gemini-2.5-flash): quota' });
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

// The 2026-11-19 outage: Google began answering 404 "no longer available to new
// users" for gemini-2.5-flash, and every assistant turn failed.
const retired = () => new Response(JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', message: 'This model models/gemini-2.5-flash is no longer available to new users.' } }), { status: 404 });
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

describe('retired Gemini models', () => {
  it('asks again on a current model when Google says the requested one is gone', async () => {
    env.GEMINI_API_KEY = 'g';
    env.OPENROUTER_API_KEY = 'o';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValueOnce(retired()).mockResolvedValueOnce(ok({ content: 'hi' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(chatCompletion(req)).resolves.toEqual({ content: 'hi', tool_calls: undefined, model: DEFAULT_STANDIN_MODELS[0] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('generativelanguage.googleapis.com');
    expect(bodyOf(fetchMock.mock.calls[1]).model).toBe(DEFAULT_STANDIN_MODELS[0]);
  });

  it('walks the list until a model answers', async () => {
    env.GEMINI_API_KEY = 'g';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(retired())
      .mockResolvedValueOnce(retired())
      .mockResolvedValueOnce(ok({ content: 'lite' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(chatCompletion(req)).resolves.toMatchObject({ content: 'lite', model: DEFAULT_STANDIN_MODELS[1] });
  });

  it('remembers a retired model so the next request does not ask for it again', async () => {
    env.GEMINI_API_KEY = 'g';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValueOnce(retired()).mockImplementation(() => Promise.resolve(ok({ content: 'x' })));
    vi.stubGlobal('fetch', fetchMock);
    await chatCompletion(req);
    await chatCompletion(req);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodyOf(fetchMock.mock.calls[2]).model).toBe(DEFAULT_STANDIN_MODELS[0]);
  });

  it('does not spend more requests on other models when the failure is quota, not retirement', async () => {
    env.GEMINI_API_KEY = 'g';
    env.OPENROUTER_API_KEY = 'o';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('quota', { status: 429 }))
      .mockResolvedValueOnce(ok({ content: 'or' }));
    vi.stubGlobal('fetch', fetchMock);
    await chatCompletion(req);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('openrouter.ai');
  });

  it('asks OpenRouter for its stand-in and a modest max_tokens once Google has retired the model', async () => {
    env.GEMINI_API_KEY = 'g';
    env.OPENROUTER_API_KEY = 'o';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn((url: string) => Promise.resolve(url.includes('openrouter.ai') ? ok({ content: 'or' }) : retired()));
    vi.stubGlobal('fetch', fetchMock);
    await expect(chatCompletion(req)).resolves.toMatchObject({ content: 'or' });
    const orCall = fetchMock.mock.calls.find(c => String(c[0]).includes('openrouter.ai'))!;
    expect(bodyOf(orCall).model).toBe(OPENROUTER_STANDIN_MODEL);
    expect(bodyOf(orCall).max_tokens).toBe(OPENROUTER_DEFAULT_MAX_TOKENS);
  });

  it("keeps a caller's own max_tokens on OpenRouter", async () => {
    env.OPENROUTER_API_KEY = 'o';
    const fetchMock = vi.fn().mockResolvedValue(ok({ content: 'x' }));
    vi.stubGlobal('fetch', fetchMock);
    await chatCompletion({ ...req, max_tokens: 200 });
    expect(bodyOf(fetchMock.mock.calls[0]).max_tokens).toBe(200);
  });

  it('names every model it tried when all are retired and there is no fallback', async () => {
    env.GEMINI_API_KEY = 'g';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(retired())));
    await expect(chatCompletion(req)).rejects.toThrow(/Gemini 404 \(gemini-2\.5-flash-lite\)/);
  });

  it('takes the stand-in list from GEMINI_STANDIN_MODELS without a deploy', () => {
    env.GEMINI_STANDIN_MODELS = ' google/gemini-9-flash , gemini-2.5-flash ';
    expect(standInModels('gemini-2.5-flash')).toEqual(['gemini-9-flash']);
  });
});
