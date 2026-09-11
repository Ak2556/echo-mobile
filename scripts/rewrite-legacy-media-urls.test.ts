import { describe, expect, it } from 'vitest';
import { normalizeLegacyMediaUrl } from '../lib/workerUrl';
import { buildDoBlock, planRewrites, rewriteUrl } from './rewrite-legacy-media-urls.mjs';

const OBJECT = 'https://eyokhisijabitzjiydmz.supabase.co/storage/v1/object';
const WORKER = 'https://echo-mobile.at3236129.workers.dev';
const ID = 'e036cc7b-5fbd-4833-b2ee-3c6a6cf54b61';

describe('rewriteUrl', () => {
  it.each([
    `${OBJECT}/public/echo-media/u1/1786519246345_0.jpg`,
    `${OBJECT}/public/avatars/u1/avatar.png?t=123`,
    `${OBJECT}/public/marketplace-photos/u1/1_0.jpg`,
    `${OBJECT}/public/mini-app-media/u1/notes/a%20b.jpg`,
    `${OBJECT}/public/dm-media/u1/x.jpg`,
    `${OBJECT}/public/verification/u1/selfie.jpg`,
    `${OBJECT}/sign/echo-media/u1/x.jpg?token=abc`,
    `${WORKER}/media/echo-media/u1/x.jpg`,
    'file:///tmp/x.jpg',
  ])('agrees with the client normaliser for %s', (url) => {
    expect(rewriteUrl(url)).toBe(normalizeLegacyMediaUrl(url));
  });
});

describe('planRewrites', () => {
  it('rewrites only the legacy elements of an array', () => {
    const kept = `${WORKER}/media/echo-media/u1/new.jpg`;
    const [plan] = planRewrites([
      { table: 'public_echoes', column: 'media_urls', id: ID, value: [`${OBJECT}/public/echo-media/u1/old.jpg`, kept] },
    ]);
    expect(plan.newValue).toEqual([`${WORKER}/media/echo-media/u1/old.jpg`, kept]);
    expect(plan.targets).toEqual([`${WORKER}/media/echo-media/u1/old.jpg`]);
  });

  it('drops rows with nothing it may rewrite', () => {
    expect(planRewrites([
      { table: 'profiles', column: 'avatar_url', id: ID, value: `${OBJECT}/public/verification/u1/selfie.jpg` },
    ])).toEqual([]);
  });
});

describe('buildDoBlock', () => {
  const plan = {
    table: 'profiles', column: 'avatar_url', id: ID,
    oldValue: `${OBJECT}/public/avatars/u1/it's.png`,
    newValue: `${WORKER}/media/avatars/u1/it's.png`,
  };

  it('guards each update on the value it read, so one concurrent edit aborts the block', () => {
    const sql = buildDoBlock([plan], { from: 'oldValue', to: 'newValue' });
    expect(sql).toContain(`set avatar_url = '${WORKER}/media/avatars/u1/it''s.png' where id = '${ID}' and avatar_url = '${OBJECT}/public/avatars/u1/it''s.png';`);
    expect(sql).toContain('if n <> 1 then raise exception');
  });

  it('reverts by swapping the direction', () => {
    const sql = buildDoBlock([plan], { from: 'newValue', to: 'oldValue' });
    expect(sql).toContain(`set avatar_url = '${OBJECT}/public/avatars/u1/it''s.png' where id = '${ID}' and avatar_url = '${WORKER}/media/avatars/u1/it''s.png';`);
  });

  it('writes arrays as text[]', () => {
    const sql = buildDoBlock([{ ...plan, table: 'public_echoes', column: 'media_urls', oldValue: ['a'], newValue: ['b'] }], { from: 'oldValue', to: 'newValue' });
    expect(sql).toContain(`set media_urls = array['b']::text[] where id = '${ID}' and media_urls = array['a']::text[];`);
  });

  it('refuses an id that is not a uuid, and a column it was not written for', () => {
    expect(() => buildDoBlock([{ ...plan, id: "1' or '1'='1" }], { from: 'oldValue', to: 'newValue' })).toThrow(/non-uuid/);
    expect(() => buildDoBlock([{ ...plan, column: 'bio' }], { from: 'oldValue', to: 'newValue' })).toThrow(/unknown column/);
  });
});
