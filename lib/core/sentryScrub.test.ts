import { describe, expect, it } from 'vitest';
import { redact, scrubBreadcrumb, scrubEvent } from './sentryScrub';

const UID = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
// Fabricated test fixture: {"alg":"HS256"}.{"sub":"123"}."signature-value" — not a credential.
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLXZhbHVl'; // ggignore

describe('redact', () => {
  it('masks emails, tokens and ids inside free text', () => {
    const out = redact(`user ${UID} (aena@example.com) sent Bearer ${JWT}`);
    expect(out).toBe('user [id] ([email]) sent Bearer [token]');
  });

  it('drops the query string from URLs, where PostgREST puts its filters', () => {
    const url = `https://eyokhisijabitzjiydmz.supabase.co/rest/v1/profiles?username=eq.aena&id=eq.${UID}`;
    expect(redact(url)).toBe('https://eyokhisijabitzjiydmz.supabase.co/rest/v1/profiles?[query]');
  });

  it('leaves ordinary text alone', () => {
    expect(redact('Network request failed')).toBe('Network request failed');
  });
});

describe('scrubBreadcrumb', () => {
  it('cleans an HTTP breadcrumb URL', () => {
    const b = scrubBreadcrumb({
      type: 'http',
      category: 'fetch',
      data: { url: `https://x.supabase.co/storage/v1/object/media/${UID}/a.jpg?token=${JWT}`, method: 'GET', status_code: 200 },
    });
    expect(b?.data).toEqual({ url: 'https://x.supabase.co/storage/v1/object/media/[id]/a.jpg?[query]', method: 'GET', status_code: 200 });
  });

  it('drops raw console arguments but keeps the redacted message', () => {
    const b = scrubBreadcrumb({ category: 'console', message: 'signed in aena@example.com', data: { arguments: [{ email: 'aena@example.com' }], logger: 'console' } });
    expect(b?.message).toBe('signed in [email]');
    expect(b?.data).toEqual({ logger: 'console' });
  });
});

describe('scrubEvent', () => {
  it('keeps the user id but nothing else that identifies the person', () => {
    const e = scrubEvent({ user: { id: UID, email: 'a@b.co', ip_address: '1.2.3.4', username: 'aena' } });
    expect(e.user).toEqual({ id: UID });
  });

  it('redacts exception messages, request URLs and extra', () => {
    const e = scrubEvent({
      message: 'failed for a@b.co',
      exception: { values: [{ type: 'Error', value: 'Key (email)=(a@b.co) already exists' }] },
      request: { url: 'https://x.co/rest/v1/dm?peer=eq.1' },
      extra: { nested: { note: `token ${JWT}` }, count: 3 },
    });
    expect(e.message).toBe('failed for [email]');
    expect(e.exception?.values?.[0].value).toBe('Key (email)=([email]) already exists');
    expect(e.request?.url).toBe('https://x.co/rest/v1/dm?[query]');
    expect(e.extra).toEqual({ nested: { note: 'token [token]' }, count: 3 });
  });

  it('redacts request URLs named in performance spans', () => {
    const e = scrubEvent({ spans: [{ description: `GET https://x.co/rest/v1/dm?peer=eq.${UID}`, data: { 'http.url': 'https://x.co/a?b=c' } }] });
    expect(e.spans?.[0]).toEqual({ description: 'GET https://x.co/rest/v1/dm?[query]', data: { 'http.url': 'https://x.co/a?[query]' } });
  });
});
