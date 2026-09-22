import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatCompletion, geminiModelId } from './aiChat';

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
