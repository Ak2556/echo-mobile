import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetRetiredModels } from '../_shared/aiChat';
import { VOICE_MAX_TOKENS, interpretAudio, interpretTranscript } from './models';

vi.mock('../_shared/breaker.ts', () => ({
  guardedFetch: (_provider: string, input: string, init?: RequestInit) => fetch(input, init),
}));

const env: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
  vi.stubGlobal('Deno', { env: { get: (k: string) => env[k] } });
  forgetRetiredModels();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

const INTENT = '{"transcript":"open notes","locale":"en","intent":"open_mini_app","args":{"app":"notes"},"reply":"Opening Notes"}';
const geminiOk = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: INTENT }] } }] }), { status: 200 });
const chatOk = () => new Response(JSON.stringify({ choices: [{ message: { content: INTENT } }] }), { status: 200 });
const status = (code: number) => new Response('{"error":{"code":' + code + '}}', { status: code });
const body = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

const providers = { geminiKey: 'g', geminiModel: 'gemini-flash-latest', openRouterKey: 'o', openRouterModel: 'google/gemini-2.5-flash-lite' };
const clip = { base64: 'AAAA', mime: 'audio/mp4', format: 'm4a' };

describe('interpretTranscript', () => {
  it('goes through the shared client: Gemini direct, JSON, a bounded answer', async () => {
    env.GEMINI_API_KEY = 'g';
    const fetchMock = vi.fn().mockResolvedValue(chatOk());
    vi.stubGlobal('fetch', fetchMock);
    await expect(interpretTranscript('sys', 'The user said: "open notes"', 'google/gemini-2.5-flash-lite')).resolves.toBe(INTENT);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com/v1beta/openai');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'gemini-2.5-flash-lite', max_tokens: VOICE_MAX_TOKENS, response_format: { type: 'json_object' } });
  });

  it('survives the retired model the voice secret pointed at on 2026-11-19', async () => {
    env.GEMINI_API_KEY = 'g';
    const fetchMock = vi.fn().mockResolvedValueOnce(status(404)).mockImplementation(() => Promise.resolve(chatOk()));
    vi.stubGlobal('fetch', fetchMock);
    await expect(interpretTranscript('sys', 'u', 'google/gemini-2.5-flash')).resolves.toBe(INTENT);
    expect(body(fetchMock.mock.calls[1]).model).not.toBe('gemini-2.5-flash');
  });
});

describe('interpretAudio', () => {
  it('sends the clip to Gemini natively, key in a header, never in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOk());
    vi.stubGlobal('fetch', fetchMock);
    await expect(interpretAudio(providers, 'sys', 'u', clip, 0)).resolves.toBe(INTENT);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent');
    expect(url).not.toContain('key=');
    expect(init.headers['x-goog-api-key']).toBe('g');
    expect(body(fetchMock.mock.calls[0]).contents[0].parts[1].inlineData).toEqual({ mimeType: 'audio/mp4', data: 'AAAA' });
  });

  it('moves to a stand-in model when Google says the configured one is gone', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(status(404)).mockResolvedValueOnce(geminiOk());
    vi.stubGlobal('fetch', fetchMock);
    await expect(interpretAudio(providers, 'sys', 'u', clip, 0)).resolves.toBe(INTENT);
    expect(fetchMock.mock.calls[1][0]).toContain('/models/gemini-2.5-flash-lite:generateContent');
  });

  it('falls back to OpenRouter when Gemini fails, which it never did before', async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(url.includes('openrouter.ai') ? chatOk() : status(500)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(interpretAudio(providers, 'sys', 'u', clip, 0)).resolves.toBe(INTENT);
    // Three tries on the 500 (backoff), no stand-ins (not a 404), then OpenRouter.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const or = body(fetchMock.mock.calls[3]);
    expect(or.model).toBe('google/gemini-2.5-flash-lite');
    expect(or.max_tokens).toBe(VOICE_MAX_TOKENS);
    expect(or.messages[1].content[1]).toEqual({ type: 'input_audio', input_audio: { data: 'AAAA', format: 'm4a' } });
  });

  it('uses OpenRouter alone when there is no Gemini key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatOk());
    vi.stubGlobal('fetch', fetchMock);
    await interpretAudio({ ...providers, geminiKey: '' }, 'sys', 'u', clip, 0);
    expect(fetchMock.mock.calls[0][0]).toContain('openrouter.ai');
  });

  it('reports every failure when nothing answers', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(status(url.includes('openrouter.ai') ? 402 : 403))));
    await expect(interpretAudio(providers, 'sys', 'u', clip, 0)).rejects.toThrow(/Gemini 403 \(gemini-flash-latest\).*; OpenRouter 402/);
  });
});
