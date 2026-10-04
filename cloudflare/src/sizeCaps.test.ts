import { describe, expect, it, vi } from 'vitest';
import { BUCKET_NAMES, OBJECT_SIZE_CAPS, USER_KEY, sweepOversized } from './sizeCaps';

const U = '11111111-1111-4111-8111-111111111111';
const MB = 1024 * 1024;

function bucket(pages: { key: string; size: number }[][]) {
  let i = 0;
  return {
    list: vi.fn(async () => {
      const objects = pages[i++] ?? [];
      return { objects, truncated: i < pages.length, cursor: `c${i}` };
    }),
    delete: vi.fn(async () => undefined),
  };
}

describe('sweepOversized', () => {
  it('deletes a user object over the cap and keeps one at or under it', async () => {
    const b = bucket([[
      { key: `${U}/big.mp4`, size: 60 * MB },
      { key: `${U}/edge.mp4`, size: 50 * MB },
      { key: `${U}/small.jpg`, size: 1 * MB },
    ]]);
    const r = await sweepOversized(b, 50 * MB, true);
    expect(b.delete).toHaveBeenCalledWith([`${U}/big.mp4`]);
    expect(r).toMatchObject({ scanned: 3, deleted: 1, oversized: [{ key: `${U}/big.mp4`, size: 60 * MB }] });
  });

  it('never touches operator objects, however large', async () => {
    // echo-media/downloads/echo-latest.apk is ~190 MB and sits in a capped bucket.
    const b = bucket([[{ key: 'downloads/echo-latest.apk', size: 190 * MB }, { key: 'notes.txt', size: 900 * MB }]]);
    const r = await sweepOversized(b, 55 * MB, true);
    expect(b.delete).not.toHaveBeenCalled();
    expect(r.oversized).toEqual([]);
  });

  it('reports without deleting when not enforcing', async () => {
    const b = bucket([[{ key: `${U}/big.mp4`, size: 60 * MB }]]);
    const r = await sweepOversized(b, 50 * MB, false);
    expect(b.delete).not.toHaveBeenCalled();
    expect(r).toMatchObject({ deleted: 0, oversized: [{ key: `${U}/big.mp4` }] });
  });

  it('pages through the whole bucket', async () => {
    const b = bucket([
      [{ key: `${U}/a`, size: 1 }],
      [{ key: `${U}/b`, size: 99 * MB }],
      [{ key: `${U}/c`, size: 1 }],
    ]);
    const r = await sweepOversized(b, 50 * MB, true);
    expect(b.list).toHaveBeenCalledTimes(3);
    expect(r).toMatchObject({ scanned: 3, deleted: 1 });
  });

  it('does not call delete for a clean page', async () => {
    const b = bucket([[{ key: `${U}/a`, size: 1 }]]);
    await sweepOversized(b, 50 * MB, true);
    expect(b.delete).not.toHaveBeenCalled();
  });
});

describe('caps', () => {
  it('has a ceiling for every bucket and nothing extra', () => {
    expect(Object.keys(OBJECT_SIZE_CAPS).sort()).toEqual([...BUCKET_NAMES].sort());
  });

  it('is never below what the app itself sends', () => {
    expect(OBJECT_SIZE_CAPS['echo-media']).toBeGreaterThanOrEqual(50 * MB); // ECHO_MEDIA_BUCKET_BYTES
    expect(OBJECT_SIZE_CAPS['learn-lectures']).toBeGreaterThanOrEqual(500 * MB); // MAX_LECTURE_BYTES
    expect(OBJECT_SIZE_CAPS.avatars).toBeGreaterThanOrEqual(2 * MB);
  });

  it('recognises user keys only', () => {
    expect(USER_KEY.test(`${U}/x.jpg`)).toBe(true);
    expect(USER_KEY.test('downloads/x.apk')).toBe(false);
    expect(USER_KEY.test(`${U}`)).toBe(false);
  });
});
