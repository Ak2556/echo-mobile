import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NOTIFICATION_TYPES } from '../lib/notifications/presentation';

/**
 * Private accounts, and the 2026-10-08 audit fixes that shipped with them.
 *
 * "Private account" was a switch that hid nothing from a stranger who tapped
 * Follow, and two USING (true) policies left comments and likes on a private
 * author's posts readable by anyone, signed out included. These read the
 * migration, because the policies are the protection: the app only explains it.
 */

const ROOT = resolve(__dirname, '..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();
const sql = readFileSync(join(MIGRATIONS, '20261008120000_private_accounts.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, '');

describe('following a private account needs approval', () => {
  it('a direct follow insert is refused when the target is private', () => {
    const policy = code.match(/create policy "Users insert own follows" on public\.follows[\s\S]*?;\s*\n/i)?.[0] ?? '';
    expect(policy).toMatch(/auth\.uid\(\)\)\s*=\s*follower_id/);
    expect(policy).toMatch(/not exists[\s\S]*is_private/i);
  });

  it('requests are readable by the two people involved and writable by no client', () => {
    expect(code).toMatch(/alter table public\.follow_requests enable row level security/i);
    expect(code).toMatch(/revoke all on public\.follow_requests from public, anon, authenticated/i);
    expect(code).toMatch(/grant select on public\.follow_requests to authenticated/i);
    expect(code).not.toMatch(/grant (insert|update|delete|all)[^;]*follow_requests/i);
    expect(code).toMatch(/requester_id = \(select auth\.uid\(\)\) or target_id = \(select auth\.uid\(\)\)/);
  });

  it('every operation derives the caller from auth.uid() and none takes an identity argument', () => {
    for (const fn of ['request_follow', 'cancel_follow_request', 'respond_follow_request']) {
      const def = code.match(new RegExp(`create or replace function public\\.${fn}\\(([^)]*)\\)[\\s\\S]*?\\$\\$;`, 'i'));
      expect(def, fn).not.toBeNull();
      expect(def![0], fn).toMatch(/security definer/i);
      expect(def![0], fn).toMatch(/set search_path = public/i);
      expect(def![0], fn).toMatch(/auth\.uid\(\)/);
      // The only user ids a caller supplies are the OTHER party's.
      expect(def![1], fn).not.toMatch(/p_(user|self|me|caller|follower)/i);
      expect(code, fn).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`, 'i'));
      expect(code, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon`, 'i'));
    }
  });

  it('the function that creates a follow from a request cannot be called by a client', () => {
    expect(code).toMatch(/revoke all on function public\.approve_follow\(uuid, uuid\) from public, anon, authenticated/i);
    expect(code).not.toMatch(/grant execute on function public\.approve_follow/i);
  });

  it('only the person asked can answer, and only for requests made to them', () => {
    const def = code.match(/create or replace function public\.respond_follow_request[\s\S]*?\$\$;/i)![0];
    expect(def).toMatch(/where requester_id = p_requester and target_id = v_uid/);
  });

  it('going public releases waiting requesters without letting one failure block the switch', () => {
    expect(code).toMatch(/after update of is_private on public\.profiles/i);
    expect(code).toMatch(/old\.is_private is true and new\.is_private is not true/i);
    expect(code).toMatch(/exception when others then\s+continue/i);
  });

  it('an approval is not stopped by the follower limit meant for the person approving', () => {
    for (const t of ['rate_limit_follows_hour', 'rate_limit_follows_day']) {
      expect(code).toMatch(new RegExp(`create trigger ${t}[\\s\\S]*?when \\(current_setting\\('echo\\.approving_follow', true\\) is distinct from '1'\\)`, 'i'));
    }
  });
});

describe('comments and likes follow the post', () => {
  it('drops the four policies that made them public', () => {
    for (const [policy, table] of [
      ['Anon can read comments', 'echo_comments'],
      ['Comments are viewable', 'echo_comments'],
      ['Anon can read likes', 'echo_likes'],
      ['Likes are viewable', 'echo_likes'],
    ]) {
      expect(code).toMatch(new RegExp(`drop policy if exists "${policy}" on public\\.${table}`, 'i'));
    }
  });
});

describe('notification kinds', () => {
  it('the latest notifications_type_check is exactly NOTIFICATION_TYPES', () => {
    let list: string[] | null = null;
    for (const f of files) {
      const text = readFileSync(join(MIGRATIONS, f), 'utf8').replace(/--.*$/gm, '');
      for (const m of text.matchAll(/add constraint notifications_type_check\s+check\s*\(\s*type\s*=\s*any\s*\(\s*array\[([\s\S]*?)\]/gi)) {
        list = [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
      }
    }
    expect(list).not.toBeNull();
    expect([...list!].sort()).toEqual([...NOTIFICATION_TYPES].sort());
  });
});

describe('device keys and write limits', () => {
  it('a user keeps at most ten live device keys', () => {
    expect(code).toMatch(/create trigger a_cap_user_devices\s+before insert on public\.user_devices/i);
    expect(code).toMatch(/offset 9/);
  });

  it('the tables an account could fill without bound each have an insert limit', () => {
    for (const t of ['marketplace_listings', 'push_tokens', 'user_blocks', 'ai_messages', 'follow_requests']) {
      expect(code, t).toMatch(new RegExp(`create trigger rate_limit_${t}_hour\\s+before insert on public\\.${t}`, 'i'));
    }
  });
});

describe('a supabase query that is never awaited never runs', () => {
  const SOURCE_DIRS = ['lib', 'hooks', 'app', 'components', 'store'];
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap(f => {
      const abs = join(dir, f);
      if (statSync(abs).isDirectory()) return f === 'node_modules' ? [] : walk(abs);
      return /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [abs] : [];
    });

  it('no source file fires a supabase builder with `void` (last_seen_at never saved for that reason)', () => {
    const offenders: string[] = [];
    for (const d of SOURCE_DIRS) {
      for (const f of walk(join(ROOT, d))) {
        const text = readFileSync(f, 'utf8');
        if (/\bvoid\s+supabase\s*\.\s*(from|rpc)\s*\(/.test(text)) offenders.push(f.replace(ROOT + '/', ''));
      }
    }
    expect(offenders, 'a postgrest builder is lazy: `void` discards it before it sends. Use await, or .then(...)').toEqual([]);
  });
});

describe('the Follow requests row', () => {
  it('lays out its name column with a plain Pressable, not AnimatedPressable', () => {
    // Found on the emulator: inside AnimatedPressable the `flex: 1` is split from the row
    // layout and the name and username rendered at zero width, leaving an avatar and two buttons.
    const screen = readFileSync(join(ROOT, 'app/follow-requests.tsx'), 'utf8');
    const row = screen.slice(screen.indexOf('renderItem'), screen.indexOf('answer(item, true)'));
    expect(row).toMatch(/<Pressable[\s\S]*?flex: 1, minWidth: 0, flexDirection: 'row'/);
    expect(row).not.toMatch(/<AnimatedPressable[^>]*flex: 1, minWidth: 0, flexDirection/);
  });
});
