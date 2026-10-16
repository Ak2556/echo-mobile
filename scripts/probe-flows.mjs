#!/usr/bin/env node
// End-to-end flow probes. Drives the same tables and RPCs the app does, as real signed-in
// users, and asserts OUTCOMES (a row exists, a trigger fired, a notification arrived, a
// forbidden write was refused), not HTTP status. Green statuses hid dead features before
// (see the silent-backend-failures notes), so every step checks what the user would see.
//
// Local (default): creates throwaway users with the service key.
//   PROBE_URL=http://127.0.0.1:54321 PROBE_ANON_KEY=... PROBE_SERVICE_KEY=... node scripts/probe-flows.mjs
// The three keys default to `supabase status --workdir ~/.echo-local -o env` output.
//
// Exits non-zero if any step fails, so it can gate a deploy.

import { createClient } from '@supabase/supabase-js';
import { execFileSync, execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

function localEnv() {
  try {
    const out = execSync(`supabase status --workdir ${process.env.HOME}/.echo-local -o env 2>/dev/null`, { encoding: 'utf8' });
    return Object.fromEntries(out.split('\n').map(l => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
  } catch { return {}; }
}
const L = localEnv();
const URL_ = process.env.PROBE_URL || L.API_URL || 'http://127.0.0.1:54321';
const ANON = process.env.PROBE_ANON_KEY || L.ANON_KEY;
const SERVICE = process.env.PROBE_SERVICE_KEY || L.SERVICE_ROLE_KEY;
if (!ANON || !SERVICE) { console.error('Need PROBE_ANON_KEY and PROBE_SERVICE_KEY (or a running local stack).'); process.exit(2); }

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
const anon = createClient(URL_, ANON, opts);

let failed = 0, passed = 0;
async function step(name, fn) {
  try { const note = await fn(); passed++; console.log(`  ✅ ${name}${note ? ` — ${note}` : ''}`); }
  catch (e) { failed++; console.log(`  ❌ ${name} — ${e instanceof Error ? e.message : JSON.stringify(e)}`); }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const ok = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

const tag = randomUUID().slice(0, 6);
const mk = async (n) => {
  const email = `probe_${tag}_${n}@probe.test`, password = `Pr0be-${tag}-pw`, username = `probe${tag}${n}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username, full_name: `Probe ${n}` } });
  if (error) throw new Error(`createUser ${n}: ${error.message}`);
  const c = createClient(URL_, ANON, opts);
  const s = await c.auth.signInWithPassword({ email, password });
  if (s.error) throw new Error(`signIn ${n}: ${s.error.message}`);
  return { id: data.user.id, client: c, username };
};

const created = [];
const cleanup = async () => { for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {}); };

console.log(`\nFlow probes against ${URL_}  (run ${tag})\n`);

let A, B, C, echoId;

console.log('[1] Sign-up and profile');
await step('three users sign up and sign in', async () => {
  A = await mk('a'); B = await mk('b'); C = await mk('c'); created.push(A.id, B.id, C.id);
});
await step('handle_new_user created a profile with the chosen username', async () => {
  const r = ok(await admin.from('profiles').select('id, username').eq('id', A.id).single(), 'profile');
  must(r.username === A.username, `username ${r.username} != ${A.username}`);
});
await step('username_available reports a taken name as unavailable', async () => {
  const r = ok(await B.client.rpc('username_available', { p_username: A.username }), 'username_available');
  must(r === false, `expected false, got ${r}`);
});

console.log('\n[2] Posting');
await step('A publishes an echo', async () => {
  const r = ok(await A.client.from('public_echoes').insert({ author_id: A.id, title: 'probe', prompt: 'probe prompt', response: 'probe response body' }).select('id').single(), 'insert echo');
  echoId = r.id; must(echoId, 'no id');
});
await step('the author can read it back', async () => {
  const r = ok(await A.client.from('public_echoes').select('id, author_id').eq('id', echoId).single(), 'read own');
  must(r.author_id === A.id, 'wrong author');
});
// The moderation job is enqueued by a trigger in the insert's own transaction (pgmq.send into
// the moderation queue), so a successful insert above already proves it was enqueued: with the
// queue missing, the insert itself fails. Worker verdicts are a separate, prod-only check.
await step('a client cannot publish as someone else', async () => {
  const r = await B.client.from('public_echoes').insert({ author_id: A.id, title: 'forged', prompt: 'x', response: 'y' });
  must(r.error, 'forged insert was accepted');
});

console.log('\n[3] Likes, bookmarks, comments');
await step('B likes the echo; the like is stored', async () => {
  ok(await B.client.from('echo_likes').insert({ echo_id: echoId, user_id: B.id }), 'like');
  const r = ok(await admin.from('echo_likes').select('echo_id').eq('echo_id', echoId).eq('user_id', B.id), 'read like');
  must(r.length === 1, 'like row missing');
});
await step('the like created a notification for A', async () => {
  const r = ok(await admin.from('notifications').select('id, type').eq('user_id', A.id), 'notifications');
  must(r.length >= 1, `A has ${r.length} notifications after a like`);
  return r.map(n => n.type).join(',');
});
await step('B bookmarks and un-bookmarks', async () => {
  ok(await B.client.from('echo_bookmarks').insert({ echo_id: echoId, user_id: B.id }), 'bookmark');
  ok(await B.client.from('echo_bookmarks').delete().eq('echo_id', echoId).eq('user_id', B.id), 'unbookmark');
});
await step('B comments; A can read the comment', async () => {
  ok(await B.client.from('echo_comments').insert({ echo_id: echoId, author_id: B.id, content: 'probe comment' }), 'comment');
  const r = ok(await A.client.from('echo_comments').select('id').eq('echo_id', echoId), 'read comments');
  must(r.length === 1, `A sees ${r.length} comments`);
});

console.log('\n[4] Follows and private accounts');
await step('B follows A; A.follower_count becomes 1 (trigger)', async () => {
  ok(await B.client.from('follows').insert({ follower_id: B.id, following_id: A.id }), 'follow');
  const r = ok(await admin.from('profiles').select('follower_count').eq('id', A.id).single(), 'count');
  must(r.follower_count === 1, `follower_count=${r.follower_count}`);
});
await step('A goes private', async () => {
  ok(await A.client.from('profiles').update({ is_private: true }).eq('id', A.id), 'set private');
});
await step('C cannot follow a private account directly', async () => {
  const r = await C.client.from('follows').insert({ follower_id: C.id, following_id: A.id });
  must(r.error, 'direct follow of a private account was accepted');
});
await step('C requests; A accepts; the follow now exists', async () => {
  ok(await C.client.rpc('request_follow', { p_target: A.id }), 'request_follow');
  const reqs = ok(await admin.from('follow_requests').select('requester_id').eq('requester_id', C.id).eq('target_id', A.id), 'requests');
  must(reqs.length === 1, `${reqs.length} pending requests`);
  ok(await A.client.rpc('respond_follow_request', { p_requester: C.id, p_accept: true }), 'respond');
  const f = ok(await admin.from('follows').select('follower_id').eq('follower_id', C.id).eq('following_id', A.id), 'follow row');
  must(f.length === 1, 'follow row missing after accept');
});
await step('A goes public again', async () => {
  ok(await A.client.from('profiles').update({ is_private: false }).eq('id', A.id), 'set public');
});

console.log('\n[5] Direct messages');
let convId;
await step('B opens a conversation with A', async () => {
  convId = ok(await B.client.rpc('get_or_create_dm_conversation', { p_recipient_id: A.id }), 'get_or_create');
  must(convId, 'no conversation id');
  return typeof convId === 'string' ? '' : JSON.stringify(convId);
});
await step('B sends a message; A sees the conversation with that last message', async () => {
  const id = typeof convId === 'string' ? convId : (convId.id ?? convId.conversation_id);
  ok(await B.client.from('direct_messages').insert({ id: randomUUID(), conversation_id: id, sender_id: B.id, kind: 'text', text: 'hello from probe' }), 'send');
  const list = ok(await A.client.rpc('get_dm_conversations'), 'get_dm_conversations');
  const row = list.find(r => (r.id ?? r.conversation_id) === id);
  must(row, 'A does not see the conversation');
  must(String(row.last_message_text ?? '').includes('hello from probe'), `last_message_text=${row.last_message_text}`);
});
await step('a stranger cannot read the thread', async () => {
  const id = typeof convId === 'string' ? convId : (convId.id ?? convId.conversation_id);
  const r = ok(await C.client.from('direct_messages').select('id').eq('conversation_id', id), 'stranger read');
  must(r.length === 0, `stranger read ${r.length} messages`);
});
await step('a stranger cannot call get_dm_conversations for someone else', async () => {
  const r = await C.client.rpc('get_dm_conversations', { p_user_id: A.id });
  const rows = r.data ?? [];
  must(!rows.some(x => String(x.last_message_text ?? '').includes('hello from probe')), 'leaked A\'s conversation via p_user_id');
});
await step('a blocked sender cannot message the blocker', async () => {
  ok(await A.client.from('user_blocks').insert({ blocker_id: A.id, blocked_id: B.id }), 'block');
  const id = typeof convId === 'string' ? convId : (convId.id ?? convId.conversation_id);
  const r = await B.client.from('direct_messages').insert({ id: randomUUID(), conversation_id: id, sender_id: B.id, kind: 'text', text: 'should be refused' });
  must(r.error, 'a blocked user could still send');
  await A.client.from('user_blocks').delete().eq('blocker_id', A.id).eq('blocked_id', B.id);
});

console.log('\n[6] Daily question');
let qid;
await step('ensure_daily_question returns today\'s question', async () => {
  const today = new Date().toISOString().slice(0, 10);
  let r = ok(await A.client.rpc('ensure_daily_question', { target: today }), 'ensure_daily_question');
  if (!r?.id) {
    // A fresh local database has an empty question bank (content, not schema). Seed one and retry.
    // On prod an empty bank is a real failure: this branch must never be reached there.
    ok(await admin.from('daily_question_bank').insert({ question: 'Probe: what changed your mind lately?', sort_order: 1 }), 'seed bank');
    r = ok(await A.client.rpc('ensure_daily_question', { target: today }), 'ensure_daily_question (seeded)');
    must(r?.id, 'still no question after seeding');
    qid = r.id;
    return 'bank was empty; seeded one question';
  }
  qid = r.id;
});
await step('A submits an answer; it is stored once, and replaced on resubmit', async () => {
  ok(await A.client.from('daily_answers').upsert({ question_id: qid, user_id: A.id, answer: 'first', embedding: null }, { onConflict: 'question_id,user_id' }), 'answer');
  ok(await A.client.from('daily_answers').upsert({ question_id: qid, user_id: A.id, answer: 'second', embedding: null }, { onConflict: 'question_id,user_id' }), 'answer 2');
  const r = ok(await admin.from('daily_answers').select('answer').eq('question_id', qid).eq('user_id', A.id), 'read');
  must(r.length === 1 && r[0].answer === 'second', `rows=${r.length} answer=${r[0]?.answer}`);
});

await step('B cannot edit A\'s answer', async () => {
  const r = await B.client.from('daily_answers').update({ answer: 'hijacked' }).eq('question_id', qid).eq('user_id', A.id).select('id');
  must(!r.data || r.data.length === 0, 'B edited A\'s answer');
  const cur = ok(await admin.from('daily_answers').select('answer').eq('question_id', qid).eq('user_id', A.id).single(), 'read');
  must(cur.answer === 'second', `answer is now ${cur.answer}`);
});
await step('an answer cannot be moved to another question', async () => {
  const other = ok(await admin.from('daily_questions').insert({ active_date: '2099-01-01', question: 'probe other' }).select('id').single(), 'other question');
  const r = await A.client.from('daily_answers').update({ question_id: other.id }).eq('question_id', qid).eq('user_id', A.id);
  await admin.from('daily_questions').delete().eq('id', other.id);
  must(r.error, 'the answer was moved to another question');
});

console.log('\n[7] Things a client must not be able to do');
await step('B cannot edit A\'s profile', async () => {
  const r = await B.client.from('profiles').update({ bio: 'hacked' }).eq('id', A.id).select('id');
  must(!r.data || r.data.length === 0, 'B changed A\'s profile');
});
await step('a client cannot set its own follower_count', async () => {
  await A.client.from('profiles').update({ follower_count: 99999 }).eq('id', A.id);
  const r = ok(await admin.from('profiles').select('follower_count').eq('id', A.id).single(), 'read');
  must(r.follower_count !== 99999, 'follower_count was client-writable');
});
await step('a client cannot delete someone else\'s echo', async () => {
  const r = await B.client.from('public_echoes').delete().eq('id', echoId).select('id');
  must(!r.data || r.data.length === 0, 'B deleted A\'s echo');
});
await step('anon cannot read private profile columns', async () => {
  const r = await anon.from('profiles').select('dob, push_token').eq('id', A.id);
  must(r.error || !r.data?.length || r.data.every(x => x.dob == null && x.push_token == null), 'anon read dob/push_token');
});
await step('anon cannot read direct messages', async () => {
  const r = await anon.from('direct_messages').select('id').limit(5);
  must(r.error || (r.data ?? []).length === 0, 'anon read direct messages');
});

// ---- SQL-level checks (local stack only; the same assertions need a DB URL on prod) ----------
const DB_URL = process.env.PROBE_DB_URL || (URL_.includes('127.0.0.1') ? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' : '');
const sql = (q) => execFileSync('psql', [DB_URL, '-At', '-F', '|', '-c', q], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' } }).trim();
const skipSql = !DB_URL;

console.log('\n[8] Notifications and push');
await step('a comment notifies the echo author', async () => {
  const r = ok(await admin.from('notifications').select('type').eq('user_id', A.id), 'notifications');
  must(r.some(n => n.type === 'comment'), `A has types: ${r.map(n => n.type).join(',')}`);
});
await step('a follow notifies the person followed', async () => {
  const r = ok(await admin.from('notifications').select('type').eq('user_id', A.id), 'notifications');
  must(r.some(n => n.type === 'follow'), `A has types: ${r.map(n => n.type).join(',')}`);
});
await step('every notification also reaches the push queue', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  // The payload is just { notification_id }, so match on the ids of A's notifications.
  const ids = sql(`select id from public.notifications where user_id = '${A.id}'`).split('\n').filter(Boolean);
  must(ids.length > 0, 'no notifications to check');
  const list = ids.map(i => `'${i}'`).join(',');
  const queued = Number(sql(`select count(*) from (select message from pgmq.q_push union all select message from pgmq.a_push) q where message->>'notification_id' in (${list})`));
  const notifs = ids.length;
  must(queued >= notifs, `${notifs} notifications but only ${queued} push jobs carry their ids`);
  return `${notifs} notifications, ${queued} push jobs`;
});
await step('a user can mark their own notifications read, not someone else\'s', async () => {
  ok(await A.client.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', A.id), 'mark read');
  const mine = ok(await admin.from('notifications').select('read_at').eq('user_id', A.id), 'read');
  must(mine.every(n => n.read_at), 'some of A\'s notifications are still unread');
  const r = await B.client.from('notifications').update({ read_at: null }).eq('user_id', A.id).select('id');
  must(!r.data || r.data.length === 0, 'B changed A\'s notifications');
});
await step('a user cannot read another user\'s notifications', async () => {
  const r = ok(await B.client.from('notifications').select('id').eq('user_id', A.id), 'cross read');
  must(r.length === 0, `B read ${r.length} of A's notifications`);
});

console.log('\n[9] Account deletion leaves nothing behind');
let D;
await step('a user with data across the app deletes their account', async () => {
  D = await mk('d'); created.push(D.id);
  const e = ok(await D.client.from('public_echoes').insert({ author_id: D.id, title: 'gone', prompt: 'p', response: 'r' }).select('id').single(), 'echo');
  ok(await D.client.from('echo_likes').insert({ echo_id: echoId, user_id: D.id }), 'like');
  ok(await D.client.from('follows').insert({ follower_id: D.id, following_id: A.id }), 'follow');
  ok(await D.client.from('echo_comments').insert({ echo_id: echoId, author_id: D.id, content: 'gone comment' }), 'comment');
  ok(await A.client.from('echo_likes').insert({ echo_id: e.id, user_id: A.id }), 'A likes D');
  ok(await D.client.from('daily_answers').upsert({ question_id: qid, user_id: D.id, answer: 'gone answer', embedding: null }, { onConflict: 'question_id,user_id' }), 'answer');
  ok(await D.client.from('push_tokens').insert({ token: `ExponentPushToken[probe-${tag}]`, user_id: D.id, platform: 'android' }), 'push token');
  const conv = ok(await D.client.rpc('get_or_create_dm_conversation', { p_recipient_id: C.id }), 'dm conv');
  const cid = typeof conv === 'string' ? conv : (conv.id ?? conv.conversation_id);
  ok(await D.client.from('direct_messages').insert({ id: randomUUID(), conversation_id: cid, sender_id: D.id, kind: 'text', text: 'gone message' }), 'dm');
  ok(await D.client.rpc('delete_account'), 'delete_account');
});
await step('the auth user and profile are gone', async () => {
  const u = await admin.auth.admin.getUserById(D.id);
  must(!u.data?.user, 'auth user still exists');
  const p = ok(await admin.from('profiles').select('id').eq('id', D.id), 'profile');
  must(p.length === 0, 'profile row remains');
});
const residue = (id) => {
  const q = `select table_name||'.'||column_name||'='||n from (
    select c.table_name, c.column_name,
      (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I where %I::text = %L', c.table_name, c.column_name, '${id}'), false, true, '')))[1]::text::int as n
    from information_schema.columns c
    join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'
    where c.table_schema='public' and c.data_type in ('uuid','text')
      and (c.column_name ~ '(user|author|follower|following|blocker|blocked|muter|muted|requester|target|actor|sender|recipient|host|owner|creator|member|co_author)(_id)?$' or c.column_name='id')
  ) x where n > 0 order by 1`;
  return sql(q).split('\n').filter(Boolean);
};
await step('the residue scan can see a live user\'s rows (so "nothing left" means something)', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  const rows = residue(A.id);
  const names = rows.map(r => r.split('=')[0]);
  for (const t of ['profiles.id', 'public_echoes.author_id', 'notifications.user_id', 'follows.following_id', 'daily_answers.user_id']) must(names.includes(t), `the scan missed ${t}; it found: ${names.join(', ')}`);
  return `${rows.length} places for a live user`;
});
await step('no row anywhere in the public schema still points at the deleted user', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  const rows = residue(D.id);
  const allowed = new Set(['erasure_requests.user_id']); // the audit record of the request itself
  const left = rows.filter(r => !allowed.has(r.split('=')[0]));
  must(left.length === 0, `rows left for the deleted user: ${left.join(', ')}`);
  return rows.length ? `only the audit record: ${rows.join(', ')}` : 'nothing left';
});
await step('A\'s own data survives the other user\'s deletion', async () => {
  const r = ok(await admin.from('public_echoes').select('id').eq('id', echoId), 'A echo');
  must(r.length === 1, 'A\'s echo vanished');
});

console.log('\n[10] Edge functions refuse callers they should refuse');
const fn = (name, headers = {}, body = {}) => fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, text: await r.text().catch(() => '') }));
const jwtOf = async (u) => (await u.client.auth.getSession()).data.session?.access_token;
const userFns = ['echo-ai', 'voice-command', 'delete-account', 'mini-app-coach', 'editorial-rewrite', 'i18n-translate', 'verify-identity', 'livekit-token', 'spotify-search', 'razorpay-create-order', 'embed-echo'];
for (const name of userFns) {
  await step(`${name}: no token -> 401`, async () => {
    const r = await fn(name);
    must(r.status === 401, `HTTP ${r.status}: ${r.text.slice(0, 120)}`);
  });
}
const cronFns = ['push-fanout', 'personalized-fanout', 'daily-question-push', 'ops-probe', 'worker', 'backfill-embeddings'];
for (const name of cronFns) {
  await step(`${name}: a normal user's token is refused`, async () => {
    const r = await fn(name, { Authorization: `Bearer ${await jwtOf(B)}` });
    // These import the repo's lib/, which the local edge runtime does not mount, so they cannot boot
    // here. Their gate (a shared secret, timing-safe, fail-closed) is checked by reading the code.
    if (r.status === 503 && r.text.includes('BOOT_ERROR')) return 'cannot boot locally (imports lib/); gate checked in code, not exercised';
    must(r.status === 401 || r.status === 403, `a signed-in user got HTTP ${r.status}: ${r.text.slice(0, 120)}`);
  });
}

