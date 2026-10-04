import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  INLINE_MAX_BYTES,
  MAX_VIDEO_BYTES,
  blockReason,
  extractGeminiText,
  fileRequestBody,
  inlineRequestBody,
  toBase64,
  videoModerationEnabled,
  videoRoute,
} from '../supabase/functions/embed-echo/videoModeration';
import { videoMimeType } from '../supabase/functions/embed-echo/mediaKinds';
import { parseVerdict } from '../supabase/functions/embed-echo/verdict';

describe('videoMimeType', () => {
  it('maps the containers Echo clients produce', () => {
    expect(videoMimeType('https://cdn.example.com/echo-media/u/1_video.mp4')).toBe('video/mp4');
    expect(videoMimeType('https://cdn.example.com/a.MOV?x=1')).toBe('video/quicktime');
    expect(videoMimeType('https://cdn.example.com/a.m4v')).toBe('video/mp4');
    expect(videoMimeType('https://cdn.example.com/a.webm#t=3')).toBe('video/webm');
  });
  it('refuses what Gemini cannot read, rather than guessing', () => {
    expect(videoMimeType('https://cdn.example.com/clip.m3u8')).toBeNull();
    expect(videoMimeType('https://cdn.example.com/clip.mkv')).toBeNull();
    expect(videoMimeType('https://cdn.example.com/asset/9f2b1c')).toBeNull();
    expect(videoMimeType('')).toBeNull();
  });
});

describe('videoRoute', () => {
  it('sends small clips inline and larger ones through the Files API', () => {
    expect(videoRoute(1024)).toBe('inline');
    expect(videoRoute(INLINE_MAX_BYTES)).toBe('inline');
    expect(videoRoute(INLINE_MAX_BYTES + 1)).toBe('files');
    expect(videoRoute(MAX_VIDEO_BYTES)).toBe('files');
  });
  it('leaves room for base64 inside the 20 MB inline request limit', () => {
    expect(Math.ceil((INLINE_MAX_BYTES * 4) / 3)).toBeLessThan(20 * 1024 * 1024);
  });
  it('hides a file larger than the bucket could have accepted', () => {
    expect(videoRoute(MAX_VIDEO_BYTES + 1)).toBe('too_large');
  });
  it('treats an unknown size as the safe (Files API) path, not as empty', () => {
    expect(videoRoute(0)).toBe('files');
    expect(videoRoute(Number.NaN)).toBe('files');
  });
});

describe('videoModerationEnabled', () => {
  it('is off unless explicitly turned on', () => {
    expect(videoModerationEnabled(undefined)).toBe(false);
    expect(videoModerationEnabled(null)).toBe(false);
    expect(videoModerationEnabled('')).toBe(false);
    expect(videoModerationEnabled('off')).toBe(false);
    expect(videoModerationEnabled('maybe')).toBe(false);
  });
  it('accepts the usual spellings of on', () => {
    for (const v of ['on', 'ON', ' true ', '1', 'yes']) expect(videoModerationEnabled(v)).toBe(true);
  });
});

describe('toBase64', () => {
  it('matches Buffer for small and chunk-crossing inputs', () => {
    for (const n of [0, 1, 3, 100, 0x8000 - 1, 0x8000, 0x8000 + 5, 100_000]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 31) % 256);
      expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});

describe('request bodies', () => {
  const common = { systemPrompt: 'classify', mimeType: 'video/mp4' };
  it('builds the inline shape', () => {
    const b = inlineRequestBody({ ...common, base64: 'QUJD' });
    expect(b.contents[0].parts[0]).toEqual({ inline_data: { mime_type: 'video/mp4', data: 'QUJD' } });
    expect(b.systemInstruction.parts[0].text).toBe('classify');
    expect(b.generationConfig).toMatchObject({ temperature: 0, responseMimeType: 'application/json' });
  });
  it('builds the Files API shape', () => {
    const b = fileRequestBody({ ...common, fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc' });
    expect(b.contents[0].parts[0]).toEqual({
      file_data: { mime_type: 'video/mp4', file_uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc' },
    });
  });
});

describe('reading the response', () => {
  it('joins the text parts of the first candidate', () => {
    const json = { candidates: [{ content: { parts: [{ text: '{"flagged":' }, { text: 'false}' }] } }] };
    expect(extractGeminiText(json)).toBe('{"flagged":false}');
  });
  it('returns empty, never throws, on anything unexpected', () => {
    expect(extractGeminiText(null)).toBe('');
    expect(extractGeminiText({})).toBe('');
    expect(extractGeminiText({ candidates: [] })).toBe('');
    expect(extractGeminiText({ candidates: [{ content: {} }] })).toBe('');
  });
  it('surfaces a blocked prompt so it is not mistaken for a clean video', () => {
    expect(blockReason({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } })).toBe('PROHIBITED_CONTENT');
    expect(blockReason({ promptFeedback: {} })).toBeNull();
    expect(blockReason(null)).toBeNull();
  });
});

describe('parseVerdict', () => {
  it('reads a plain verdict', () => {
    expect(parseVerdict('{"flagged": true, "categories": ["violence"]}')).toEqual({ flagged: true, categories: ['violence'] });
    expect(parseVerdict('{"flagged": false, "categories": []}')).toEqual({ flagged: false, categories: [] });
  });
  it('recovers a verdict wrapped in fences or prose', () => {
    expect(parseVerdict('```json\n{"flagged": true, "categories": ["sexual"]}\n```')).toEqual({ flagged: true, categories: ['sexual'] });
  });
  it('returns null, never a pass, when there is no verdict', () => {
    expect(parseVerdict('')).toBeNull();
    expect(parseVerdict('sorry, I cannot help')).toBeNull();
    expect(parseVerdict('{not json}')).toBeNull();
  });
  it('only flags on a literal true', () => {
    expect(parseVerdict('{"flagged": "true", "categories": []}')?.flagged).toBe(false);
  });
});

describe('judge wiring', () => {
  const judge = readFileSync('supabase/functions/embed-echo/judge.ts', 'utf8');
  const moderation = readFileSync('supabase/functions/embed-echo/moderation.ts', 'utf8');

  it('is gated by VIDEO_MODERATION, read per call, so a deploy cannot strand video posts', () => {
    expect(judge).toMatch(/videoModerationEnabled\(Deno\.env\.get\("VIDEO_MODERATION"\)\)/);
    expect(judge).not.toMatch(/const VIDEO_MODERATION\s*=/);
  });
  it('leaves a post pending, not published, when the video gate cannot decide', () => {
    expect(judge).toMatch(/video moderation unavailable[\s\S]{0,120}return \{ kind: "unavailable" \}/);
  });
  it('hides a post carrying more videos than the gate will judge', () => {
    expect(judge).toMatch(/video:too_many/);
  });
  it('treats a blocked or unparseable video verdict as not-clean', () => {
    expect(moderation).toMatch(/blocked:\$\{blocked\}/);
    expect(moderation).toMatch(/video: unparseable verdict/);
  });
  it('always cleans up the uploaded file', () => {
    expect(moderation).toMatch(/method: "DELETE"/);
  });
});
