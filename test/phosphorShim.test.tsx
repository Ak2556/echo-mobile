import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildShim } from '../scripts/gen-icon-shim.mjs';

const SHIM = join(__dirname, '..', 'lib/core/phosphorShim.js');

/**
 * metro.config.js resolves 'phosphor-react-native' to lib/core/phosphorShim.js so the bundle carries the
 * icons the app uses instead of all 1,512 (4.4 MB of the 14.2 MB Hermes bundle, measured). The cost: an
 * icon imported but missing from the shim is `undefined` at runtime and only crashes when that screen
 * renders. These tests make that impossible to merge. (Real icons cannot be loaded under vitest: the
 * package pulls react-native-svg, which ships untranspiled TypeScript, so the check is static.)
 */
describe('phosphor icon shim', () => {
  it('is up to date with every icon the app imports (run: node scripts/gen-icon-shim.mjs)', () => {
    const { text } = buildShim();
    expect(readFileSync(SHIM, 'utf8'), 'lib/core/phosphorShim.js is stale. Run: node scripts/gen-icon-shim.mjs').toBe(text);
  });

  it('every re-export points at a real icon file that exports that name', () => {
    const lines = readFileSync(SHIM, 'utf8').split('\n').filter((l) => l.startsWith('export {'));
    expect(lines.length).toBeGreaterThan(200);
    const broken: string[] = [];
    for (const line of lines) {
      const m = line.match(/^export \{ (\w+) \} from '(.+)';$/);
      if (!m) { broken.push(line); continue; }
      const file = resolve(dirname(SHIM), m[2] + '.js');
      if (!existsSync(file) || !new RegExp(`exports\\.${m[1]}\\s*=`).test(readFileSync(file, 'utf8'))) broken.push(line);
    }
    expect(broken).toEqual([]);
  });

  it('metro resolves the package name to the shim', () => {
    const metro = readFileSync(join(__dirname, '..', 'metro.config.js'), 'utf8');
    expect(metro).toMatch(/moduleName === "phosphor-react-native"[\s\S]{0,200}lib\/core\/phosphorShim\.js/);
  });
});
