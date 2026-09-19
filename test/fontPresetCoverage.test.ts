import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * The Font Style setting has to reach the whole app.
 *
 * Settings offers four typographic voices (Editorial, Modern Sans, System,
 * Reader) and `useTheme()` resolves them through buildFontPreset, so anything
 * styled with `font.body`, `font.displayBlack` and friends follows the choice.
 * A literal `fontFamily: 'Inter_600SemiBold'` does not — it pins that text to
 * one voice for ever.
 *
 * There were 164 such literals across 46 files, including all five tab screens,
 * so the setting was largely decorative: a reader who picked System still got
 * Fraunces headings on Tools, Inter labels in the composer, and no way to tell
 * Worse, two of those literals named Fraunces_900Black, which app/_layout.tsx
 * never passes to useFonts. An unloaded family does not throw; it silently
 * falls back to the platform face. So app/(tabs)/apps.tsx asked for a heavy
 * serif for the "Echo Tools" title at 34px and rendered system sans instead,
 * next to tab headers using font.displayBlack at 28 — a different typeface and
 * a different size, neither of them intended.
 *
 * `monospace` (and its iOS counterpart `Menlo`) is exempt and deliberately so.
 * In the JSON formatter, the converter and the colour tools it carries meaning —
 * digits must not shift width as they change — and no preset should be able to
 * substitute a proportional face there.
 */

const ROOT = resolve(__dirname, '..');
const DIRS = ['app', 'components', 'src'];

/**
 * Families that may be written literally, because they are semantic rather than
 * stylistic. `Menlo` is paired with `monospace` behind a Platform check — it is
 * a built-in iOS face that needs no loading, and it is the iOS half of "show
 * this as code".
 */
const ALLOWED = new Set(['monospace', 'Menlo']);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...walk(full)); continue; }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

const files = DIRS.flatMap(d => walk(join(ROOT, d)));

describe('the Font Style setting reaches every screen', () => {
  it('finds the source files at all', () => {
    // A broken walk would make every assertion below vacuously pass.
    expect(files.length).toBeGreaterThan(100);
  });

  it('no component pins a font family instead of using the preset', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/fontFamily:\s*'([^']+)'/g)) {
        if (ALLOWED.has(m[1])) continue;
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${relative(ROOT, file)}:${line} → ${m[1]}`);
      }
    }

    expect(
      offenders,
      'Use the matching slot from useTheme()\'s `font` (body, bodyMedium, bodySemibold, ' +
      'bodyBold, display, displayBlack, serif, quote, eyebrow) so the ' +
      'Font Style setting applies. Only monospace may be written literally.',
    ).toEqual([]);
  });

  it('every family the preset names is actually loaded', () => {
    // The sweep exists partly because Fraunces_900Black was referenced in five
    // places, including the "Echo Tools" title, and never passed to useFonts.
    // An unloaded family does not fail — it silently falls back to the platform
    // face, so the screen just looks wrong and nothing says why.
    const preset = readFileSync(join(ROOT, 'lib/fontPresets.ts'), 'utf8');
    const layout = readFileSync(join(ROOT, 'app/_layout.tsx'), 'utf8');
    const loadCall = layout.slice(layout.indexOf('useFonts('));
    const loaded = new Set([...loadCall.slice(0, loadCall.indexOf('});')).matchAll(/\b((?:Inter|Fraunces)_[A-Za-z0-9_]+)/g)].map(m => m[1]));
    expect(loaded.size, 'could not read the useFonts call').toBeGreaterThan(4);

    for (const m of preset.matchAll(/fontFamily: '([^']+)'/g)) {
      if (ALLOWED.has(m[1])) continue;
      expect(loaded.has(m[1]), `${m[1]} is used by a preset but never passed to useFonts`).toBe(true);
    }
  });

  it('every style branch defines the same slots', () => {
    // A slot missing from one branch is `undefined` at runtime for that choice,
    // which silently falls back to the platform font for that text only.
    const preset = readFileSync(join(ROOT, 'lib/fontPresets.ts'), 'utf8');
    const branches = preset.split(/case '|default:/).slice(1);
    expect(branches.length).toBeGreaterThanOrEqual(4);
    const slots = ['body', 'bodyMedium', 'bodySemibold', 'bodyBold', 'display', 'displayBlack', 'serif', 'quote', 'eyebrow'];
    for (const branch of branches) {
      if (!branch.includes('return {')) continue;
      for (const slot of slots) {
        expect(branch, `a font style branch is missing ${slot}`).toMatch(new RegExp(`\\b${slot}:`));
      }
    }
  });
});
