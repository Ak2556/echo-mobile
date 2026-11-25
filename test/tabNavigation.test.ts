import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// router.push / replace / navigate to a tab from a screen outside the tabs puts a
// second copy of the whole tab navigator on the stack, with its own feed, video
// and animations still running underneath. They pile up until the app runs out
// of memory (2026-11-25). Screens outside the tabs reach a tab through openRoute
// (lib/routing/openRoute.ts), which goes back to the tab bar already there.

const ROOT = process.cwd();
const TAB = String.raw`(?:/\(tabs\))?/(?:home|explore|chat|apps|notifications|watch|you)(?![\w-])`;
const DIRECT_TAB_NAV = new RegExp(
  String.raw`router\.(?:push|replace|navigate)\(\s*(?:\{\s*pathname:\s*)?['"\`]` + TAB,
);

// Inside the tab navigator a tab push is a tab switch, not a new navigator.
// Sign-in flows start with no tab bar in the stack, and sign-out resets the
// stack; they replace on purpose (see app/_layout.tsx).
const EXEMPT = [/^app\/\(tabs\)\//, /^app\/auth\//, /^app\/onboarding\.tsx$/, /^app\/welcome\.tsx$/];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...sources(rel));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

describe('screens outside the tabs reach a tab without copying the tab bar', () => {
  it('no direct push, replace or navigate to a tab', () => {
    const offenders: string[] = [];
    for (const rel of ['app', 'components', 'lib', 'hooks'].flatMap(d => sources(d))) {
      if (EXEMPT.some(re => re.test(rel))) continue;
      readFileSync(join(ROOT, rel), 'utf8').split('\n').forEach((line, i) => {
        if (DIRECT_TAB_NAV.test(line)) offenders.push(`${relative(ROOT, join(ROOT, rel))}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('routes whose target is data (voice, notification taps, the feature guard) go through openRoute', () => {
    const uses = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
    expect(uses('lib/voice/dispatch.ts')).not.toMatch(/router\.push\(route\b/);
    expect(uses('app/_layout.tsx')).not.toMatch(/router\.push\(target\b/);
    expect(uses('components/common/V2FeatureGuard.tsx')).toMatch(/openRoute\(/);
  });
});