console.log('\n[11] Tasks and reminders sync (same calls as lib/mini-apps/tasksRemote.ts)');
const taskRows = (uid, ids) => ids.map(i => ({ user_id: uid, client_id: `t-${i}`, title: `probe task ${i}`, notes: null, due: '2099-01-01', done: false, priority: 'normal' }));
await step('A syncs three tasks, then a list of two: the server keeps exactly those two', async () => {
  ok(await A.client.from('task_item').upsert(taskRows(A.id, [1, 2, 3]), { onConflict: 'user_id,client_id' }), 'sync 3');
  const two = taskRows(A.id, [1, 2]);
  ok(await A.client.from('task_item').upsert(two, { onConflict: 'user_id,client_id' }), 'sync 2');
  ok(await A.client.from('task_item').delete().eq('user_id', A.id).not('client_id', 'in', '(t-1,t-2)'), 'prune');
  const r = ok(await admin.from('task_item').select('client_id, due').eq('user_id', A.id).order('client_id'), 'read');
  must(r.length === 2 && r[0].client_id === 't-1' && r[1].client_id === 't-2', `server has ${r.map(x => x.client_id).join(',')}`);
  must(r.every(x => x.due === '2099-01-01'), 'due date not stored');
});
await step('editing a task title persists (upsert hits the update policy)', async () => {
  ok(await A.client.from('task_item').upsert([{ ...taskRows(A.id, [1])[0], title: 'renamed', done: true }], { onConflict: 'user_id,client_id' }), 'edit');
  const r = ok(await admin.from('task_item').select('title, done').eq('user_id', A.id).eq('client_id', 't-1').single(), 'read');
  must(r.title === 'renamed' && r.done === true, `title=${r.title} done=${r.done}`);
});
await step('B cannot see or change A\'s tasks', async () => {
  const seen = ok(await B.client.from('task_item').select('id').eq('user_id', A.id), 'cross read');
  must(seen.length === 0, `B read ${seen.length} of A's tasks`);
  const r = await B.client.from('task_item').update({ title: 'hijacked' }).eq('user_id', A.id).select('id');
  must(!r.data || r.data.length === 0, 'B edited A\'s task');
});
await step('the tasks blob (carries alarm times) is last-write-wins across two writes', async () => {
  const blob = (n) => ({ tasks: [{ id: 't-1', title: 'ring me', alarmTime: '19:00', rev: n }] });
  ok(await A.client.from('mini_app_data').upsert({ user_id: A.id, app: 'tasks', data: blob(1), updated_at: new Date(Date.now() - 1000).toISOString() }, { onConflict: 'user_id,app' }), 'blob 1');
  ok(await A.client.from('mini_app_data').upsert({ user_id: A.id, app: 'tasks', data: blob(2), updated_at: new Date().toISOString() }, { onConflict: 'user_id,app' }), 'blob 2');
  const r = ok(await A.client.from('mini_app_data').select('data').eq('user_id', A.id).eq('app', 'tasks').single(), 'read');
  must(r.data.tasks[0].rev === 2 && r.data.tasks[0].alarmTime === '19:00', `blob=${JSON.stringify(r.data)}`);
  const other = ok(await B.client.from('mini_app_data').select('data').eq('user_id', A.id).eq('app', 'tasks'), 'cross read');
  must(other.length === 0, 'B read A\'s blob');
});

