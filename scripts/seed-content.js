#!/usr/bin/env node
/**
 * scripts/seed-content.js
 * ---------------------------------------------------------------------------
 * Seeds a small set of PERMANENT, hand-curated "echoes" + author accounts into
 * the production Supabase project, so a brand-new user (and an investor demo)
 * lands in a feed that already feels alive instead of empty. This is the
 * cold-start fix: every differentiator (semantic "For You", thinking partners,
 * remix, daily divergence) needs a content pool to be worth anything.
 *
 * WHY A SCRIPT, NOT A MIGRATION
 *   public.profiles.id has a hard FK to auth.users(id). Creating auth users
 *   safely on a production project means supabase.auth.admin.createUser — NOT
 *   raw INSERTs into the GoTrue-managed auth.users table, whose NOT NULL columns
 *   drift between GoTrue versions and would make a migration brittle on prod.
 *
 * IDEMPOTENT
 *   Accounts are keyed by a stable email; echoes and comments by deterministic
 *   UUIDv5 ids. Re-running updates rows in place instead of duplicating.
 *
 * EMBEDDINGS
 *   Echoes are inserted with check_content=true so they're visible in the
 *   ranked/"Trending" feed immediately. The semantic "For You" feed also needs
 *   a vector(768) embedding per echo. Pass --embed to invoke the already-deployed
 *   embed-echo function for each seeded echo (reuses the exact moderation +
 *   embedding path real publishes use, keeping OPENROUTER_API_KEY server-side).
 *   You can also backfill later via the backfill-embeddings function.
 *
 * USAGE
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/seed-content.js            # seed accounts + echoes
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/seed-content.js --embed    # also generate embeddings
 *
 *   Get the service role key from:
 *     Supabase dashboard → Project Settings → API → service_role (secret)
 *
 * SAFETY
 *   - Service role bypasses RLS by design; run it from a trusted machine only.
 *   - It writes ONLY to the rows it owns (the seed accounts + their echoes).
 *   - It never deletes anything.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Plain `node` (unlike Expo) does not auto-load .env. Load it ourselves so the
// project URL is picked up automatically — the operator then only has to pass
// SUPABASE_SERVICE_ROLE_KEY. Existing env vars always win; no overwrite.
(function loadDotEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim().replace(/^["']|["']$/g, '');
      if (val && process.env[key] === undefined) process.env[key] = val;
    }
  } catch { /* best-effort */ }
})();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DO_EMBED = process.argv.includes('--embed');
// --dry-run validates the dataset and prints a summary WITHOUT touching the DB
// (no credentials required). Run this before a real seed to sanity-check.
const DRY_RUN = process.argv.includes('--dry-run');

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_KEY)) {
  if (!SUPABASE_URL) console.error('❌  Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL).');
  if (!SERVICE_KEY) console.error('❌  Missing SUPABASE_SERVICE_ROLE_KEY.');
  console.error('   Get the service role key from: Supabase dashboard → Project Settings → API → service_role');
  console.error('   Then run:');
  console.error('     SUPABASE_URL=https://<ref>.supabase.co \\');
  console.error('     SUPABASE_SERVICE_ROLE_KEY=<key> \\');
  console.error('     node scripts/seed-content.js');
  process.exit(1);
}

const supabase = DRY_RUN
  ? null
  : createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

