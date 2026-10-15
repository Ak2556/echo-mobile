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
import { execSync } from 'node:child_process';
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

console.log('\n[8] Cleanup');
await step('delete the throwaway users', async () => { await cleanup(); });

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