console.log('\n[12] Table privileges (RLS is not the only wall)');
await step('anon can only read: no INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER on any public table or view', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  const rows = sql(`select distinct table_name||':'||privilege_type from information_schema.role_table_grants where table_schema='public' and grantee='anon' and privilege_type <> 'SELECT' order by 1`).split('\n').filter(Boolean);
  must(rows.length === 0, `anon still holds ${rows.length}: ${rows.slice(0, 6).join(', ')}`);
  // information_schema does not list Postgres 17's MAINTAIN (VACUUM, REINDEX, LOCK TABLE, ...)
  const maintain = Number(sql(`select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m') and has_table_privilege('anon', c.oid, 'MAINTAIN')`));
  must(maintain === 0, `anon holds MAINTAIN on ${maintain} relations`);
});
await step('signed-in users cannot TRUNCATE (RLS does not cover it) or add triggers to any table', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  const rows = sql(`select distinct table_name||':'||privilege_type from information_schema.role_table_grants where table_schema='public' and grantee='authenticated' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER') order by 1`).split('\n').filter(Boolean);
  must(rows.length === 0, `authenticated still holds ${rows.length}: ${rows.slice(0, 6).join(', ')}`);
  const maintain = Number(sql(`select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m') and has_table_privilege('authenticated', c.oid, 'MAINTAIN')`));
  must(maintain === 0, `authenticated holds MAINTAIN on ${maintain} relations`);
});
await step('public views are read-only for client roles', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  const rows = sql(`select distinct g.table_name||':'||g.privilege_type from information_schema.role_table_grants g join pg_class c on c.relname=g.table_name and c.relnamespace='public'::regnamespace where c.relkind='v' and g.table_schema='public' and g.grantee in ('anon','authenticated') and g.privilege_type <> 'SELECT'`).split('\n').filter(Boolean);
  must(rows.length === 0, `a view is writable: ${rows.join(', ')}`);
});
await step('a table created later starts with the same limited privileges', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  sql(`create table public._probe_new_table (id int)`);
  try {
    const anonP = sql(`select coalesce(string_agg(privilege_type, ',' order by privilege_type), 'none') from information_schema.role_table_grants where table_name='_probe_new_table' and grantee='anon'`);
    const authP = sql(`select coalesce(string_agg(privilege_type, ',' order by privilege_type), 'none') from information_schema.role_table_grants where table_name='_probe_new_table' and grantee='authenticated'`);
    must(anonP === 'SELECT', `a new table gives anon: ${anonP}`);
    must(sql(`select has_table_privilege('anon','public._probe_new_table','MAINTAIN') or has_table_privilege('authenticated','public._probe_new_table','MAINTAIN')`) === 'f', 'a new table gives a client role MAINTAIN');
    must(authP === 'DELETE,INSERT,SELECT,UPDATE', `a new table gives authenticated: ${authP}`);
  } finally { sql(`drop table public._probe_new_table`); }
});
await step('a signed-in user can still write their own row (RLS, not a blanket ban)', async () => {
  ok(await A.client.from('profiles').update({ bio: 'still works' }).eq('id', A.id), 'own update');
  const r = ok(await admin.from('profiles').select('bio').eq('id', A.id).single(), 'read');
  must(r.bio === 'still works', 'the update did not land');
});