// Fixed namespace so UUIDv5(name) is stable across runs → idempotent upserts.
const NS = '6f3c9d2e-1b4a-4c7e-9f8a-2d5e7c1a3b6f';
function uuidv5(name) {
  const nsBytes = Buffer.from(NS.replace(/-/g, ''), 'hex');
  const h = crypto.createHash('sha1');
  h.update(nsBytes);
  h.update(Buffer.from(name, 'utf8'));
  const b = h.digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const x = b.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
function hoursAgo(h) { return new Date(Date.now() - h * HOUR).toISOString(); }

// ── Seed authors ────────────────────────────────────────────────────────────
// Distinct voices so the feed reads like a small, interesting community.
const AUTHORS = [
  {
    key: 'maya',
    username: 'maya_thinks',
    display_name: 'Maya Chen',
    email: 'seed.maya@echo.app',
    avatar_color: '#6366F1',
    is_verified: true,
    follower_count: 312,
    bio: 'Borrowing other people’s brains for a living. Science, philosophy, the occasional 2am question.',
  },
  {
    key: 'dev',
    username: 'devkapoor',
    display_name: 'Dev Kapoor',
    email: 'seed.dev@echo.app',
    avatar_color: '#10B981',
    is_verified: true,
    follower_count: 248,
    bio: 'Building things, breaking things, writing it down. Engineering + money + leverage.',
  },
  {
    key: 'lina',
    username: 'lina_writes',
    display_name: 'Lina Okafor',
    email: 'seed.lina@echo.app',
    avatar_color: '#F43F5E',
    is_verified: false,
    follower_count: 191,
    bio: 'Reader first, writer second. Stories, voice, the craft of saying the true thing.',
  },
  {
    key: 'arjun',
    username: 'arjun_explores',
    display_name: 'Arjun Rao',
    email: 'seed.arjun@echo.app',
    avatar_color: '#F59E0B',
    is_verified: false,
    follower_count: 167,
    bio: 'Slow travel, good light, better food. Currently somewhere with bad wifi.',
  },
  {
    key: 'sofia',
    username: 'sofia_builds',
    display_name: 'Sofia Marin',
    email: 'seed.sofia@echo.app',
    avatar_color: '#8B5CF6',
    is_verified: true,
    follower_count: 224,
    bio: 'Designer. I make things feel obvious. Taste is a skill, not a gift.',
  },
  {
    key: 'theo',
    username: 'theo_asks',
    display_name: 'Theo Bennett',
    email: 'seed.theo@echo.app',
    avatar_color: '#0EA5E9',
    is_verified: false,
    follower_count: 138,
    bio: 'History rhymes; I’m here for the rhymes. Economics, institutions, long time horizons.',
  },
];

// ── Seed echoes ─────────────────────────────────────────────────────────────
// `snapshot` (optional) is the full multi-turn transcript — it boosts the
// thoughtfulness score and gives the thread view real depth. `comments`
// (optional) seeds genuine discussion on flagship echoes.
const ECHOES = [
  // ───────── Maya — science / philosophy / psychology / books ─────────
  {
    slug: 'maya-time-faster',
    author: 'maya',
    title: 'Why time feels faster as you age',
    prompt: 'Why does time feel like it speeds up as you get older?',
    response:
      'Two things stack on top of each other.\n\nThe first is proportional: at five years old, a year is 20% of your whole life. At fifty, it’s 2%. The same twelve months are a smaller fraction of everything you’ve known, so they *feel* smaller.\n\nThe second is about novelty. Your brain doesn’t record time evenly — it lays down dense memories when things are new and barely anything when they’re routine. A childhood summer was wall-to-wall first times, so it reads as long in hindsight. An adult month of the same commute and the same lunch compresses into almost nothing, because there’s little to remember it by.\n\nThe practical upshot is oddly hopeful: novelty is the lever. New places, new skills, new people physically thicken your sense of time. You can’t add years to the calendar, but you can make the ones you have feel longer by refusing to autopilot through them.',
    likes: 184, reposts: 41, views: 4200, days_h: 30,
    comments: [
      { author: 'lina', content: 'The “novelty thickens time” idea reframed my whole year. Saving this.', after_h: 6 },
      { author: 'arjun', content: 'This is literally why I travel. A weekend in a new city feels longer than a month at home.', after_h: 14 },
    ],
  },
  {
    slug: 'maya-free-will',
    author: 'maya',
    title: 'Is free will an illusion? A clearer way to hold the question',
    prompt: 'Do we actually have free will, or is that an illusion?',
    response:
      'It depends entirely on which question you’re really asking, and most arguments are two people answering different ones.\n\nIf you mean “could I have done otherwise, with the exact same atoms in the exact same state?” — probably not. Physics doesn’t leave a magic gap where an uncaused you reaches in and nudges a neuron. That kind of libertarian free will is hard to defend.\n\nBut that’s rarely what we *mean* when we use the word. We mean: was the action mine? Did it flow from my values, my reasoning, my character — rather than a gun to my head or a seizure? That version (philosophers call it compatibilism) survives perfectly well in a deterministic universe. Your deliberation is a real, causal step in the chain, not a bystander to it.\n\nSo the honest answer is: you are not a ghost steering a machine from outside physics. You ARE the machine, deliberating — and that deliberation genuinely determines what happens next. Whether that counts as “free” is a question about what you wanted the word to do.',
    snapshot: [
      { role: 'user', content: 'Do we actually have free will, or is that an illusion?' },
      { role: 'assistant', content: 'Before I answer — what would change for you if the answer were “no”? People mean very different things by the question, and the stakes usually reveal which one.' },
      { role: 'user', content: 'I guess I want to know if I’m actually responsible for my choices or just along for the ride.' },
      { role: 'assistant', content: 'That’s the key move — you’re asking about *authorship and responsibility*, not about quantum loopholes in physics. Those are separable. Let me untangle them.\n\nIf you mean “could I have done otherwise with the exact same atoms in the exact same state?” — probably not. Physics doesn’t leave a magic gap where an uncaused you nudges a neuron.\n\nBut that’s not what “my choice” usually means. We mean: did it flow from my values and reasoning, rather than coercion or a seizure? That version survives fine in a deterministic universe. Your deliberation is a real, causal step in the chain — not a bystander to it.' },
      { role: 'user', content: 'So I’m not a ghost steering the machine.' },
      { role: 'assistant', content: 'Right. You ARE the machine, deliberating — and that deliberation genuinely determines what happens next. You don’t need a gap in physics to be responsible; you need the action to come from *you*, and it does. Whether that counts as “free” is a question about what you wanted the word to do.' },
    ],
    likes: 241, reposts: 67, views: 5800, days_h: 52,
    comments: [
      { author: 'theo', content: 'Compatibilism is the most underrated idea in philosophy. You explained it better in six lines than my professor did in a semester.', after_h: 9 },
      { author: 'dev', content: '“You ARE the machine, deliberating.” Going to be thinking about that all week.', after_h: 20 },
    ],
  },
  {
    slug: 'maya-mental-model',
    author: 'maya',
    title: 'The most useful thinking tool I know: invert',
    prompt: 'What’s the single most useful mental model you know?',
    response:
      'Inversion. Instead of asking “how do I succeed at this?”, ask “how would I guarantee failure?” — then don’t do those things.\n\nIt sounds like a parlor trick, but it works because avoiding stupidity is easier and more reliable than seeking brilliance. Want a good relationship? The path to a bad one is obvious and short: contempt, never apologizing, keeping score. Want to stay healthy? The reliable route to the opposite is also clear. The failure modes are usually fewer and more concrete than the success routes, so they’re easier to act on.\n\nCharlie Munger built half his reputation on “all I want to know is where I’m going to die, so I’ll never go there.” It’s the same move. When a problem feels too open-ended to start, flip it. The negative space is often sharper than the thing itself.',
    likes: 132, reposts: 38, views: 2600, days_h: 96,
  },
  {
    slug: 'maya-entropy',
    author: 'maya',
    title: 'Entropy, explained like it matters to your actual life',
    prompt: 'Explain entropy in a way that actually means something to my daily life.',
    response:
      'Entropy is just this: there are vastly more ways for things to be messy than to be neat, so left alone, things drift toward mess. Not because the universe is malicious — because messy states are simply more numerous, and randomness lands you in the common case.\n\nThere’s only one arrangement of papers that is “sorted.” There are billions that count as “a pile.” Shuffle and you’ll get a pile every time.\n\nWhy does this matter? Because it tells you something true about effort. Every ordered thing in your life — a tidy room, a fit body, a working relationship, a clear codebase — is a low-entropy state held against the current. It will decay the instant you stop spending energy on it, and that’s not a personal failing, it’s physics. The lesson isn’t despair; it’s that maintenance isn’t optional and isn’t a sign you did something wrong. Order is a verb.',
    likes: 97, reposts: 22, views: 1900, days_h: 140,
  },
  {
    slug: 'maya-dreams',
    author: 'maya',
    title: 'What dreaming is actually for',
    prompt: 'Why do we dream? Is there a real function or is it just noise?',
    response:
      'The honest scientific answer is “we’re not certain,” but two theories have the most evidence behind them, and they’re not mutually exclusive.\n\nThe first is memory consolidation. During sleep your brain replays the day, strengthening what matters and pruning what doesn’t. Dreams may be the felt experience of that sorting — fragments getting filed, which is why they often remix recent events with old ones.\n\nThe second is threat simulation. Dreams skew negative and social — being chased, falling, showing up unprepared — far more than waking life does. One idea is that this is a safe rehearsal space: practicing fear and problem-solving with no real stakes, the way a flight simulator lets a pilot crash a hundred times and walk away.\n\nWhat I find striking is that both theories share a theme: sleep isn’t downtime. It’s the night shift doing maintenance the day shift can’t. You don’t dream *despite* resting — dreaming may be part of what resting is for.',
    likes: 76, reposts: 15, views: 1400, days_h: 180,
  },

  // ───────── Dev — coding / tech / finance / productivity ─────────
  {
    slug: 'dev-senior-eng',
    author: 'dev',
    title: 'What actually separates senior engineers from junior ones',
    prompt: 'What’s the real difference between a senior engineer and a junior one? It’s not just years.',
    response:
      'It’s almost never the syntax. By the time someone’s mid-level, everyone can write the loop.\n\nThe real gap is comfort with ambiguity. A junior engineer is great once the problem is fully specified — give them a clear ticket and they ship it. A senior engineer is the one you hand a vague, contradictory mess to and they come back with the *right* problem to solve, having quietly killed three bad ideas and one entire feature that shouldn’t exist.\n\nThe second thing is taste about cost. Juniors optimize for “does it work.” Seniors optimize for “what will this cost in eighteen months” — to read, to change, to onboard the next person into. They write the boring solution on purpose. They know that cleverness is a loan against future understanding, and they hate debt.\n\nAnd the quiet one nobody lists: seniors make the people around them better. They review code so you learn, not so you feel small. Leverage stops being about what they can build alone and starts being about what the team can build because they’re there.',
    snapshot: [
      { role: 'user', content: 'What’s the real difference between a senior engineer and a junior one? It’s not just years.' },
      { role: 'assistant', content: 'Agreed it’s not years. Quick question so I aim this right: are you trying to *become* one, or trying to *evaluate* one (hiring, promo)?' },
      { role: 'user', content: 'Become one. I’ve been coding 3 years and I feel stuck at “good at the task I’m given.”' },
      { role: 'assistant', content: 'That sentence is actually the diagnosis. “Good at the task I’m given” is exactly the junior ceiling — and the gap above it isn’t more syntax.\n\nThe real jump is comfort with ambiguity. You’re great once the problem is fully specified. The senior move is taking a vague, contradictory mess and coming back with the *right* problem to solve — having quietly killed three bad ideas and one feature that shouldn’t exist.' },
      { role: 'user', content: 'How do I practice that? Ambiguity isn’t a LeetCode problem.' },
      { role: 'assistant', content: 'Right — you practice it by volunteering for the underspecified work everyone avoids. Next vague ticket, don’t ask “what exactly do you want me to build.” Instead write a one-paragraph proposal: here’s what I think the real problem is, here are two options, here’s the one I’d pick and why. Send it *before* coding.\n\nDo that ten times and you’ll have built the muscle that actually gets people promoted: turning fog into a decision. The second muscle is taste about cost — write the boring solution on purpose, because cleverness is a loan against future understanding. Seniors hate that debt.' },
    ],
    likes: 268, reposts: 88, views: 6100, days_h: 26,
    comments: [
      { author: 'sofia', content: 'Replace “engineer” with “designer” and every word still holds. The ambiguity thing is the whole job.', after_h: 5 },
      { author: 'maya', content: 'Sent this to my brother who just started his first dev role. The “write the proposal before you code” tip is gold.', after_h: 11 },
    ],
  },
  {
    slug: 'dev-compound-interest',
    author: 'dev',
    title: 'Compound interest, finally explained so it lands',
    prompt: 'I know compound interest is important but it’s never really clicked. Make it click.',
    response:
      'Here’s the version that made it real for me: ignore the percentages and think in *doublings*.\n\nMoney growing at a steady rate doesn’t add — it doubles, again and again, on a fixed clock. At 7% a year, your money doubles roughly every ten years (that’s the “rule of 72” — 72 ÷ rate ≈ years to double). So ₹1 lakh today isn’t “growing slowly.” It’s 2 lakh in a decade, 4 in two, 8 in three, 16 in four.\n\nThe whole magic is in the *last* doubling. Going from 8 to 16 lakh is the same single doubling as going from 1 to 2 — but it adds 8 lakh instead of 1. That’s why starting early beats investing more later: the early money has time to reach the steep doublings, and the late money never does.\n\nThe brutal flip side: this is exactly how credit-card debt eats people, just running in the other direction. The same engine builds you or buries you. The only choice you get is which side of it you’re standing on.',
    likes: 154, reposts: 52, views: 3100, days_h: 70,
    comments: [
      { author: 'theo', content: 'The “magic is in the last doubling” framing should be taught in every school. Most people quit before the curve gets interesting.', after_h: 8 },
    ],
  },
  {
    slug: 'dev-rust-or-go',
    author: 'dev',
    title: 'Rust or Go in 2026? Wrong question — here’s the right one',
    prompt: 'Should I learn Rust or Go in 2026?',
    response:
      'Neither answer is right, because the question is missing its other half: *to do what?*\n\nGo is what you reach for when the goal is shipping a reliable backend service fast and never thinking about it again. It’s deliberately boring — small language, fast compiles, garbage-collected, brilliant for networked services and CLI tools. You’ll be productive in a weekend. The ceiling is lower but you almost never hit it.\n\nRust is what you reach for when control and correctness are the whole point — systems where a crash or a memory bug is unacceptable, or where you need C-level performance without C-level footguns. The borrow checker will fight you for a month and then quietly make a whole category of bugs impossible. Higher ceiling, much steeper floor.\n\nSo: building services and want momentum? Go. Building something performance-critical, or you want to genuinely level up how you think about memory and ownership? Rust. And if the honest answer is “I just want a job” — look at what your target companies actually post, and let that break the tie. The market is a more useful advisor than the internet’s flame wars.',
    likes: 88, reposts: 19, views: 2200, days_h: 110,
  },
  {
    slug: 'dev-naming',
    author: 'dev',
    title: 'Why naming things is the hardest part of programming',
    prompt: 'Why is naming variables and functions so weirdly hard?',
    response:
      'Because a name isn’t a label — it’s a compression of intent. When you name something well, you’re claiming to understand exactly what it is and isn’t, and most of the time, while you’re writing the code, you don’t yet.\n\nA bad name is usually a symptom, not the disease. If you can’t name a function cleanly, it’s often because the function does two things, or the concept underneath is still fuzzy in your own head. The struggle to name it is really the struggle to finish thinking. That’s why renaming something often forces you to redesign it — and why the new name makes the whole file easier to read, not just that line.\n\nSo the next time a name won’t come, don’t reach for `data2` or `handleStuff`. Treat it as a flashing light: the design isn’t done. The good name and the right design tend to show up at the same moment, because they’re the same insight wearing two outfits.',
    likes: 119, reposts: 31, views: 2400, days_h: 150,
  },
  {
    slug: 'dev-tech-debt',
    author: 'dev',
    title: 'How to actually think about technical debt',
    prompt: 'How should I think about technical debt? My team treats it like a moral failing.',
    response:
      'The metaphor is better than people use it. Debt isn’t the same as a mess — debt is borrowing speed now and paying interest later. And just like real debt, the question is never “is debt bad?” It’s “is this loan worth the interest, and can I afford the payments?”\n\nSometimes taking it on is exactly right. You’re testing whether anyone even wants the feature — hard-code it, ship it ugly, learn fast. That’s a smart loan; if the bet pays off you refactor, and if it doesn’t you delete it and you saved weeks. The sin isn’t borrowing. The sin is borrowing *unconsciously*, never tracking the balance, and acting shocked when the interest — every change taking twice as long — finally swallows your velocity.\n\nSo make it explicit. Name the debt in the PR. Leave a comment that says “shortcut: here’s what’s missing and why.” Healthy teams carry debt on purpose, with their eyes open, and pay it down where the interest actually hurts — not everywhere, and not nowhere. It’s a balance sheet, not a confession.',
    likes: 71, reposts: 17, views: 1600, days_h: 200,
  },

  // ───────── Lina — books / writing / culture / film ─────────
  {
    slug: 'lina-find-voice',
    author: 'lina',
    title: 'How to find your voice as a writer',
    prompt: 'Everyone says “find your voice” but no one explains how. How do you actually do it?',
    response:
      'Your voice isn’t hiding inside you waiting to be uncovered. It’s built — and it’s mostly your taste becoming visible through your choices.\n\nHere’s the mechanic almost nobody tells you: voice lives in what you *cut*, not what you add. Two writers can describe the same rainy street; the difference is what each one decides isn’t worth saying. You already have a voice in the negative — there are sentences you’d never write because they make you wince. That wince is the most valuable thing you own. Follow it.\n\nThe fastest way to find your own is, paradoxically, to imitate deliberately. Copy a writer you love until you can feel *why* their sentences land — then keep writing past the imitation. What survives after the influence wears off, the moves you kept because they felt like yours and not like theirs, that residue is the voice. It shows up in the editing, the rereading, the “no, not like that.”\n\nSo write a lot, and more importantly, *reject* a lot, out loud, on the page. Voice is just taste with enough reps to become a reflex.',
    snapshot: [
      { role: 'user', content: 'Everyone says “find your voice” but no one explains how. How do you actually do it?' },
      { role: 'assistant', content: 'Let me push back on the metaphor first, because it’s the thing that’s blocking you. “Find” implies your voice is a buried object. It isn’t. It’s built — and it’s mostly your taste becoming visible through your choices. Does that change how the question feels?' },
      { role: 'user', content: 'Kind of, but “taste” is just as vague. How do I even see my own taste?' },
      { role: 'assistant', content: 'Easier than it sounds: your taste shows up in what makes you wince. There are sentences you’d never write because they feel fake or overwrought. That wince is real data — it’s your voice in the negative, already fully formed. Most people ignore it because it feels like self-criticism. It’s actually self-portrait.' },
      { role: 'user', content: 'So how do I turn that into something I can do on purpose, not just react to?' },
      { role: 'assistant', content: 'Imitate deliberately, then outgrow it. Pick a writer you love and copy their moves until you can feel *why* a sentence lands. Then keep writing past the imitation. What survives after the influence wears off — the moves you kept because they felt like yours, not theirs — that residue is your voice.\n\nSo the practice is two things at once: write a lot, and reject a lot, out loud, on the page. Voice is just taste with enough reps to become a reflex.' },
    ],
    likes: 207, reposts: 61, views: 4600, days_h: 40,
    comments: [
      { author: 'sofia', content: '“Voice lives in what you cut.” This is true for design too. The whole craft is subtraction.', after_h: 7 },
      { author: 'maya', content: 'The wince as self-portrait, not self-criticism — that reframe just unblocked me.', after_h: 16 },
    ],
  },
  {
    slug: 'lina-sad-songs',
    author: 'lina',
    title: 'Why sad songs feel good',
    prompt: 'Why do sad songs make me feel good when I’m already sad? That seems backwards.',
    response:
      'It’s not backwards — it’s one of the kinder tricks the mind plays.\n\nPart of it is simple company. Real sadness is isolating; it whispers that no one else has felt exactly this. A sad song is proof that someone did, and cared enough to shape it into something beautiful. The grief gets a witness. You’re not crying alone anymore — you’re crying with someone who’s been there.\n\nThe deeper part is that the emotion is *safe*. When you’re actually in a loss, the feeling is tangled with stakes — fear, consequences, things you have to do. A song lets you feel the pure shape of sadness with none of the danger attached. Your brain gets the catharsis, the release, without the threat. Some researchers think this is why we seek out sad art at all: it’s emotional rehearsal in a room where nothing can actually hurt you.\n\nSo the heavy song isn’t making it worse. It’s giving a formless ache a melody to hold onto — and a thing with a shape is a thing you can finally start to put down.',
    likes: 143, reposts: 44, views: 3300, days_h: 64,
  },
  {
    slug: 'lina-story-stick',
    author: 'lina',
    title: 'What makes a story actually stick',
    prompt: 'What makes some stories unforgettable and others slide right off you?',
    response:
      'Three things, and most forgettable stories are missing at least two.\n\nFirst, specificity. “She was nervous” evaporates. “She kept refolding the same napkin” stays, because the concrete detail makes your mind do the work of feeling it, and what your mind builds, it remembers. Abstractions are told; details are *experienced*.\n\nSecond, change. A story is not a sequence of events — it’s a transformation. Someone has to end different from how they began, even slightly. Events without change are just a list, and lists don’t haunt anyone.\n\nThird, and this is the secret one: a gap. The stories that lodge in you leave something for you to close — a motive unexplained, an ending that doesn’t fully resolve, a silence where the obvious line should be. Your brain can’t leave an open loop alone, so it keeps turning the story over, and that turning is what we mistake for depth. Give the audience the satisfying gap, not the tidy answer. The story you finish in your own head is the one you never forget.',
    likes: 98, reposts: 27, views: 2100, days_h: 120,
  },
  {
    slug: 'lina-book-rec',
    author: 'lina',
    title: 'One book that will change how you see the world',
    prompt: 'Recommend me one book that will genuinely change how I see the world — and tell me why.',
    response:
      'Sapiens by Yuval Noah Harari — not because it’s flawless (historians argue with plenty of it), but because of one idea it installs that you can’t uninstall.\n\nThe idea is this: almost everything that organizes your life — money, nations, companies, human rights, the calendar — is a *shared fiction*. None of them exist in the physical world. A ₹500 note is paper; it has value only because millions of strangers agree to pretend it does, all at once. Harari’s claim is that this ability to believe in useful fictions together is the actual superpower that let one ape species run the planet.\n\nWhy it changes you: once you see it, you can’t unsee it. You start noticing which “permanent facts” of your life are really just agreements — and agreements can be renegotiated. It makes you lighter about the rules that are arbitrary and clearer about the few things that are actually real. That shift, from “this is how the world is” to “this is what we’re currently agreeing to,” is one of the most freeing moves in adult thinking. One book, one lens, permanently installed.',
    likes: 121, reposts: 39, views: 2700, days_h: 160,
  },
  {
    slug: 'lina-villains',
    author: 'lina',
    title: 'Why we love the villains we’re supposed to hate',
    prompt: 'Why do we end up loving villains we’re supposed to hate?',
    response:
      'Because a great villain gives us two things the hero often can’t: competence and conviction.\n\nWe’re wired to admire mastery, full stop — and a villain who is brilliant at what they do triggers that admiration before our morals can veto it. Watching someone be undeniably *good* at something is a pleasure that doesn’t check whether the something is evil. That’s why the menacing, capable antagonist outshines the bumbling one every time.\n\nThe deeper hook is conviction. The best villains aren’t chaos — they have a worldview, and from inside it, they’re the hero. They’ve looked at the world, reached a conclusion, and they *act* on it without the flinching and second-guessing the rest of us live in. There’s a forbidden thrill in someone who has resolved their doubt, even into something monstrous. They’re free in a way we’re not, and part of us envies the freedom while being grateful we’d never take it.\n\nThat’s the trick of a truly good villain: they don’t make evil look fun. They make it look *coherent* — and coherence is seductive even when it’s wrong.',
    likes: 84, reposts: 23, views: 1800, days_h: 210,
  },

  // ───────── Arjun — travel / nature / food / photography ─────────
  {
    slug: 'arjun-memorable-travel',
    author: 'arjun',
    title: 'How to travel in a way you’ll actually remember',
    prompt: 'How do I travel so the trip actually stays with me, instead of blurring into photos I never look at?',
    response:
      'Stop trying to see everything. The blur comes from optimizing for coverage, and coverage is the enemy of memory.\n\nHere’s the swap that fixed it for me: go deep on one place instead of wide across ten. Memory is built from relationships, not sights — and you can’t build a relationship with a city in four hours between trains. Pick the place that pulls at you and overstay it. Return to the same café until the owner knows your order. Walk the same street at three different times of day. Depth is what carves the experience deep enough to keep.\n\nThe second move: add a little friction on purpose. Get gently lost. Take the local bus. Order the thing you can’t pronounce. The frictionless trip — the one where everything is smoothed and pre-booked — is exactly the one that won’t stick, because your brain only writes down what it had to work for. Smooth is forgettable.\n\nAnd take fewer photos, but talk to more people. A ten-minute conversation with a stranger will outlast a hundred pictures of a monument. You don’t remember places. You remember moments *in* them — and moments come from people, not landmarks.',
    snapshot: [
      { role: 'user', content: 'How do I travel so the trip actually stays with me, instead of blurring into photos I never look at?' },
      { role: 'assistant', content: 'Honest first question: when you travel now, are you optimizing for *seeing a lot* or *being somewhere*? The blur almost always comes from the first one.' },
      { role: 'user', content: 'Definitely seeing a lot. I make these dense itineraries so I don’t “waste” the trip.' },
      { role: 'assistant', content: 'That instinct is the bug, not the optimization. Coverage is the enemy of memory. Memory is built from relationships — with a place, a street, a person — and you can’t build a relationship with a city in four hours between trains.\n\nThe swap: go deep on one place instead of wide across ten. Overstay the place that pulls at you. Return to the same café until they know your order. Depth carves the experience deep enough to keep.' },
      { role: 'user', content: 'That feels almost irresponsible though, like I’m missing things.' },
      { role: 'assistant', content: 'You are missing things — on purpose, in exchange for actually keeping the things you don’t miss. Here’s the trade made concrete: a dense itinerary gives you 30 sights you’ll forget. A deep one gives you 5 you’ll have for life. Add a little friction too — get gently lost, take the local bus, order what you can’t pronounce. Your brain only writes down what it had to work for. The frictionless trip is the forgettable one.' },
    ],
    likes: 176, reposts: 58, views: 3900, days_h: 36,
    comments: [
      { author: 'lina', content: 'Came back from two weeks in Lisbon doing exactly this — one neighborhood, same café daily. Best trip of my life.', after_h: 10 },
    ],
  },
  {
    slug: 'arjun-food-outdoors',
    author: 'arjun',
    title: 'Why food tastes better outdoors',
    prompt: 'Why does food always taste better when you eat it outside?',
    response:
      'It’s not your imagination, and it’s not just the food — it’s the whole situation your senses are stitching together.\n\nTaste is multisensory. What you call “flavor” is built from smell, sound, temperature, light, and context as much as from your tongue. Outdoors, the air is moving and full of background scent — pine, sea, smoke, grass — and your nose folds all of it into the bite. The sandwich isn’t better; the *sensory field* it’s arriving in is richer, and your brain doesn’t separate the two.\n\nThen there’s earned hunger. Outdoor eating usually follows effort — a hike, a swim, a long walk — and real hunger is the best seasoning there is. Food rewards an actual need instead of mere appetite, and the body pays that back as pleasure.\n\nAnd there’s the lack of friction in your attention. Indoors you’re half-distracted, eating over a screen. Outside, there’s nothing to do *but* eat and look around, so you actually taste it. Most “bland” food isn’t bland — it’s just eaten by someone who wasn’t paying attention. Nature simply makes that hard.',
    likes: 109, reposts: 29, views: 2300, days_h: 88,
  },
  {
    slug: 'arjun-photos-moment',
    author: 'arjun',
    title: 'How to take photos that feel like the moment',
    prompt: 'My travel photos never capture how the moment actually felt. What am I doing wrong?',
    response:
      'You’re photographing the *thing*. Try photographing the *light*.\n\nWhat made the moment feel the way it did almost never was the landmark — it was the quality of light on it: the gold an hour before sunset, the soft grey after rain, the hard noon shadows in a market. The monument was just what the light happened to be touching. Shoot at noon and even a wonder looks like a postcard nobody keeps. Shoot the same place in good light and an ordinary alley becomes something you’d frame. So chase the hour, not the place.\n\nSecond: put a human in it, or a sign of one. A vast empty landscape flattens on a screen because there’s no scale and no story. A single figure looking out gives the eye a way in and the heart someone to be. The photo stops being a record and starts being a moment.\n\nLast, and hardest: sometimes the right move is to not take the photo. Some moments are felt with your full attention or not at all, and a camera between you and them quietly steals the very thing you were trying to keep. Learn which is which. The best souvenir is sometimes just having been completely there.',
    likes: 92, reposts: 24, views: 1900, days_h: 130,
  },
  {
    slug: 'arjun-underrated-place',
    author: 'arjun',
    title: 'The most underrated place I’d send anyone',
    prompt: 'What’s the most underrated place you’d send a first-time traveler, and why?',
    response:
      'Georgia — the country, not the state. Tbilisi specifically, and then the mountains north of it.\n\nHere’s the case. It sits exactly on the seam between Europe and Asia, so the culture is its own thing — not a watered-down version of somewhere more famous. The old town is crumbling balconies and sulfur baths and churches older than most countries, and it hasn’t been sanded smooth for tourists yet, so it still feels like a discovery instead of a checklist.\n\nThe food alone justifies the trip: khinkali dumplings you eat with your hands, khachapuri that’s essentially a boat of bread, cheese and a runny egg, and a wine tradition 8,000 years old that the rest of the world is only now catching up to. It’s some of the best eating on earth at a fraction of Western European prices.\n\nAnd then you drive three hours north and you’re in the high Caucasus — Kazbegi, a hilltop church with a wall of glacier behind it — landscapes that would be overrun if they were in the Alps, and instead you have nearly to yourself. Big experience, small crowds, low cost, genuine strangeness. That combination is getting rare, so go before everyone else figures it out.',
    likes: 67, reposts: 18, views: 1500, days_h: 175,
  },
  {
    slug: 'arjun-nature-restoring',
    author: 'arjun',
    title: 'Why being in nature is so restoring',
    prompt: 'Why do I feel so much better after time in nature? Is it real or just a vibe?',
    response:
      'It’s real, and there’s a decent theory for why: your attention has two modes, and modern life only ever uses one of them.\n\nDirected attention is the effortful kind — the focus you spend on screens, traffic, decisions, notifications. It’s a finite resource, and it fatigues like a muscle. A whole day of it leaves you frayed and irritable in a way that isn’t about how hard you worked, but about how *continuously* you had to concentrate.\n\nNature pulls on the other mode. It holds your attention softly and involuntarily — a moving stream, wind in leaves, a far ridgeline. Researchers call it “soft fascination”: engaging enough to occupy you, undemanding enough to let the directed-attention muscle rest and refill. That’s the mechanism behind the calm. You’re not just relaxing; you’re letting a depleted system actually recharge.\n\nWhich is why ten genuine minutes among trees can reset you more than an hour of scrolling that’s supposedly “relaxing.” The scroll keeps hammering the tired muscle. Nature finally lets it go. The vibe is real — it just has a mechanism underneath it.',
    likes: 113, reposts: 33, views: 2500, days_h: 100,
  },

  // ───────── Sofia — design / art / creativity / productivity ─────────
  {
    slug: 'sofia-good-design',
    author: 'sofia',
    title: 'The secret to good design, in one move',
    prompt: 'What’s the actual secret to good design? Not the fluffy answer.',
    response:
      'Remove until it breaks, then add back one thing.\n\nGood design isn’t the result of adding cleverness — it’s the result of subtracting everything that isn’t doing real work. Most bad design isn’t ugly; it’s *cluttered with good intentions*: one more button, one more option, one more reassuring label, each individually defensible, collectively suffocating. The skill is the willingness to delete the defensible.\n\nSo the move is brutal and simple. Take the thing and start removing elements one at a time. The moment it stops working — the moment a real user would get lost or a real job becomes impossible — you’ve found the edge. Step back exactly one. What’s left is the design: everything essential, nothing else. You didn’t make it pretty. You made it *clear*, and clear reads as beautiful.\n\nThe reason this is hard isn’t skill, it’s nerve. Every element you cut was someone’s idea, sometimes your own, and removing it feels like loss. But the user never sees what you removed — they only feel the lightness of what’s left. Design is having the taste to know what to cut and the spine to actually cut it.',
    snapshot: [
      { role: 'user', content: 'What’s the actual secret to good design? Not the fluffy answer.' },
      { role: 'assistant', content: 'One move: remove until it breaks, then add back one thing. Want me to unpack why that beats “add more polish”?' },
      { role: 'user', content: 'Yeah, because my instinct is always to add — a nicer icon, a helpful tooltip, a bit more explanation.' },
      { role: 'assistant', content: 'Right, and that instinct is exactly the trap. Bad design is rarely ugly — it’s cluttered with good intentions. Every tooltip and helpful label is individually defensible and collectively suffocating. Adding feels productive and safe. Subtracting feels risky. So everyone adds, and everything bloats.' },
      { role: 'user', content: 'But how do I know what’s safe to remove? Cutting the wrong thing scares me.' },
      { role: 'assistant', content: 'Let the breakage tell you. Remove elements one at a time until a real user would actually get lost or a real job becomes impossible. That’s the edge. Step back exactly one. What’s left is the design — everything essential, nothing else.\n\nThe reason it’s hard isn’t skill, it’s nerve. Every element you cut was someone’s idea. But users never see what you removed — they only feel the lightness of what’s left. Design is the taste to know what to cut and the spine to cut it.' },
    ],
    likes: 219, reposts: 71, views: 4900, days_h: 44,
    comments: [
      { author: 'dev', content: 'This is the best argument for ruthless code review I’ve ever read, and it’s not even about code.', after_h: 6 },
      { author: 'arjun', content: '“Clear reads as beautiful.” Stealing this for how I edit photos.', after_h: 13 },
    ],
  },
  {
    slug: 'sofia-creative-block',
    author: 'sofia',
    title: 'How to actually beat creative block',
    prompt: 'How do I get past creative block? I just stare at the blank page.',
    response:
      'Creative block is almost never an absence of ideas. It’s the presence of a standard you’re trying to clear *before you’ve started*. You’re not empty — you’re judging the first draft against the finished masterpiece, and nothing survives that comparison, so nothing gets made.\n\nThe fix is to separate the two jobs that block always tries to do at once: making and judging. They use different parts of you and they sabotage each other when they run together. So lower the stakes to the floor. Don’t write the essay — write the worst possible version of it, on purpose, fast. Don’t design the screen — sketch ten ugly ones in ten minutes. Give yourself explicit permission to make something bad, because bad-and-finished is a thing you can fix, and perfect-and-imaginary is not.\n\nThe deeper trick is to raise volume and drop quality on the first pass. Quantity creates the raw material that quality later carves. You can’t edit a blank page, but you can edit a mess — and the mess is generous, it always gives you more than you expected. Start by making something bad quickly. The good thing is hiding inside it, and it only shows up once there’s something to revise.',
    likes: 156, reposts: 47, views: 3400, days_h: 58,
    comments: [
      { author: 'lina', content: 'Separate making from judging. So obvious in hindsight, so impossible to do without someone naming it. Thank you.', after_h: 12 },
    ],
  },
  {
    slug: 'sofia-premium-feel',
    author: 'sofia',
    title: 'Why some apps feel “premium” and others don’t',
    prompt: 'Why do some apps feel expensive and polished while others feel cheap, even doing the same thing?',
    response:
      'It’s almost never the big things. Premium is an accumulation of small correctnesses you don’t consciously notice — but absolutely feel.\n\nThree do most of the work. First, restraint: cheap apps shout — too many colors, too many weights, everything fighting for attention. Premium apps pick a tight palette and a clear hierarchy and let silence do work. Confidence reads as expensive; clutter reads as desperate.\n\nSecond, motion. Things on a premium screen don’t teleport — they move with weight and easing, the way real objects do. A menu that springs naturally, a button that responds the instant you touch it, a transition that explains where you came from. Cheap apps either have no motion or janky linear motion. Good motion is invisible; you only notice its absence as “this feels off.”\n\nThird — and this is the quiet one — defaults and details. The premium app got the empty state right, handled the error gracefully, sweated the spacing until it was even, made the keyboard not cover the input. Nobody notices any single one of these. Everybody feels their sum. Premium isn’t one expensive thing. It’s a hundred cheap things nobody skipped.',
    likes: 134, reposts: 42, views: 2900, days_h: 78,
  },
  {
    slug: 'sofia-better-feedback',
    author: 'sofia',
    title: 'How to give feedback that actually helps',
    prompt: 'How do I give better feedback on someone’s work without either being useless or crushing them?',
    response:
      'Describe the gap, not the fix. That single shift fixes most bad feedback.\n\nWhen you jump straight to “make the button blue” or “cut this paragraph,” you’re handing over *your* solution and quietly stealing the other person’s authorship — and half the time your fix is wrong anyway, because you don’t hold the whole picture they do. Worse, they learn nothing transferable. Next time they’ll need you again.\n\nInstead, name the gap between what you experienced and what you think they intended. “I got lost here — I wasn’t sure what to do next.” “This part lost the energy the opening had.” “I expected X and got Y.” You’re reporting your honest experience as a reader or user, which is the one thing you’re a genuine authority on. Then let them solve it, because it’s their work and they’ll find a better fix than yours within their own vision.\n\nThe format that bundles it: what’s working (so they keep it), where you got lost (the gap), and what you were left wanting (the direction) — with zero prescriptions. Feedback isn’t about being right. It’s about being a useful mirror, and a mirror doesn’t tell you what to wear.',
    likes: 101, reposts: 28, views: 2200, days_h: 145,
  },
  {
    slug: 'sofia-taste',
    author: 'sofia',
    title: 'What “taste” actually is — and how to build it',
    prompt: 'People say I have no taste, or that taste can’t be taught. Is that true? What even is taste?',
    response:
      'Taste isn’t a gift and it isn’t mysterious. It’s a trained ability to feel the gap between what something is and what it’s trying to be — and like any trained ability, you can build it on purpose.\n\nHere’s what’s actually happening when someone has “good taste”: they’ve consumed enough excellent work, closely enough, that their gut now holds a high-resolution standard. When they see something new, they instantly feel the distance between it and that standard. They often can’t articulate why something’s off — but the *feeling* of off-ness is real information, the output of thousands of comparisons running below conscious thought.\n\nSo you build taste in two moves. One: expose yourself to the best work in your field, a lot, slowly. Not skimming — studying. Ask “why is this good?” until you can feel the choices, not just admire the result. Two: make things and compare them honestly to that standard. The gap will hurt. That hurt is the whole point — it’s your taste outpacing your skill, which is exactly the engine that drags your skill upward.\n\nThe people who “have taste” just ran those two loops for years without calling it practice. You can start the same loops today. Taste is earned attention, nothing more.',
    likes: 148, reposts: 51, views: 3200, days_h: 112,
  },

  // ───────── Theo — history / economics / big questions ─────────
  {
    slug: 'theo-history-lesson',
    author: 'theo',
    title: 'The lesson from history everyone forgets',
    prompt: 'What’s a lesson from history that people keep forgetting?',
    response:
      'That almost nothing has a single effect. The disasters in history are rarely caused by evil — they’re caused by smart people optimizing for one obvious good and never asking what *else* their fix would set in motion.\n\nThe pattern repeats for centuries. A government in colonial India put a bounty on cobras to reduce them; people started *breeding* cobras for the reward; when the bounty ended they released the now-worthless snakes, and the cobra population ended up higher than before. Same shape, everywhere: rent control meant to help tenants quietly strangles the supply of housing. A predator culled to protect livestock lets the prey explode and collapse the grassland. Each fix was reasonable. Each ignored the second move on the board.\n\nThe forgotten lesson is to always ask “and then what?” — at least one step past the obvious result. The first-order effect is the one you intend and can see. The second-order effects are the ones that actually decide whether you helped, and they’re usually invisible until they’re a crisis.\n\nThere’s an older version of the warning, Chesterton’s fence: before you tear down a fence because you don’t see its purpose, find out why someone built it. Most catastrophes are committed by people absolutely certain they were doing the simple, obvious good.',
    snapshot: [
      { role: 'user', content: 'What’s a lesson from history that people keep forgetting?' },
      { role: 'assistant', content: 'That almost nothing has a single effect. Most historical disasters aren’t caused by villains — they’re caused by smart people optimizing one obvious good and never asking what else their fix sets in motion. Want a concrete example or three?' },
      { role: 'user', content: 'Give me the examples, I learn better that way.' },
      { role: 'assistant', content: 'Colonial India: a bounty on cobras to cut their numbers. People bred cobras for the reward. Bounty ends, they release the worthless snakes — more cobras than before.\n\nRent control meant to help tenants: it strangles the supply of new housing, so rents rise for everyone who comes next.\n\nCull a predator to protect livestock: the prey explodes, overgrazes, and the whole grassland collapses.\n\nSame shape every time. Each fix was reasonable. Each ignored the second move on the board.' },
      { role: 'user', content: 'So what’s the actual takeaway I can use?' },
      { role: 'assistant', content: 'Always ask “and then what?” — at least one step past the obvious result. The first-order effect is the one you intend and can see. The second-order effects are the ones that actually decide whether you helped, and they stay invisible until they’re a crisis.\n\nAnd a companion rule, Chesterton’s fence: before you remove something because you don’t see its purpose, find out why it was built. Most catastrophes are committed by people certain they were doing the simple, obvious good.' },
    ],
    likes: 197, reposts: 64, views: 4400, days_h: 48,
    comments: [
      { author: 'dev', content: 'Second-order thinking is the whole game in engineering too. Every quick fix is a cobra farm waiting to happen.', after_h: 8 },
      { author: 'maya', content: 'Chesterton’s fence belongs in every decision-making class. Such a humbling rule.', after_h: 19 },
    ],
  },
  {
    slug: 'theo-rich-poor-nations',
    author: 'theo',
    title: 'Why some countries are rich and others poor',
    prompt: 'Why are some countries rich and others poor? Is it really just geography or resources?',
    response:
      'Geography and resources matter far less than most people assume — the better answer is *institutions*, and it’s one of the more hopeful findings in economics.\n\nThe puzzle that breaks the resource theory: some of the richest places on earth have almost nothing in the ground (Singapore, Switzerland, Japan), while some of the most resource-cursed are poor *because* of their wealth, not despite it. And the cleanest natural experiments are borders. North and South Korea: same people, same land, same climate — wildly different outcomes. Nogales, split across the US–Mexico line: one street, two destinies. Geography is held constant; the rules changed everything.\n\nThe argument (made most forcefully by Acemoglu and Robinson) is that what divides them is *inclusive* vs *extractive* institutions. Inclusive institutions — secure property rights, rule of law, broad access to opportunity — let ordinary people invest, build, and innovate because they get to keep the upside. Extractive ones funnel the gains to a narrow elite, so why would anyone build? The incentive to create is switched off.\n\nWhy this is hopeful: institutions are made by humans and can be changed by humans. A country isn’t doomed by its mountains or its lack of oil. It’s shaped by the rules it chooses and enforces — which means stagnation is a decision, not a sentence.',
    likes: 88, reposts: 26, views: 2000, days_h: 95,
  },
  {
    slug: 'theo-industrial-revolution',
    author: 'theo',
    title: 'Was the Industrial Revolution good or bad?',
    prompt: 'Was the Industrial Revolution ultimately good or bad for humanity?',
    response:
      'Both, completely, at the same time — and learning to hold that without collapsing it into one verdict is the actual lesson.\n\nThe case for catastrophe is real and shouldn’t be soft-pedaled. The first few generations were genuinely brutal: children in factories, fourteen-hour days, black-lunged cities, craftspeople whose skills became worthless overnight, a scale of pollution the planet is still paying for. For the people who lived through the transition, “progress” often meant their specific lives got measurably worse.\n\nAnd yet. It’s also the hinge where humanity escaped a trap it had been stuck in for all of prior history — where almost everyone was poor, half of children died, and a bad harvest meant famine. Within a couple of centuries, life expectancy doubled, extreme poverty went from the near-universal condition to a shrinking minority, and ordinary people gained comforts kings never had.\n\nThe trap is wanting it to be one story. It’s two true stories running at once: a horror for the generation caught in the gears, and a liberation for nearly everyone who came after. The mature historical move isn’t to score it — it’s to ask the question it forces: when a change will hurt people now and help multitudes later, who decides, and what do we owe the ones who pay the cost? We’re still living inside that question.',
    likes: 73, reposts: 21, views: 1700, days_h: 155,
  },
  {
    slug: 'theo-money-beyond-more',
    author: 'theo',
    title: 'How to think about money beyond just “more”',
    prompt: 'How should I think about money in a way that isn’t just “get more of it”?',
    response:
      'Stop thinking of money as a score and start thinking of it as *stored optionality* — frozen choices you can thaw later. That single reframe changes almost every decision.\n\nA rupee isn’t worth a thing in itself; it’s worth the futures it keeps open. Savings aren’t a number going up — they’re the ability to walk away from a job that’s crushing you, to take the risk, to absorb the emergency without it becoming a catastrophe, to say no. That’s the real product money buys: not stuff, but *room*. Seen this way, the goal isn’t maximum money, it’s maximum freedom per rupee — and past a surprisingly modest point, more money buys very little additional freedom while costing more and more of your life to earn.\n\nThe trap is the treadmill. Because money reads as a score, more always feels like progress, so people climb forever and never notice they’ve traded the very freedom they were buying — more income for less time, less attention, less life. They got rich and stayed un-free.\n\nThe better question isn’t “how do I get more?” It’s “how much is enough to buy the freedom I actually want, and what’s the cheapest life that still feels rich to me?” Answer those honestly and money turns from a master back into a tool. Enough is a number worth calculating — most people never do.',
    likes: 129, reposts: 45, views: 2800, days_h: 66,
    comments: [
      { author: 'dev', content: 'Money as stored optionality is the single most useful financial idea I’ve encountered. “Maximum freedom per rupee” is now my whole strategy.', after_h: 9 },
    ],
  },
];

// ── Run ──────────────────────────────────────────────────────────────────────
async function ensureAuthor(a) {
  // Try to create the auth user. The handle_new_user trigger will create the
  // matching profile from raw_user_meta_data. On re-run the user already exists,
  // so recover the id from the profile created by that trigger.
  const password = crypto.randomBytes(24).toString('hex');
  const { data, error } = await supabase.auth.admin.createUser({
    email: a.email,
    password,
    email_confirm: true,
    user_metadata: { username: a.username, display_name: a.display_name },
  });

  let id = data?.user?.id;
  if (error) {
    const msg = (error.message || '').toLowerCase();
    const exists = msg.includes('already') || msg.includes('registered') || error.status === 422;
    if (!exists) throw new Error(`createUser(${a.email}) failed: ${error.message}`);
    const { data: prof, error: pErr } = await supabase
      .from('profiles').select('id').eq('username', a.username).single();
    if (pErr || !prof) throw new Error(`could not recover id for ${a.username}: ${pErr?.message ?? 'not found'}`);
    id = prof.id;
  }

  // Upsert the rich profile fields (trigger only set username/display_name).
  const { error: upErr } = await supabase.from('profiles').upsert({
    id,
    username: a.username,
    display_name: a.display_name,
    bio: a.bio,
    avatar_color: a.avatar_color,
    is_verified: a.is_verified,
    follower_count: a.follower_count,
  }, { onConflict: 'id' });
  if (upErr) throw new Error(`profile upsert(${a.username}) failed: ${upErr.message}`);

  return id;
}

function validate() {
  const errors = [];
  const keys = new Set(AUTHORS.map((a) => a.key));
  const usernames = new Set();
  const emails = new Set();
  for (const a of AUTHORS) {
    if (usernames.has(a.username)) errors.push(`duplicate username: ${a.username}`);
    if (emails.has(a.email)) errors.push(`duplicate email: ${a.email}`);
    usernames.add(a.username); emails.add(a.email);
    if (!/^#[0-9A-Fa-f]{6}$/.test(a.avatar_color)) errors.push(`bad avatar_color for ${a.username}: ${a.avatar_color}`);
  }
  const slugs = new Set();
  const ids = new Set();
  const perAuthor = {};
  let words = 0, snapshots = 0, comments = 0;
  for (const e of ECHOES) {
    if (slugs.has(e.slug)) errors.push(`duplicate slug: ${e.slug}`);
    slugs.add(e.slug);
    const id = uuidv5(`echo:${e.slug}`);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) errors.push(`bad uuid for ${e.slug}: ${id}`);
    if (ids.has(id)) errors.push(`uuid collision: ${e.slug}`);
    ids.add(id);
    if (!keys.has(e.author)) errors.push(`echo ${e.slug} → unknown author "${e.author}"`);
    if (!e.title || !e.prompt || !e.response) errors.push(`echo ${e.slug} missing title/prompt/response`);
    perAuthor[e.author] = (perAuthor[e.author] || 0) + 1;
    words += (e.response || '').split(/\s+/).filter(Boolean).length;
    if (Array.isArray(e.snapshot) && e.snapshot.length) {
      snapshots++;
      if (e.snapshot.length % 2 !== 0) errors.push(`echo ${e.slug} snapshot should alternate user/assistant (even length)`);
    }
    if (Array.isArray(e.comments)) {
      for (const c of e.comments) {
        comments++;
        if (!keys.has(c.author)) errors.push(`comment on ${e.slug} → unknown author "${c.author}"`);
        if ((c.after_h ?? 1) >= (e.days_h ?? 24)) errors.push(`comment on ${e.slug} posted before the echo (after_h >= days_h)`);
      }
    }
  }
  console.log(`\n🔍  Dry run — validating dataset (no DB writes)\n`);
  console.log(`   Authors: ${AUTHORS.length}`);
  for (const a of AUTHORS) console.log(`     @${a.username.padEnd(16)} ${perAuthor[a.key] || 0} echoes`);
  console.log(`   Echoes:   ${ECHOES.length}  (${snapshots} multi-turn, ${comments} seed comments)`);
  console.log(`   Content:  ~${words.toLocaleString()} words of curated responses`);
  if (errors.length) {
    console.log(`\n❌  ${errors.length} validation error(s):`);
    errors.forEach((e) => console.log('     - ' + e));
    process.exit(1);
  }
  console.log(`\n✅  Dataset valid. Re-run without --dry-run (with creds) to seed.`);
}

async function main() {
  if (DRY_RUN) { validate(); return; }
  console.log(`⏳  Seeding ${AUTHORS.length} authors and ${ECHOES.length} echoes → ${SUPABASE_URL}`);

  // 1) Authors → author_id by key
  const authorId = {};
  for (const a of AUTHORS) {
    const id = await ensureAuthor(a);
    authorId[a.key] = id;
    console.log(`   ✓ @${a.username}`);
  }

  // 2) Echoes (idempotent upsert by deterministic id). check_content=true so
  //    they're visible in the ranked feed immediately, before embeddings exist.
  const echoId = {};
  for (const e of ECHOES) {
    const id = uuidv5(`echo:${e.slug}`);
    echoId[e.slug] = id;
    const row = {
      id,
      author_id: authorId[e.author],
      title: e.title,
      prompt: e.prompt,
      response: e.response,
      check_content: true,
      likes_count: e.likes ?? 0,
      repost_count: e.reposts ?? 0,
      view_count: e.views ?? 0,
      created_at: hoursAgo(e.days_h ?? 24),
    };
    if (Array.isArray(e.snapshot) && e.snapshot.length) row.conversation_snapshot = e.snapshot;
    const { error } = await supabase.from('public_echoes').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`echo upsert(${e.slug}) failed: ${error.message}`);
  }
  console.log(`   ✓ ${ECHOES.length} echoes upserted (check_content=true)`);

  // 3) Comments on flagship echoes (idempotent). comment_count is owned by the
  //    DB trigger — on first insert it bumps once; re-run hits the conflict path
  //    (UPDATE) and the AFTER INSERT trigger doesn't double-count.
  let commentCount = 0;
  for (const e of ECHOES) {
    if (!Array.isArray(e.comments)) continue;
    for (let i = 0; i < e.comments.length; i++) {
      const c = e.comments[i];
      const cid = uuidv5(`comment:${e.slug}:${i}`);
      const createdAt = new Date(Date.now() - ((e.days_h ?? 24) - (c.after_h ?? 1)) * HOUR).toISOString();
      const { error } = await supabase.from('echo_comments').upsert({
        id: cid,
        echo_id: echoId[e.slug],
        author_id: authorId[c.author],
        content: c.content,
        created_at: createdAt,
      }, { onConflict: 'id' });
      if (error) throw new Error(`comment upsert(${e.slug}#${i}) failed: ${error.message}`);
      commentCount++;
    }
  }
  console.log(`   ✓ ${commentCount} comments upserted`);

  // 4) Optional: generate embeddings via the deployed embed-echo function so the
  //    semantic "For You" feed works. Reuses the exact path real publishes use;
  //    keeps OPENROUTER_API_KEY server-side. Best-effort and re-runnable.
  if (DO_EMBED) {
    console.log('⏳  Generating embeddings via embed-echo (this calls OpenRouter; ~1s each)…');
    let ok = 0; const fails = [];
    for (const e of ECHOES) {
      try {
        const { error } = await supabase.functions.invoke('embed-echo', { body: { echo_id: echoId[e.slug] } });
        if (error) fails.push(`${e.slug}: ${error.message}`);
        else ok++;
      } catch (err) {
        fails.push(`${e.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.log(`   ✓ embedded ${ok}/${ECHOES.length}` + (fails.length ? `, ${fails.length} failed` : ''));
    if (fails.length) {
      console.log('     First failures:'); fails.slice(0, 5).forEach((f) => console.log('       - ' + f));
      console.log('     (embed-echo must be deployed and OPENROUTER_API_KEY set; you can also run backfill-embeddings.)');
    }
  } else {
    console.log('ℹ️   Skipped embeddings. Run with --embed, or call the backfill-embeddings function, to enable the semantic feed.');
  }

  console.log('\n✅  Seed complete.');
  console.log('    Open the app → Discover/“Trending” should now be populated.');
  if (!DO_EMBED) console.log('    Run again with `--embed` to light up the “For You” semantic feed.');
}

main().catch((err) => {
  console.error('\n❌  Seed failed:', err.message);
  process.exit(1);
});
