import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Listings and avatars are moderated by a migration, a judge and a worker
 * handler that only meet in production. There is no database in the test suite,
 * so these pin the properties that would be dangerous to lose.
 */
const sql = readFileSync('supabase/migrations/20261004120000_media_moderation_listings_avatars.sql', 'utf8');
const judge = readFileSync('supabase/functions/embed-echo/judgeMedia.ts', 'utf8');
const handlers = readFileSync('supabase/functions/worker/handlers.ts', 'utf8');
const moderation = readFileSync('supabase/functions/embed-echo/moderation.ts', 'utf8');

describe('listing moderation migration', () => {
  it('creates the queue the worker drains', () => {
    expect(sql).toMatch(/pgmq\.create\('media_moderation'\)/);
  });

  it('hides a listing from the public until it passes', () => {
    expect(sql).toMatch(/create policy "read active listings"[\s\S]*?using \(status = 'active' and check_content\)/);
  });

  it('keeps the seller able to see their own listing while it waits', () => {
    // The seller policy is a separate policy that this migration must not drop or alter.
    expect(sql).not.toMatch(/(drop|alter)\s+policy\s+(if exists\s+)?"sellers read own"/i);
  });

  it('stops a client publishing itself or preserving a verdict across an edit', () => {
    // INSERT: a client row never arrives pre-approved.
    expect(sql).toMatch(/current_user in \('anon', 'authenticated'\)[\s\S]*?new\.check_content := false/);
    // UPDATE with no content change: a client cannot flip the columns.
    expect(sql).toMatch(/new\.check_content := old\.check_content/);
    // UPDATE with a content change: hidden again whoever wrote it, and re-versioned.
    expect(sql).toMatch(/content_version := old\.content_version \+ 1[\s\S]*?new\.check_content\s+:= false/);
  });

  it('guards before it enqueues, and re-queues on every content column', () => {
    expect(sql).toMatch(/create trigger a_guard_listing_moderation\s+before insert or update/);
    expect(sql).toMatch(/after insert or update of title, description, photo_urls, tags/);
  });

  it('does not empty the marketplace on deploy', () => {
    expect(sql).toMatch(/set check_content = true[\s\S]*?moderated_at is null/);
    expect(sql).toMatch(/pgmq\.send\('media_moderation'[\s\S]*?'kind', 'listing'/);
  });

  it('locks the trigger functions away from clients', () => {
    for (const fn of ['guard_listing_moderation', 'moderate_listing', 'moderate_avatar']) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon, authenticated`));
    }
  });

  it('runs the enqueueing functions with an empty search_path', () => {
    expect((sql.match(/security definer\s+set search_path = ''/g) ?? []).length).toBe(2);
  });

  it('queues an avatar only when it is set and has changed', () => {
    expect(sql).toMatch(/after insert or update of avatar_url on public\.profiles/);
    expect(sql).toMatch(/new\.avatar_url is not distinct from old\.avatar_url/);
  });
});

describe('media judge', () => {
  it('writes a listing verdict only for the version it judged', () => {
    expect(judge).toMatch(/\.eq\("content_version", row\.content_version\)/);
  });

  it('treats a photo it cannot fetch as unverified, not clean', () => {
    expect(judge).toMatch(/unverifiable_media/);
  });

  it('leaves a listing pending when the model cannot decide', () => {
    expect(judge).toMatch(/if \(unavailable\(textVerdict\)\) return \{ kind: "unavailable"/);
    expect(judge).toMatch(/if \(unavailable\(imageVerdict\)\) return \{ kind: "unavailable"/);
  });

  it('clears a failed avatar only if it is still the picture that was judged', () => {
    expect(judge).toMatch(/\.update\(\{ avatar_url: null \}\)[\s\S]*?\.eq\("avatar_url", url\)/);
  });

  it('skips an avatar that changed after the job was queued', () => {
    expect(judge).toMatch(/row\.avatar_url !== url\) return \{ kind: "superseded" \}/);
  });
});

describe('worker wiring', () => {
  it('registers a handler for the queue the triggers feed', () => {
    expect(handlers).toMatch(/media_moderation: mediaModeration/);
  });

  it('retries, rather than acks, a job that reached no verdict', () => {
    expect(handlers).toMatch(/case 'unavailable':\s+throw new Error\(`media moderation unavailable/);
    expect(handlers).toMatch(/case 'verdict_not_saved':\s+throw/);
  });
});

describe('image moderation', () => {
  it('judges every photo, not just the first four', () => {
    expect(moderation).toMatch(/for \(let i = 0; i < urls\.length; i \+= MAX_IMAGES_PER_CALL\)/);
    expect(moderation).not.toMatch(/urls\.slice\(0, MAX_IMAGES_PER_CALL\)/);
  });
});