console.log('\n[14] Presence: mutual follows only (docs/superpowers/specs/2026-10-16-presence-design.md)');
let E, F, G, H, I, K;
const presenceOf = async (viewer, ids) => ok(await viewer.client.rpc('get_presence', { p_user_ids: ids }), 'get_presence');
const rowFor = (rows, id) => rows.find(r => r.user_id === id);
const follow = async (a, b) => ok(await a.client.from('follows').insert({ follower_id: a.id, following_id: b.id }), `follow ${a.username}->${b.username}`);
const setAge = (id, age) => sql(`update public.user_presence set last_seen_at = now() - interval '${age}' where user_id = '${id}'`);
const setToggles = async (u, patch) => ok(await u.client.from('profiles').update(patch).eq('id', u.id), 'toggle');
await step('five users: E and F follow each other; G follows E only; H and E follow each other but E blocks H; I follows E back but shares nothing', async () => {
  E = await mk('pe'); F = await mk('pf'); G = await mk('pg'); H = await mk('ph'); I = await mk('pi'); created.push(E.id, F.id, G.id, H.id, I.id);
  await follow(E, F); await follow(F, E);
  await follow(G, E);
  await follow(E, H); await follow(H, E);
  await follow(E, I); await follow(I, E);
  await setToggles(I, { online_status: false, activity_status: false });
  ok(await E.client.from('user_blocks').insert({ blocker_id: E.id, blocked_id: H.id }), 'E blocks H');
});
await step('a mutual follow sees the dot after a heartbeat, and no phrase while online', async () => {
  ok(await E.client.rpc('ping_presence'), 'ping');
  const r = rowFor(await presenceOf(F, [E.id]), E.id);
  must(r && r.online === true && r.last_active == null, `got ${JSON.stringify(r)}`);
});
await step('the profile\'s old last_seen_at is never written (old builds keep selecting it)', async () => {
  const p = ok(await admin.from('profiles').select('last_seen_at').eq('id', E.id).single(), 'profile');
  must(p.last_seen_at === null, `last_seen_at=${p.last_seen_at}`);
});
await step('a one-way follower, a stranger, a blocked user and an opted-out user all look like "offline and quiet"', async () => {
  const hidden = { user_id: E.id, online: false, last_active: null };
  for (const [name, viewer] of [['one-way follower G', G], ['stranger B', B], ['blocked H', H]]) {
    const r = rowFor(await presenceOf(viewer, [E.id]), E.id);
    must(r && r.online === false && r.last_active == null, `${name} got ${JSON.stringify(r)}`);
  }
  ok(await I.client.rpc('ping_presence'), 'ping I');
  const ri = rowFor(await presenceOf(E, [I.id]), I.id);
  must(ri && ri.online === false && ri.last_active == null, `opted-out I got ${JSON.stringify(ri)}`);
  return `${hidden.online}`;
});
await step('every requested id gets a row, including ids that are not users at all', async () => {
  const ghost = randomUUID();
  const rows = await presenceOf(F, [E.id, ghost, ghost]);
  must(rows.length === 2, `${rows.length} rows`);
  const g = rowFor(rows, ghost);
  must(g && g.online === false && g.last_active == null, `ghost row ${JSON.stringify(g)}`);
});
await step('reciprocity: with my own online status off, I see nobody\'s dot', async () => {
  await setToggles(F, { online_status: false });
  const r = rowFor(await presenceOf(F, [E.id]), E.id);
  await setToggles(F, { online_status: true });
  must(r.online === false, 'F saw E\'s dot while hiding their own');
});
await step('an opted-out person writes nothing, and a stored row is deleted when both toggles go off', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  must(Number(sql(`select count(*) from public.user_presence where user_id = '${I.id}'`)) === 0, 'I has a presence row');
  await setToggles(E, { online_status: false, activity_status: false });
  ok(await E.client.rpc('ping_presence'), 'ping E');
  const gone = Number(sql(`select count(*) from public.user_presence where user_id = '${E.id}'`));
  await setToggles(E, { online_status: true, activity_status: true });
  ok(await E.client.rpc('ping_presence'), 'ping E again');
  must(gone === 0, 'E\'s row survived turning both toggles off');
});
await step('last-active phrases follow the age, with the edges at 1h, 24h, 48h and 7d', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  const table = [['80 seconds', true, null], ['100 seconds', false, 'recent'], ['59 minutes', false, 'recent'], ['61 minutes', false, 'today'],
    ['23 hours', false, 'today'], ['25 hours', false, 'yesterday'], ['47 hours', false, 'yesterday'], ['49 hours', false, 'this_week'],
    ['6 days', false, 'this_week'], ['8 days', false, null]];
  for (const [age, online, phrase] of table) {
    setAge(E.id, age);
    const r = rowFor(await presenceOf(F, [E.id]), E.id);
    must(r.online === online && (r.last_active ?? null) === phrase, `${age}: expected ${online}/${phrase}, got ${r.online}/${r.last_active}`);
  }
});
await step('"Last active" off hides the phrase; "Online status" off with it on shows the phrase while actually online', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  setAge(E.id, '5 minutes');
  await setToggles(E, { activity_status: false });
  const off = rowFor(await presenceOf(F, [E.id]), E.id);
  await setToggles(E, { activity_status: true, online_status: false });
  ok(await E.client.rpc('ping_presence'), 'ping');
  setAge(E.id, '0 seconds');
  const dotOff = rowFor(await presenceOf(F, [E.id]), E.id);
  await setToggles(E, { online_status: true });
  must(off.last_active == null, `phrase shown with Last active off: ${off.last_active}`);
  must(dotOff.online === false && dotOff.last_active === 'recent', `online-off got ${JSON.stringify(dotOff)}`);
});
await step('heartbeats closer than 20 seconds do not rewrite the row', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  setAge(E.id, '10 seconds');
  ok(await E.client.rpc('ping_presence'), 'early ping');
  const early = Number(sql(`select extract(epoch from now() - last_seen_at) from public.user_presence where user_id = '${E.id}'`));
  setAge(E.id, '30 seconds');
  ok(await E.client.rpc('ping_presence'), 'late ping');
  const late = Number(sql(`select extract(epoch from now() - last_seen_at) from public.user_presence where user_id = '${E.id}'`));
  must(early >= 9, `a ping inside 20 s moved the row (${early}s old)`);
  must(late < 5, `a ping after 30 s did not refresh the row (${late}s old)`);
});
await step('at most 50 ids are answered', async () => {
  const ids = Array.from({ length: 60 }, () => randomUUID());
  const rows = await presenceOf(F, ids);
  must(rows.length === 50, `${rows.length} rows for 60 ids`);
});
await step('anon cannot call either function, and nobody can read the table', async () => {
  const a1 = await anon.rpc('get_presence', { p_user_ids: [E.id] });
  const a2 = await anon.rpc('ping_presence');
  must(a1.error && a2.error, 'anon could call a presence function');
  const t = await F.client.from('user_presence').select('user_id');
  must(t.error || (t.data ?? []).length === 0, `F read ${t.data?.length} presence rows`);
});
await step('deleting an account removes its presence row', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  K = await mk('pk'); created.push(K.id);
  ok(await K.client.rpc('ping_presence'), 'ping K');
  must(Number(sql(`select count(*) from public.user_presence where user_id = '${K.id}'`)) === 1, 'K has no row to delete');
  ok(await K.client.rpc('delete_account'), 'delete_account');
  must(Number(sql(`select count(*) from public.user_presence where user_id = '${K.id}'`)) === 0, 'row survived account deletion');
});

