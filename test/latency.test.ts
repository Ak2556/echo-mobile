import { describe, expect, it } from 'vitest';
import { matchLocalIntent } from '../lib/voice/localIntent';
import { resolvePerformanceProfile } from '../src/shared/lib/performance';
import { resolveDeviceTier } from '../lib/deviceTier';
import { resolveSurface } from '../components/ui/liquidGlassTier';
import { decideSwipe, resist } from '../components/ui/gestureCardSwipe';
import { buildActions, dispatch } from '../components/ui/gestureCardA11y';

/**
 * The latency budget.
 *
 * Every interaction the user drives directly has to answer inside one frame
 * budget or it reads as lag. This suite pins the work that runs on the JS
 * thread between a gesture and a visible result.
 *
 * What it deliberately does NOT test: anything crossing the network. Measured
 * floors are ~160ms to reach Supabase and ~240ms for an edge function to return
 * a 401 doing no work — that is distance to Tokyo plus per-call overhead, and no
 * amount of code makes it fit in 100ms. Those paths are covered by rendering
 * from a local cache first (react-query is persisted to MMKV) and revalidating
 * behind, so the user-visible path stays local and lands in here.
 */

/** One frame at 60fps is 16.7ms. 100ms is the outer limit before lag is felt. */
const BUDGET_MS = 100;
/** Interactive work should be far below the limit, not scraping it. */
const INTERACTIVE_MS = 16;

/**
 * Median of repeated runs rather than a single sample. A cold first call
 * includes JIT warm-up and would make this suite flaky for reasons that have
 * nothing to do with the code under test.
 */
function medianMs(fn: () => void, runs = 200): number {
  // Warm up so the first measured run isn't paying for compilation.
  for (let i = 0; i < 20; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

describe('latency budget — voice', () => {
  it('decides a recognised command well inside a frame', () => {
    // This is the whole point of on-device matching: the phrases people repeat
    // resolve without a round trip.
    const ms = medianMs(() => matchLocalIntent('go home'));
    expect(ms).toBeLessThan(INTERACTIVE_MS);
  });

  it('declines an unrecognised sentence just as fast', () => {
    // Falling through to the model must not itself be slow.
    const ms = medianMs(() =>
      matchLocalIntent('can you please write a post about my morning run today'),
    );
    expect(ms).toBeLessThan(INTERACTIVE_MS);
  });

  it('stays within budget across the whole command vocabulary', () => {
    const phrases = [
      'home', 'explore', 'chat', 'tools', 'profile', 'settings', 'bookmarks',
      'notes', 'tasks', 'habits', 'pomodoro', 'money', 'fitness',
      'trending', 'following', 'latest', 'for you',
      'dark mode', 'light mode', 'refresh', 'back', 'scroll down', 'scroll up',
      'daily question', 'new post', 'help', 'होम', 'नोट खोलो', 'वापस',
    ];
    const ms = medianMs(() => {
      for (const p of phrases) matchLocalIntent(p);
    }, 100);
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});

describe('latency budget — surfaces and gestures', () => {
  it('resolves a performance profile per frame without cost', () => {
    // Called by every glass surface, including one per feed row while scrolling.
    const ms = medianMs(() =>
      resolvePerformanceProfile('default', {
        reduceAnimations: false,
        dataSaver: false,
        glassTheme: true,
        deviceTier: 'high',
      }),
    );
    expect(ms).toBeLessThan(INTERACTIVE_MS);
  });

  it('picks a device tier instantly', () => {
    const ms = medianMs(() =>
      resolveDeviceTier({ os: 'android', osVersion: 33, screenPixels: 2_000_000 }),
    );
    expect(ms).toBeLessThan(INTERACTIVE_MS);
  });

  it('picks a surface tier instantly', () => {
    const ms = medianMs(() => resolveSurface('shader', true, 'shader'));
    expect(ms).toBeLessThan(INTERACTIVE_MS);
  });

  it('computes swipe physics inside a frame', () => {
    // resist() runs on every pointer move; if it costs anything the card stutters.
    const ms = medianMs(() => {
      for (let dx = -140; dx <= 140; dx += 4) resist(dx);
    });
    expect(ms).toBeLessThan(INTERACTIVE_MS);
  });

  it('decides a swipe outcome instantly', () => {
    const ms = medianMs(() => decideSwipe(90, 1200));
    expect(ms).toBeLessThan(INTERACTIVE_MS);
  });

  it('builds and dispatches accessibility actions instantly', () => {
    const actions = [
      { id: 'like', label: 'Like', run: () => {} },
      { id: 'save', label: 'Save', run: () => {} },
      { id: 'share', label: 'Share', run: () => {} },
    ];
    const ms = medianMs(() => {
      buildActions(actions);
      dispatch('save', actions);
    });
    expect(ms).toBeLessThan(INTERACTIVE_MS);
  });
});

describe('latency budget — list work at realistic scale', () => {
  /** A feed page, a notes library, a task list: filtering and sorting locally. */
  const items = Array.from({ length: 500 }, (_, i) => ({
    id: `id-${i}`,
    title: `Item ${i}`,
    body: `Body text for item ${i} with some words to search through`,
    folder: i % 3 === 0 ? 'Inbox' : i % 3 === 1 ? 'Work' : 'Ideas',
    updatedAt: Date.now() - i * 1000,
    pinned: i % 7 === 0,
  }));

  it('filters and sorts 500 items inside the budget', () => {
    const ms = medianMs(() => {
      items
        .filter(n => n.folder === 'Work' || n.pinned)
        .filter(n => n.body.includes('words'))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 50);
    }, 100);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('searches 500 items inside a frame', () => {
    const q = 'item 42';
    const ms = medianMs(() => {
      items.filter(
        n =>
          n.title.toLowerCase().includes(q) ||
          n.body.toLowerCase().includes(q) ||
          n.folder.toLowerCase().includes(q),
      );
    }, 100);
    expect(ms).toBeLessThan(INTERACTIVE_MS);
  });
});
