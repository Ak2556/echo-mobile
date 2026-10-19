import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A post's text (the 140-character preview in a follower's notification, or in a "quoted you"
 * notification) must not leave the database before moderation has approved the post. The triggers
 * that used to run AFTER INSERT now run when check_content turns true.
 * See supabase/migrations/20261019120000_notify_after_moderation.sql and docs/architecture/04-key-flows.md.
 */
const DIR = 'supabase/migrations';
const FIX = '20261019120000_notify_after_moderation.sql';
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const strip = (sql: string) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').replace(/\s+/g, ' ');
const fix = strip(readFileSync(`${DIR}/${FIX}`, 'utf8'));

describe('notifications that carry post text wait for moderation', () => {
  it('fan-out and quote functions refuse an unapproved post', () => {
    const fan = fix.slice(fix.indexOf('function public.fn_friend_post_notify'), fix.indexOf('function public.notify_on_echo_quote'));
    const quote = fix.slice(fix.indexOf('function public.notify_on_echo_quote'), fix.indexOf('drop trigger if exists trg_friend_post_notify '));
    expect(fan).toMatch(/new\.check_content is not true then return new/);
    expect(quote).toMatch(/new\.check_content is not true then return new/);
  });

  it('never fans out an old post that is approved late', () => {
    expect(fix).toMatch(/new\.created_at < now\(\) - interval '6 hours' then return new/);
  });

  it('a re-approval cannot notify the quoted author twice', () => {
    expect(fix).toMatch(/from public\.notifications n where n\.type = 'quote' and n\.target_id = new\.id/);
  });

  it('the triggers run on insert-of-approved and on the approval update, and not on a plain insert', () => {
    expect(fix).toMatch(/create trigger trg_friend_post_notify_inserted after insert on public\.public_echoes for each row when \(new\.check_content is true\)/);
    expect(fix).toMatch(/create trigger trg_friend_post_notify_approved after update of check_content on public\.public_echoes for each row when \(old\.check_content is distinct from true and new\.check_content is true\)/);
    expect(fix).toMatch(/create trigger trg_notify_echo_quote_approved after update of check_content/);
    expect(fix).not.toMatch(/create trigger trg_friend_post_notify after insert/);
    expect(fix).not.toMatch(/create trigger trg_notify_echo_quote after insert/);
  });

  it('no later migration puts an ungated trigger back', () => {
    const after = files.filter((f) => f > FIX);
    const offenders: string[] = [];
    for (const f of after) {
      const sql = strip(readFileSync(`${DIR}/${f}`, 'utf8'));
      const stmts = sql.match(/create (?:or replace )?trigger [^;]*?on public\.public_echoes[^;]*?execute (?:function|procedure) public\.(?:fn_friend_post_notify|notify_on_echo_quote)\(\)/g) ?? [];
      for (const s of stmts) if (!/check_content/.test(s)) offenders.push(`${f}: ${s.slice(0, 90)}`);
    }
    expect(offenders).toEqual([]);
  });
});
