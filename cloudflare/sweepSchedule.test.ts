import { describe, expect, it, vi } from 'vitest';
import app from './index';

const U = '11111111-1111-4111-8111-111111111111';
const MB = 1024 * 1024;

function bucket(objects: { key: string; size: number }[]) {
  return {
    list: vi.fn(async () => ({ objects, truncated: false })),
    delete: vi.fn(async () => undefined),
  };
}

function run(env: Record<string, unknown>) {
  const waits: Promise<unknown>[] = [];
  (app as unknown as { scheduled: (e: unknown, env: unknown, ctx: unknown) => void }).scheduled(
    {},
    env,
    { waitUntil: (p: Promise<unknown>) => waits.push(p) },
  );
  return Promise.all(waits);
}

function envWith(enforce: string | undefined) {
  const echo = bucket([
    { key: `${U}/huge.mp4`, size: 200 * MB },
    { key: `${U}/ok.mp4`, size: 20 * MB },
    { key: 'downloads/echo-latest.apk', size: 190 * MB },
  ]);
  const avatars = bucket([{ key: `${U}/a.jpg`, size: 1 * MB }]);
  const empty = bucket([]);
  const env = {
    SIZE_SWEEP_ENFORCE: enforce,
    ECHO_MEDIA_BUCKET: echo,
    AVATARS_BUCKET: avatars,
    DM_MEDIA_BUCKET: empty,
    MINI_APP_MEDIA_BUCKET: empty,
    MARKETPLACE_PHOTOS_BUCKET: empty,
    LEARN_LECTURES_BUCKET: empty,
  };
  return { env, echo };
}

describe('scheduled size sweep', () => {
  it('is registered on the default export, which the Workers runtime reads', () => {
    expect(typeof (app as unknown as { scheduled?: unknown }).scheduled).toBe('function');
    expect(typeof app.request).toBe('function'); // still the Hono app the tests drive
  });

  it('only logs while SIZE_SWEEP_ENFORCE is not "true"', async () => {
    const { env, echo } = envWith(undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await run(env);
    expect(echo.delete).not.toHaveBeenCalled();
    expect(warn.mock.calls.flat().join('\n')).toContain('would delete echo-media/');
    warn.mockRestore();
  });

  it('deletes the oversized upload, and only that, once enforced', async () => {
    const { env, echo } = envWith('true');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await run(env);
    expect(echo.delete).toHaveBeenCalledTimes(1);
    expect(echo.delete).toHaveBeenCalledWith([`${U}/huge.mp4`]);
    vi.restoreAllMocks();
  });

  it('keeps sweeping the other buckets when one fails', async () => {
    const { env } = envWith('true');
    env.ECHO_MEDIA_BUCKET.list.mockRejectedValue(new Error('boom'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await run(env);
    expect(err.mock.calls.flat().join(' ')).toContain('echo-media failed');
    expect(log.mock.calls.flat().join('\n')).toContain('learn-lectures: scanned');
    vi.restoreAllMocks();
  });
});
