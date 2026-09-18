import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The hold-to-speak demo reported every failure as
 *
 *     "Nothing came through. Hold the button down while you speak"
 *
 * which is correct advice for exactly one of them. `onerror` special-cased
 * `not-allowed`, `service-not-allowed` and `no-speech`, and everything else
 * fell through to that sentence.
 *
 * Two of the unhandled cases matter more than the rest on this page:
 *
 *   language-not-supported — the pills offer fifteen languages because the app
 *     handles fifteen. Chrome's recogniser does not; Odia (or-IN) and Assamese
 *     (as-IN) are not among them and Safari's list is shorter again. A visitor
 *     who picks their own language and is told to hold the button down
 *     concludes the product cannot hear them, on the page whose entire pitch is
 *     that it can.
 *
 *   network — Chrome streams audio to its own servers to transcribe it. Echo's
 *     quota is untouched, but it is not offline, and telling someone to speak
 *     louder does not fix their connection.
 *
 * Verified in a real browser against the deployed page before this was written:
 * with no microphone available the recogniser fired no events at all — not even
 * an error — so the 900ms floor in `stop()` was the only thing settling the UI
 * and it could not tell silence from "this cannot work here".
 *
 * These are static assertions on the page source because the demo is an inline
 * classic script in a 3,000-line HTML file; there is nothing to import. They
 * pin the taxonomy and the wording rules, which is what regressed.
 */

const PAGE = readFileSync(join(__dirname, 'index.html'), 'utf8');

/** The body of the press-and-hold IIFE, so assertions cannot match unrelated script. */
const DEMO = (() => {
  const start = PAGE.indexOf('/* ---- press and hold ---- */');
  expect(start, 'the press-and-hold section must exist').toBeGreaterThan(-1);
  return PAGE.slice(start);
})();

describe('the voice demo explains why it heard nothing', () => {
  const CODES = [
    'not-allowed',
    'service-not-allowed',
    'no-speech',
    'network',
    'audio-capture',
    'language-not-supported',
    'aborted',
  ];

  it.each(CODES)('routes the %s error to a message of its own', code => {
    expect(DEMO, `${code} must be routed explicitly`).toMatch(
      new RegExp(`'${code}':`));
  });

  it('records the error rather than discarding it', () => {
    // onerror used to branch inline and then call finish(), which had no way to
    // know what had gone wrong.
    expect(DEMO).toMatch(/lastError = /);
    expect(DEMO).toMatch(/function explain\(\)/);
  });

  it('distinguishes a recogniser that never opened the microphone', () => {
    // A browser with no model for the selected language fires no events at all
    // in Safari, which is indistinguishable from an unresolved permission — so
    // the page must track whether the engine ever started.
    expect(DEMO).toMatch(/onstart = /);
    expect(DEMO).toMatch(/onaudiostart = /);
    expect(DEMO).toMatch(/!sawStart && !sawAudio/);
  });

  it('never claims a specific language is unsupported without being told so', () => {
    // Asserting "no speech model for English" to a Chrome user would be false.
    // The bare no-event path must name both possible causes instead of picking.
    expect(DEMO).toMatch(/function neverOpened\(\)/);
    const neverOpened = DEMO.slice(DEMO.indexOf('function neverOpened()'));
    const body = neverOpened.slice(0, neverOpened.indexOf('\n  }'));
    expect(body, 'must not assert a cause it cannot know').toMatch(/Either|or this browser/i);
  });

  it('only tells the visitor to hold the button down when that is the problem', () => {
    // The "hold the button down" wording belongs to no-speech and nothing else.
    const holdAdvice = /Hold the button down while you speak/;
    const nothingHeard = DEMO.slice(DEMO.indexOf('function nothingHeard()'));
    expect(nothingHeard.slice(0, 200)).toMatch(holdAdvice);

    // It must not be the fallback for the network or language failures.
    for (const fn of ['function neverOpened()', 'function langUnsupported()']) {
      const at = DEMO.indexOf(fn);
      expect(at, `${fn} must exist`).toBeGreaterThan(-1);
      const body = DEMO.slice(at, DEMO.indexOf('\n  }', at));
      expect(body, `${fn} must not blame the visitor`).not.toMatch(holdAdvice);
    }
  });

  it('every language pill has a recogniser code', () => {
    // A pill with no data-sr would set lang to null and fail in a way none of
    // the messages above describe.
    const pills = [...PAGE.matchAll(/<button[^>]*data-sr="([^"]+)"/g)].map(m => m[1]);
    expect(pills.length).toBeGreaterThanOrEqual(15);
    for (const p of pills) expect(p).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
  });
});
