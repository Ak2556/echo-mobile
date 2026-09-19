import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Screen chrome uses EdgeGlass, not GlassPanel.
 *
 * GlassPanel and LiquidGlass draw an *object*: four rounded edges, a rim light,
 * a bevel. A header or a tab bar is not an object — three of its four sides are
 * off-screen, so a border around it is a line with nothing on the other side,
 * and a 1px highlight is a bevel on a surface with no lip. Drawn at
 * borderRadius 0 across an absolute bar they stop reading as material and
 * start reading as a slab laid over the content, with a hard line where they
 * end.
 *
 * Three screens did exactly that — notifications, explore and chat — each one
 * `<GlassPanel borderRadius={0} style={StyleSheet.absoluteFill}>`, two of them
 * with a real hairline border underneath to finish the seam. Meanwhile home and
 * the tab bar already used EdgeGlass, which ramps blur and tint toward the
 * screen edge and decays to nothing a little way into the content, so the list
 * goes out of focus on its way under the chrome instead of being cut by it.
 *
 * LiquidGlass is not the answer either, and that is worth stating because it is
 * the newer component and the obvious reach: its whole effect is a refractive
 * *edge*, and a full-bleed bar has no edge to light. CommandPalette says the
 * same thing where it keeps a plain GlassPanel for its backdrop.
 */

const ROOT = resolve(__dirname, '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...walk(full)); continue; }
    if (!/\.tsx$/.test(entry) || /\.test\.tsx$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'src'))];

describe('screen chrome uses the edge treatment', () => {
  it('finds the source files at all', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('no panel is stretched full-bleed at zero radius', () => {
    // The signature of the bug: a rounded-object component told to have no
    // rounding, filling an absolutely positioned bar.
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/<(GlassPanel|LiquidGlass)\b[^>]*>/g)) {
        const tag = m[0];
        if (!/borderRadius=\{0\}/.test(tag)) continue;
        if (!/absoluteFill/.test(tag)) continue;
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${relative(ROOT, file)}:${line} → ${m[1]}`);
      }
    }
    expect(
      offenders,
      'Screen chrome belongs in EdgeGlass — see its docblock. GlassPanel draws an ' +
      'object; a full-bleed bar is not one.',
    ).toEqual([]);
  });

  it('the tab screens that have a header use EdgeGlass for it', () => {
    // Named explicitly: these are the four surfaces a user meets first, and the
    // one place an inconsistency is most visible.
    for (const screen of ['notifications', 'explore', 'chat', 'home']) {
      const src = readFileSync(join(ROOT, 'app', '(tabs)', `${screen}.tsx`), 'utf8');
      expect(src, `${screen} should use EdgeGlass for its header`).toMatch(/<EdgeGlass\b/);
    }
  });

  it('EdgeGlass is not given a border to draw', () => {
    // Adding a hairline back under an EdgeGlass would restore the seam it
    // exists to remove — which is what two of these screens had.
    for (const screen of ['notifications', 'explore', 'chat']) {
      const src = readFileSync(join(ROOT, 'app', '(tabs)', `${screen}.tsx`), 'utf8');
      const start = src.indexOf('<EdgeGlass');
      const end = src.indexOf('</EdgeGlass>', start);
      expect(start, `${screen} has no EdgeGlass`).toBeGreaterThan(-1);
      const block = src.slice(start, end);
      expect(
        block,
        `${screen} draws a hairline inside its EdgeGlass, which puts the hard edge back`,
      ).not.toMatch(/position: 'absolute', bottom: 0[^}]*hairlineWidth/);
    }
  });
});
