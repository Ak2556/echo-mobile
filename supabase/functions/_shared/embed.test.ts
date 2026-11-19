import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMBEDDING_DIM, cosine, embedText, embedViaGemini, embedViaOpenRouter, embeddingModel } from './embed';

vi.mock('./breaker.ts', () => ({
  guardedFetch: (_provider: string, input: string, init?: RequestInit) => fetch(input, init),
}));

const env: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
  vi.stubGlobal('Deno', { env: { get: (k: string) => env[k] } });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

const vec = (n = EMBEDDING_DIM, f = (i: number) => Math.sin(i + 1)) => Array.from({ length: n }, (_, i) => f(i));
const gemini = (values = vec()) => new Response(JSON.stringify({ embedding: { values } }), { status: 200 });
const openRouter = (values = vec()) => new Response(JSON.stringify({ data: [{ embedding: values }] }), { status: 200 });
const body = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

describe('embedText', () => {
  it('asks Google directly for gemini-embedding-001 at 768 dimensions, key in a header', async () => {
    env.GEMINI_API_KEY = 'g';
    env.OPENROUTER_API_KEY = 'o';
    const fetchMock = vi.fn().mockResolvedValue(gemini());
    vi.stubGlobal('fetch', fetchMock);
    await expect(embedText('hello')).resolves.toHaveLength(768);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent');
    expect(init.headers['x-goog-api-key']).toBe('g');
    expect(body(fetchMock.mock.calls[0])).toEqual({ content: { parts: [{ text: 'hello' }] }, outputDimensionality: 768 });
  });

  it('falls back to OpenRouter with the same model and size when Google fails', async () => {
    env.GEMINI_API_KEY = 'g';
    env.OPENROUTER_API_KEY = 'o';
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('quota', { status: 429 })).mockResolvedValueOnce(openRouter());
    vi.stubGlobal('fetch', fetchMock);
    await expect(embedText('hello')).resolves.toHaveLength(768);
    expect(fetchMock.mock.calls[1][0]).toBe('https://openrouter.ai/api/v1/embeddings');
    expect(body(fetchMock.mock.calls[1])).toEqual({ model: 'google/gemini-embedding-001', input: 'hello', dimensions: 768 });
  });

  it('uses OpenRouter alone when there is no Gemini key', async () => {
    env.OPENROUTER_API_KEY = 'o';
    const fetchMock = vi.fn().mockResolvedValue(openRouter());
    vi.stubGlobal('fetch', fetchMock);
    await embedText('x');
    expect(fetchMock.mock.calls[0][0]).toContain('openrouter.ai');
  });

  it('reports both failures when neither answers', async () => {
    env.GEMINI_API_KEY = 'g';
    env.OPENROUTER_API_KEY = 'o';
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response('no', { status: url.includes('openrouter') ? 402 : 503 }))));
    await expect(embedText('x')).rejects.toThrow(/Gemini embedding 503.*; OpenRouter embedding 402/);
  });

  it('refuses a vector of the wrong size rather than storing it in a vector(768) column', async () => {
    env.GEMINI_API_KEY = 'g';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(gemini(vec(3072))));
    await expect(embedText('x')).rejects.toThrow(/len=3072/);
  });

  it('honours EMBEDDING_MODEL and a full-length request', async () => {
    env.GEMINI_API_KEY = 'g';
    env.EMBEDDING_MODEL = 'google/gemini-embedding-002';
    const fetchMock = vi.fn().mockResolvedValue(gemini(vec(3072)));
    vi.stubGlobal('fetch', fetchMock);
    expect(embeddingModel()).toBe('google/gemini-embedding-002');
    await expect(embedViaGemini('x', { dims: null })).resolves.toHaveLength(3072);
    expect(fetchMock.mock.calls[0][0]).toContain('/models/gemini-embedding-002:embedContent');
    expect(body(fetchMock.mock.calls[0]).outputDimensionality).toBeUndefined();
  });

  it('throws without a key instead of calling out', async () => {
    await expect(embedViaGemini('x')).rejects.toThrow('GEMINI_API_KEY not configured');
    await expect(embedViaOpenRouter('x')).rejects.toThrow('OPENROUTER_API_KEY not configured');
    await expect(embedText('x')).rejects.toThrow(/No embedding provider/);
  });
});

describe('cosine', () => {
  it('ignores length, which is why stored vectors from either provider compare fine', () => {
    const a = vec();
    expect(cosine(a, a.map(v => v * 3))).toBeCloseTo(1, 10);
    expect(cosine(a, a.map(v => -v))).toBeCloseTo(-1, 10);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(Number.isNaN(cosine([1], [1, 2]))).toBe(true);
  });
});
