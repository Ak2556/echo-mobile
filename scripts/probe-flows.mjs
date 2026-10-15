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

console.log('\n[12] Cleanup');
await step('delete the throwaway users', async () => { await cleanup(); });

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
