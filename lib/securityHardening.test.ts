import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Invariants from the 2026-09-16 audit (20260916120000_security_hardening).
 * Each one was a live hole in production. These checks read the migrations
 * rather than a database, so they run in CI, and each is written against the
 * class of bug rather than the single instance: the next view, policy or RPC
 * has to meet the same rule.
 *
 * Behaviour (does the guard actually stop the write?) was verified against
 * Postgres with a copy of the production rules. What is pinned here is that
 * the protections exist and that nothing later quietly undoes them.
 */

const ROOT = resolve(__dirname, '..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();
const sources = files.map(file => ({ file, sql: readFileSync(join(MIGRATIONS, file), 'utf8') }));

const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

/** Latest definition of each public function, migrations in filename order. */
function latestFunctions() {
  const out = new Map<string, { file: string; args: string; head: string; body: string }>();
  const pattern = /create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(([\s\S]*?)\)\s*(returns[\s\S]*?)(\$\w*\$)([\s\S]*?)\4\s*;/gi;
  for (const { file, sql } of sources) {
    for (const m of sql.matchAll(pattern)) {
      const name = m[1].toLowerCase().replace(/^(?!public\.)/, 'public.');
      out.set(name, { file, args: m[2], head: m[3], body: m[5] });
    }
  }
  return out;
}

/** Statements with dollar-quoted bodies removed, so a `;` inside one can't split. */
function statements(sql: string): string[] {
  return stripComments(sql)
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, '$$BODY$$')
    .split(';')
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const allStatements = sources.flatMap(({ file, sql }) => statements(sql).map(text => ({ file, text })));
const fns = latestFunctions();

describe('views run as the caller', () => {
  it('every public view ends up security_invoker', () => {
    // CREATE OR REPLACE VIEW replaces reloptions, so a re-emit without the
    // option resets it. That is modelled here on purpose.
    const invoker = new Map<string, boolean>();
    for (const { text } of allStatements) {
      const created = /^create (?:or replace )?view (?:if not exists )?(?:public\.)?(\w+)/i.exec(text);
      if (created) {
        invoker.set(created[1].toLowerCase(), /with \( ?security_invoker ?= ?true ?\)/i.test(text));
        continue;
      }
      const altered = /^alter view (?:if exists )?(?:public\.)?(\w+) set \( ?security_invoker ?= ?(true|false) ?\)/i.exec(text);
      if (altered) invoker.set(altered[1].toLowerCase(), altered[2].toLowerCase() === 'true');
    }
    expect(invoker.size).toBeGreaterThan(0);
    const definer = [...invoker].filter(([, isInvoker]) => !isInvoker).map(([name]) => name);
    expect(definer, 'a view without security_invoker runs as its owner and skips RLS').toEqual([]);
  });

  it('visible_echoes is read-only for client roles', () => {
    const revoke = allStatements.find(s =>
      /^revoke insert, update, delete, truncate/i.test(s.text) && /on public\.visible_echoes from anon, authenticated/i.test(s.text));
    expect(revoke, 'Supabase default privileges grant writes on every new view').toBeDefined();
  });
});

describe('read policies', () => {
  /** Latest policy text per table and name, following drop, create and alter ... to. */
  function latestPolicies(table: string) {
    const out = new Map<string, string>();
    for (const { text } of allStatements) {
      let m = new RegExp(`^drop policy (?:if exists )?"?(.+?)"? on (?:public\\.)?${table}$`, 'i').exec(text);
      if (m) { out.delete(m[1]); continue; }
      m = new RegExp(`^create policy "?(.+?)"? on (?:public\\.)?${table} (.*)$`, 'i').exec(text);
      if (m) { out.set(m[1], m[2]); continue; }
      m = new RegExp(`^alter policy "?(.+?)"? on (?:public\\.)?${table} to (\\w+)$`, 'i').exec(text);
      if (m && out.has(m[1])) out.set(m[1], `${out.get(m[1])} [to ${m[2]}]`);
    }
    return out;
  }

  it.each(['public_echoes', 'daily_answers'])('no SELECT policy on %s is USING (true)', table => {
    const open = [...latestPolicies(table)].filter(([, text]) => /for select/i.test(text) && /using \(\s*true\s*\)/i.test(text));
    expect(open, 'USING (true) exposes private accounts, and on public_echoes unmoderated posts too').toEqual([]);
  });

  it('anon reads only moderated posts from authors it may see', () => {
    const anon = [...latestPolicies('public_echoes')].filter(([, text]) => /to anon/i.test(text));
    expect(anon.length).toBe(1);
    expect(anon[0][1]).toMatch(/check_content/);
    expect(anon[0][1]).toMatch(/can_view_echo_author/);
  });

  it('the authorised-users policy is not applied to anon, which has no grant on is_private', () => {
    const policies = latestPolicies('public_echoes');
    expect(policies.get('Echoes are viewable by authorized users')).toMatch(/\[to authenticated\]$/);
  });
});

describe('server-owned columns', () => {
  const guard = fns.get('public.guard_client_writes');

  it('the guard exists and runs as the caller', () => {
    expect(guard).toBeDefined();
    // SECURITY DEFINER would make current_user the owner and wave every write through.
    expect(guard!.head).not.toMatch(/security\s+definer/i);
    expect(guard!.body).toMatch(/current_user not in \('anon', 'authenticated'\)/);
    expect(guard!.body).toMatch(/pg_trigger_depth\(\) > 1/);
  });

  it.each([
    ['public_echoes', ['check_content', 'likes_count', 'view_count', 'thoughtfulness_score', 'embedding', 'hls_url', 'co_author_id']],
    ['ads', ['payment_status', 'is_active', 'budget_amount', 'razorpay_order_id']],
    ['learn_bookings', ['status', 'payment_status', 'meeting_link', 'tutor_id', 'learner_id']],
    ['dm_conversations', ['user_a', 'user_b', 'last_message_text']],
  ])('%s is guarded', (table, columns) => {
    let attached = false;
    for (const { text } of allStatements) {
      if (new RegExp(`^create trigger a_guard_client_writes .* on public\\.${table} `, 'i').test(text)) attached = true;
      if (new RegExp(`^drop trigger (if exists )?a_guard_client_writes on public\\.${table}$`, 'i').test(text)) attached = false;
    }
    expect(attached, `a_guard_client_writes must be attached to ${table}`).toBe(true);
    const branch = guard!.body.split(/tg_table_name = /).find(part => part.startsWith(`'${table}'`)) ?? '';
    for (const column of columns) expect(branch, `${table}.${column}`).toMatch(new RegExp(`new\\.${column}\\b`));
  });

  it('edits go back through moderation', () => {
    const trigger = allStatements.filter(s => /^create trigger trg_moderate_new_echo /i.test(s.text)).at(-1);
    expect(trigger?.text).toMatch(/after insert or update of title, prompt, response, media_urls/i);
  });
});

describe('rate limits', () => {
  const fn = fns.get('public.check_app_rate_limit')!;
  const allowlist = [...(/p_action not in \(([\s\S]*?)\)/.exec(fn.body)?.[1] ?? '').matchAll(/'([\w-]+)'/g)].map(m => m[1]);

  function sourceFiles(dir: string): string[] {
    return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
      if (entry.name === 'node_modules') return [];
      const rel = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(rel);
      return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [rel] : [];
    });
  }

  it('direct client calls are gated to an allowlist', () => {
    expect(fn.body).toMatch(/pg_trigger_depth\(\) = 0/);
    expect(fn.body).toMatch(/service_role/);
    expect(allowlist.length).toBeGreaterThan(0);
  });

  it('the allowlist is exactly the actions the app checks client-side', () => {
    const used = new Set<string>();
    for (const file of ['lib', 'src', 'app', 'hooks', 'components'].flatMap(sourceFiles)) {
      for (const m of readFileSync(join(ROOT, file), 'utf8').matchAll(/checkRemoteAppRateLimit\(\s*'([\w-]+)'/g)) used.add(m[1]);
    }
    expect([...used].sort()).toEqual([...allowlist].sort());
  });

  it('no server-enforced action is resettable from a client', () => {
    const server = new Set<string>();
    for (const { sql } of sources) {
      for (const m of sql.matchAll(/enforce_insert_rate_limit\(\s*'([\w-]+)'/g)) server.add(m[1]);
      for (const m of sql.matchAll(/check_app_rate_limit\(\s*'([\w-]+)'/g)) server.add(m[1]);
    }
    const fnDir = join(ROOT, 'supabase/functions');
    for (const dir of readdirSync(fnDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      for (const file of readdirSync(join(fnDir, dir.name)).filter(f => f.endsWith('.ts'))) {
        const code = readFileSync(join(fnDir, dir.name, file), 'utf8');
        for (const m of code.matchAll(/(?:p_)?action:\s*"([\w-]+)"/g)) server.add(m[1]);
      }
    }
    expect(server.size).toBeGreaterThan(10);
    expect([...server].filter(action => allowlist.includes(action))).toEqual([]);
  });

  it('the moderation sweep cannot be called by users', () => {
    const lastRevoke = allStatements.findLastIndex(s =>
      /^revoke execute on function public\.resweep_unmoderated_echoes\(\) from public, anon, authenticated$/i.test(s.text));
    const lastGrant = allStatements.findLastIndex(s =>
      /^grant .* on function public\.resweep_unmoderated_echoes/i.test(s.text));
    expect(lastRevoke).toBeGreaterThan(-1);
    expect(lastRevoke).toBeGreaterThan(lastGrant);
  });
});

describe('identity comes from the JWT', () => {
  /**
   * A definer function that takes the caller's identity as a parameter lets a
   * caller act as anyone. Every such function resolves identity from
   * request.jwt.claims (service_role may name a user; nobody else may).
   * Exemptions are parameters that name someone OTHER than the caller.
   */
  const NOT_THE_CALLER = new Map([
    ['public.is_dm_conversation_member', 'membership predicate: RLS policies pass auth.uid() explicitly'],
    ['public.remove_group_member', 'p_user_id is the member being removed; the caller is checked by assert_group_admin'],
    ['public.set_group_member_role', 'p_user_id is the member being changed; the caller is checked by assert_group_admin'],
  ]);

  it('no SECURITY DEFINER function trusts p_user_id or p_viewer_id', () => {
    const offenders: string[] = [];
    for (const [name, { file, args, head, body }] of fns) {
      if (!/security\s+definer/i.test(head) || /returns\s+trigger/i.test(head)) continue;
      if (!/\bp_(user|viewer)_id\b/.test(args)) continue;
      if (NOT_THE_CALLER.has(name)) continue;
      if (!/request\.jwt\.claims/.test(body)) offenders.push(`${name} (${file})`);
    }
    expect(offenders).toEqual([]);
  });

  it.each(['public.get_ranked_feed', 'public.get_thinking_partners', 'public.get_divergent_daily_answers'])(
    '%s caps its page size',
    name => {
      expect(fns.get(name)!.body).toMatch(/limit least\(greatest\(/i);
    },
  );
});

describe('blocks and DM privacy are enforced by the server', () => {
  it.each([
    ['a_enforce_dm_blocks', 'direct_messages'],
    ['a_enforce_dm_requests', 'dm_conversations'],
    ['a_enforce_group_adds', 'dm_conversation_members'],
  ])('%s is attached to %s', (trigger, table) => {
    const created = allStatements.findLastIndex(s => new RegExp(`^create trigger ${trigger} before insert on public\\.${table} `, 'i').test(s.text));
    const dropped = allStatements.findLastIndex(s => new RegExp(`^drop trigger (if exists )?${trigger} on public\\.${table}$`, 'i').test(s.text));
    expect(created).toBeGreaterThan(dropped);
  });

  it('dm_privacy is honoured, in both directions of a block', () => {
    const allowed = fns.get('public.dm_request_allowed')!.body;
    expect(allowed).toMatch(/'nobody' then false/);
    expect(allowed).toMatch(/'followers' then exists/);
    const blocked = fns.get('public.dm_blocked_between')!.body;
    expect(blocked).toMatch(/b\.blocker_id = p_a and b\.blocked_id = p_b/);
    expect(blocked).toMatch(/b\.blocker_id = p_b and b\.blocked_id = p_a/);
  });

  it('the helpers are not callable by clients, so they cannot become a block oracle', () => {
    for (const helper of ['dm_blocked_between', 'dm_request_allowed']) {
      const revoked = allStatements.some(s =>
        new RegExp(`^revoke all on function public\\.${helper}\\(uuid, uuid\\) from public, anon, authenticated$`, 'i').test(s.text));
      expect(revoked, helper).toBe(true);
    }
  });
});

/**
 * Postgres OR-combines permissive policies: one surviving `for select using
 * (true)` does not just leave a table open, it cancels every stricter policy
 * sitting beside it. So the invariant has to be "no table ends up with an open
 * SELECT policy", checked across all of them — a per-table test only ever pins
 * the tables somebody already thought to fix, which is how fourteen of these
 * stayed open while public_echoes and daily_answers were being hardened.
 *
 * Adding a table to PUBLIC_BY_DESIGN is a deliberate act: it says the rows
 * contain no user, or that the table's protection is column grants rather than
 * row visibility. Anything else belongs behind a predicate.
 */
describe('no table is left open to everyone', () => {
  const PUBLIC_BY_DESIGN = new Map([
    ['badges', 'badge catalogue; no user in the row'],
    ['quests', 'quest catalogue; no user in the row'],
    ['daily_questions', 'question catalogue; no user in the row'],
    ['daily_question_bank', 'question catalogue; no user in the row'],
    ['feature_flags', 'read before sign-in, by design'],
    ['salons', 'public directory; membership is gated on salon_members'],
    ['profiles', 'row-hiding breaks every screen; protected by column grants — is_private and the settings columns are granted to authenticated only'],
  ]);

  /** Final policy set per table, replaying drop/create/alter in migration order. */
  function finalPolicies() {
    const tables = new Map<string, Map<string, string>>();
    for (const { text } of allStatements) {
      let m = /^drop policy (?:if exists )?"?(.+?)"? on (?:public\.)?(\w+)$/i.exec(text);
      if (m) { tables.get(m[2])?.delete(m[1]); continue; }
      m = /^create policy "?(.+?)"? on (?:public\.)?(\w+) (.*)$/i.exec(text);
      if (m) {
        if (!tables.has(m[2])) tables.set(m[2], new Map());
        tables.get(m[2])!.set(m[1], m[3]);
        continue;
      }
      m = /^alter policy "?(.+?)"? on (?:public\.)?(\w+) to ([\w, ]+)$/i.exec(text);
      if (m && tables.get(m[2])?.has(m[1])) {
        tables.get(m[2])!.set(m[1], `${tables.get(m[2])!.get(m[1])} [to ${m[3]}]`);
      }
    }
    return tables;
  }

  it('every SELECT USING (true) is on a table that is public by design', () => {
    const open: string[] = [];
    for (const [table, policies] of finalPolicies()) {
      if (PUBLIC_BY_DESIGN.has(table)) continue;
      for (const [name, text] of policies) {
        if (/for select/i.test(text) && /using \(\s*true\s*\)/i.test(text)) {
          open.push(`${table}."${name}"`);
        }
      }
    }
    expect(open, 'USING (true) cancels every stricter policy beside it — gate the table or justify it in PUBLIC_BY_DESIGN').toEqual([]);
  });

  it('the engagement tables are gated on the thing they hang off, or on the actor', () => {
    const policies = finalPolicies();
    const attached: Array<[string, string]> = [
      ['echo_reactions', 'public_echoes'],
      ['echo_mentions', 'public_echoes'],
      ['echo_reposts', 'public_echoes'],
      ['comment_likes', 'echo_comments'],
      ['comment_reactions', 'echo_comments'],
      ['comment_mentions', 'echo_comments'],
      ['daily_answer_reactions', 'daily_answers'],
    ];
    for (const [table, parent] of attached) {
      const selects = [...(policies.get(table) ?? [])].filter(([, t]) => /for select/i.test(t));
      expect(selects.length, `${table} should have exactly one SELECT policy`).toBe(1);
      expect(selects[0][1], `${table} must inherit ${parent}'s visibility`).toMatch(
        new RegExp(`exists \\(\\s*select 1 from public\\.${parent}\\b`, 'i'));
    }

    const actorGated = ['user_badges', 'salon_members', 'office_hours', 'office_hour_questions', 'office_hour_rsvps', 'office_hour_question_upvotes'];
    for (const table of actorGated) {
      const selects = [...(policies.get(table) ?? [])].filter(([, t]) => /for select/i.test(t));
      expect(selects.length, `${table} should have exactly one SELECT policy`).toBe(1);
      expect(selects[0][1], `${table} must gate on the acting user`).toMatch(/can_view_echo_author/i);
    }
  });

  it('a follow edge is visible only when both of its ends are', () => {
    const selects = [...(finalPolicies().get('follows') ?? [])].filter(([, t]) => /for select/i.test(t));
    expect(selects.length).toBe(1);
    expect(selects[0][1]).toMatch(/can_view_echo_author\(\s*follows\.follower_id\s*\)/i);
    expect(selects[0][1]).toMatch(/can_view_echo_author\(\s*follows\.following_id\s*\)/i);
  });
});

/**
 * handle_new_user() runs inside the auth.users insert. profiles.username and
 * .display_name are NOT NULL and username is UNIQUE, so anything this function
 * raises aborts the signup — the user sees "Database error saving new user"
 * and nothing names this trigger. 20260810090000 dropped the fallbacks that
 * 20260525180000 had added and killed every provider that does not send a
 * username, which is all of them except a client that sets options.data.
 *
 * The rule is therefore: no expression feeding either column may be able to
 * produce null, and the UNIQUE index must be settled rather than hit.
 */
describe('signup cannot be aborted by the profile trigger', () => {
  const trigger = fns.get('public.handle_new_user');

  it('the trigger exists and runs as definer with a pinned search_path', () => {
    expect(trigger, 'handle_new_user must be defined in a migration').toBeTruthy();
    expect(trigger!.head).toMatch(/security definer/i);
    expect(trigger!.head).toMatch(/set search_path = public/i);
  });

  it('both NOT NULL columns fall back to something derived from new.id', () => {
    const body = trigger!.body;
    // The terminal fallback cannot depend on email or on provider metadata,
    // because phone signup has neither.
    expect(body, 'needs a fallback built from new.id').toMatch(/new\.id::text/);
    for (const key of ['username', 'display_name']) {
      expect(body, `${key} must have a coalesce chain`).toMatch(
        new RegExp(`raw_user_meta_data->>'${key}'`));
    }
    // Providers send these instead of display_name; without them an OAuth
    // signup gets a uuid for a name even when it told us who the person is.
    expect(body).toMatch(/raw_user_meta_data->>'full_name'/);
    expect(body).toMatch(/raw_user_meta_data->>'name'/);
  });

  it('a username collision is settled, not raised', () => {
    const body = trigger!.body;
    // on conflict (id) does not cover profiles_username_key — a second user
    // whose email local-part matches an existing username would abort signup.
    expect(body, 'must probe profiles.username before inserting').toMatch(
      /select 1 from public\.profiles p where p\.username/i);
    expect(body, 'the probe must be bounded so it cannot spin').toMatch(/loop/i);
  });
});

/**
 * Storage buckets were created with file_size_limit and allowed_mime_types
 * null, which Storage reads as "any size, any type". Object RLS was already
 * correct (a writer is confined to a folder named after their own auth.uid()),
 * but marketplace-photos is also `public = true`, and Storage serves an object
 * with the content-type it was stored with. An unbounded `text/html` upload
 * therefore got a stable public HTTPS URL on a Supabase domain — a phishing
 * page hosted by us — and SVG carries script the same way.
 */
describe('storage buckets are bounded', () => {
  const CONSTRAINED = ['marketplace-photos', 'dm-media', 'mini-app-media', 'verification'];
  const sql = sources.map(s => s.sql).join('\n');

  it.each(CONSTRAINED)('%s has a size limit and a mime allowlist', bucket => {
    // The statement that constrains this bucket, whichever migration it is in.
    // Several migrations UPDATE a bucket (one flips `public`), so pick the
    // statement that actually sets the limits rather than the first match.
    const stmt = statements(sql).findLast(s =>
      /update storage\.buckets set/i.test(s)
      && s.includes(`'${bucket}'`)
      && /file_size_limit/i.test(s));
    expect(stmt, `no migration constrains ${bucket}`).toBeTruthy();
    expect(stmt!, `${bucket} needs a file_size_limit`).toMatch(/file_size_limit = \d+/i);
    expect(stmt!, `${bucket} needs an allowed_mime_types allowlist`).toMatch(/allowed_mime_types = array\[/i);
  });

  it('no bucket allows html or svg, which are script-bearing when served inline', () => {
    for (const stmt of statements(sql).filter(s =>
      /update storage\.buckets set/i.test(s) && /allowed_mime_types/i.test(s))) {
      expect(stmt, 'text/html must never be an allowed upload type').not.toMatch(/text\/html/i);
      expect(stmt, 'image/svg+xml carries script; it is not a photo').not.toMatch(/svg/i);
    }
  });

  it('the public marketplace bucket takes images only', () => {
    const stmt = statements(sql).findLast(s =>
      /update storage\.buckets set/i.test(s)
      && s.includes("'marketplace-photos'")
      && /allowed_mime_types/i.test(s));
    const types = [...stmt!.matchAll(/'([a-z]+\/[a-z0-9.+-]+)'/gi)].map(m => m[1]);
    expect(types.length).toBeGreaterThan(0);
    expect(types.every(t => t.startsWith('image/')), `got ${types.join(', ')}`).toBe(true);
  });
});

/**
 * is_moderator is read server-side by verify-identity's `list`/`decide` actions,
 * which flip profiles.is_verified, and by the DSA Art. 20 appeals path. A user
 * who could set that bit could verify themselves and then anyone — an
 * impersonation primitive, not a privilege bump.
 *
 * It was protected only by the column-level UPDATE grant. 20260705000000 exists
 * precisely because profiles column grants are easy to get wrong, so the policy
 * pins the value too.
 */
describe('a client cannot promote itself to moderator', () => {
  function latestUpdatePolicy() {
    let text: string | undefined;
    for (const { text: s } of allStatements) {
      if (/^drop policy (?:if exists )?"users can update own profile" on (?:public\.)?profiles$/i.test(s)) {
        text = undefined;
      }
      const m = /^create policy "users can update own profile" on (?:public\.)?profiles (.*)$/i.exec(s);
      if (m) text = m[1];
    }
    return text;
  }

  it('the profiles update policy pins the server-owned flags', () => {
    const policy = latestUpdatePolicy();
    expect(policy, 'the update policy must exist').toBeTruthy();
    for (const col of ['is_moderator', 'is_verified', 'follower_count']) {
      expect(policy!, `${col} must be pinned to its current value`).toMatch(
        new RegExp(`${col} is not distinct from \\(\\s*select ${col} from public\\.profiles`, 'i'));
    }
  });

  it('is_moderator is never granted as an updatable column', () => {
    // Column grants are the first layer; this asserts nobody widens them.
    for (const { text } of allStatements) {
      const m = /^grant update \(([^)]*)\) on public\.profiles/i.exec(text);
      if (m) {
        expect(m[1].toLowerCase(), 'is_moderator must not be client-writable').not.toMatch(/\bis_moderator\b/);
        expect(m[1].toLowerCase(), 'is_verified must not be client-writable').not.toMatch(/\bis_verified\b/);
      }
      // A table-wide grant would restore write access to every column at once.
      expect(text, 'never grant UPDATE on all of profiles').not.toMatch(
        /^grant (all|update) on (table )?public\.profiles to/i);
    }
  });
});

/**
 * public_echoes.media_urls and .hls_url were a bare text[] / text that
 * `authenticated` may INSERT and UPDATE, unvalidated anywhere. Three
 * consequences, and the first undoes the moderation gate:
 *
 *   1. check_content is decided once, against bytes on a host the poster
 *      controls. Afterwards they change what the URL serves and the post stays
 *      "moderated" while showing something else.
 *   2. og-redirect puts media_urls[0] into <meta og:image>, so an
 *      attacker-chosen, mutable image is unfurled under our own OG tags.
 *   3. Every viewer's IP goes to a third-party host of the author's choosing.
 *
 * Enforced as an allowlist table plus a trigger rather than a CHECK with a
 * literal domain, because the media host is deployment configuration.
 */
describe('echo media must come from an Echo-controlled host', () => {
  const guard = fns.get('public.guard_media_provenance');
  const allowed = fns.get('public.media_url_allowed');

  it('the allowlist table exists and is unreachable from a client', () => {
    const created = allStatements.some(s =>
      /^create table (if not exists )?public\.media_url_hosts/i.test(s.text));
    expect(created).toBe(true);
    expect(allStatements.some(s =>
      /^alter table public\.media_url_hosts enable row level security$/i.test(s.text))).toBe(true);
    // No grants, so it cannot be tampered with or used to enumerate our hosts.
    expect(allStatements.some(s =>
      /^revoke all on public\.media_url_hosts from anon, authenticated$/i.test(s.text))).toBe(true);
    expect(allStatements.some(s =>
      /^grant (select|all|insert|update) on (table )?public\.media_url_hosts to/i.test(s.text))).toBe(false);
  });

  it('only https is accepted, which is what excludes javascript: and data:', () => {
    expect(allowed, 'media_url_allowed must exist').toBeTruthy();
    expect(allowed!.body).toMatch(/\^https:\/\//);
    // Anchored, so a scheme cannot be smuggled in later in the string.
    expect(allowed!.body).toMatch(/from '\^https/);
    // Null stays legal; the column is optional.
    expect(allowed!.body).toMatch(/p_url is null/);
  });

  it('the trigger checks every element and both columns, and rejects', () => {
    expect(guard, 'guard_media_provenance must exist').toBeTruthy();
    const body = guard!.body;
    // An array whose second element is off-site must not slip through.
    expect(body).toMatch(/foreach .* in array new\.media_urls/i);
    expect(body).toMatch(/new\.hls_url/);
    // Rejected, not silently corrected: the client is meant to supply this
    // value, so a bad one is a mistake the caller needs told about.
    expect(body).toMatch(/raise exception/i);
    expect(body).toMatch(/42501/);
  });

  it('the trigger is attached to public_echoes for insert and update', () => {
    const created = allStatements.findLastIndex(s =>
      /^create trigger b_guard_media_provenance before insert or update on public\.public_echoes /i.test(s.text));
    const dropped = allStatements.findLastIndex(s =>
      /^drop trigger (if exists )?b_guard_media_provenance on public\.public_echoes$/i.test(s.text));
    expect(created, 'the trigger must be attached').toBeGreaterThan(-1);
    expect(created, 'and must not be left dropped').toBeGreaterThan(dropped);
  });
});
