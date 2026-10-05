import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const raw = readFileSync('supabase/migrations/20261005140000_post_fanout_batched.sql', 'utf8');
const flat = raw.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').replace(/\s+/g, ' ');

describe('batched post fan-out migration', () => {
  it('creates the queue the worker handler is registered for', () => {
    expect(flat).toMatch(/select pgmq\.create\('post_fanout'\)/);
    expect(readFileSync('supabase/functions/worker/handlers.ts', 'utf8')).toMatch(/post_fanout: postFanout/);
  });

  it('serves keyset batches from a composite index and drops its redundant prefix', () => {
    expect(flat).toMatch(/create index if not exists follows_following_follower_idx on public\.follows \(following_id, follower_id\)/);
    expect(flat).toMatch(/drop index if exists public\.follows_following_idx/);
  });

  it('makes a repeated batch a no-op', () => {
    expect(flat).toMatch(/create unique index if not exists notifications_friend_post_once on public\.notifications \(user_id, target_id\) where type = 'friend_post'/);
    expect(flat).toMatch(/on conflict do nothing/);
  });

  it('the post trigger only queues one job, and can never block the post', () => {
    const fn = flat.slice(flat.indexOf('create or replace function public.fn_friend_post_notify'), flat.indexOf('create or replace function public.fanout_friend_post_batch'));
    expect(fn).toMatch(/jobs_enqueue\('post_fanout'/);
    expect(fn).not.toMatch(/insert into public\.notifications/);
    expect(fn).toMatch(/exception when others then raise warning/);
  });

  it('skips the per-row worker kick inside a batch and kicks once per batch', () => {
    expect(flat).toMatch(/current_setting\('echo\.bulk_fanout', true\)/);
    expect(flat).toMatch(/perform pgmq\.send\('push'/);
    expect(flat).toMatch(/perform public\.jobs_kick\('push'\)/);
  });

  it('the SECURITY DEFINER batch function reads no echo content', () => {
    const fn = flat.slice(flat.indexOf('create or replace function public.fanout_friend_post_batch'), flat.indexOf('revoke all on function public.fanout_friend_post_batch'));
    expect(fn).not.toMatch(/public_echoes/);
    expect(flat).toMatch(/'author_id', new\.author_id/);
    expect(flat).toMatch(/'preview', left\(coalesce\(new\.prompt, new\.title, ''\), 140\)/);
  });

  it('the batch function is worker-only', () => {
    expect(flat).toMatch(/revoke all on function public\.fanout_friend_post_batch\(uuid, uuid, text, uuid, integer\) from public, anon, authenticated/);
    expect(flat).toMatch(/grant execute on function public\.fanout_friend_post_batch\(uuid, uuid, text, uuid, integer\) to service_role/);
  });
});