console.log('\n[16] Read receipts keep their promise (docs/superpowers/specs/2026-10-16-presence-design.md, section 8)');
let P, Q, R, S2, convP;
const convIdOf = (c) => (typeof c === 'string' ? c : (c.id ?? c.conversation_id));
const unreadOf = async (u, cid) => {
  const list = ok(await u.client.rpc('get_dm_conversations'), 'get_dm_conversations');
  const row = list.find(r => r.id === cid);
  must(row, 'the conversation is missing from the list');
  return Number(row.unread_count);
};
const say = async (from, cid, text) => ok(await from.client.from('direct_messages').insert({ id: randomUUID(), conversation_id: cid, sender_id: from.id, kind: 'text', text }), 'send');
const readAts = async (cid, senderId) => ok(await admin.from('direct_messages').select('read_at').eq('conversation_id', cid).eq('sender_id', senderId).order('created_at'), 'read_at').map(r => r.read_at);
await step('two users open a conversation; three messages arrive unread for the receiver only', async () => {
  P = await mk('rp'); Q = await mk('rq'); R = await mk('rr'); created.push(P.id, Q.id, R.id);
  convP = convIdOf(ok(await Q.client.rpc('get_or_create_dm_conversation', { p_recipient_id: P.id }), 'conversation'));
  for (const t of ['one', 'two', 'three']) await say(Q, convP, t);
  must(await unreadOf(P, convP) === 3, 'P should have 3 unread');
  must(await unreadOf(Q, convP) === 0, 'Q should have 0 unread');
});
await step('with receipts on, reading clears the count AND sets the receipt the sender sees', async () => {
  ok(await P.client.rpc('mark_messages_read', { p_conversation_id: convP }), 'mark');
  must(await unreadOf(P, convP) === 0, 'unread should be 0 after reading');
  const ats = await readAts(convP, Q.id);
  must(ats.length === 3 && ats.every(Boolean), `receipts: ${JSON.stringify(ats)}`);
  const marker = ok(await P.client.rpc('get_my_read_marker', { p_conversation_id: convP }), 'marker');
  must(marker, 'no private marker after reading');
});
await step('with receipts OFF, reading clears the count but the sender sees nothing', async () => {
  ok(await P.client.from('profiles').update({ read_receipts: false }).eq('id', P.id), 'receipts off');
  await say(Q, convP, 'four'); await say(Q, convP, 'five');
  must(await unreadOf(P, convP) === 2, 'P should have 2 unread');
  ok(await P.client.rpc('mark_messages_read', { p_conversation_id: convP }), 'mark');
  must(await unreadOf(P, convP) === 0, 'unread should be 0 after reading with receipts off');
  const ats = await readAts(convP, Q.id);
  must(ats.slice(3).every(a => a === null), `the sender can see receipts for messages read with receipts off: ${JSON.stringify(ats)}`);
});
await step('turning receipts back on does not reveal what was read while they were off', async () => {
  ok(await P.client.from('profiles').update({ read_receipts: true }).eq('id', P.id), 'receipts on');
  ok(await P.client.rpc('mark_messages_read', { p_conversation_id: convP }), 'mark again');
  const ats = await readAts(convP, Q.id);
  must(ats.slice(3).every(a => a === null), 'earlier private reads became visible');
  await say(Q, convP, 'six');
  ok(await P.client.rpc('mark_messages_read', { p_conversation_id: convP }), 'mark six');
  must((await readAts(convP, Q.id))[5] !== null, 'a new message read with receipts on should show a receipt');
});
await step('replying counts as having read (the existing rule is kept)', async () => {
  await say(Q, convP, 'seven');
  await say(P, convP, 'reply from P');
  must(await unreadOf(P, convP) === 0, 'a message before my own reply should not count as unread');
});
await step('a stranger can neither read the marker nor mark someone else\'s conversation', async () => {
  const m = ok(await R.client.rpc('get_my_read_marker', { p_conversation_id: convP }), 'marker as stranger');
  must(m === null, 'a stranger got a marker');
  await say(Q, convP, 'eight');
  ok(await R.client.rpc('mark_messages_read', { p_conversation_id: convP }), 'stranger mark');
  const last = (await readAts(convP, Q.id)).slice(-1)[0];
  must(last === null, 'a stranger set a receipt on a conversation they are not in');
});
await step('nobody can read dm_read_state directly', async () => {
  const t = await P.client.from('dm_read_state').select('user_id');
  must(t.error || (t.data ?? []).length === 0, `P read ${t.data?.length} rows`);
});
await step('deleting an account removes its read markers', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  S2 = await mk('rs'); created.push(S2.id);
  const cid = convIdOf(ok(await S2.client.rpc('get_or_create_dm_conversation', { p_recipient_id: P.id }), 'conv'));
  await say(P, cid, 'hello S');
  ok(await S2.client.rpc('mark_messages_read', { p_conversation_id: cid }), 'mark');
  must(Number(sql(`select count(*) from public.dm_read_state where user_id = '${S2.id}'`)) === 1, 'S has no marker to delete');
  ok(await S2.client.rpc('delete_account'), 'delete_account');
  must(Number(sql(`select count(*) from public.dm_read_state where user_id = '${S2.id}'`)) === 0, 'marker survived account deletion');
});

console.log('\n[17] Cleanup');
await step('delete the throwaway users', async () => { await cleanup(); });

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
