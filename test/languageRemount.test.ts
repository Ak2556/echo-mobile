import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ttx('literal') is cached per mount by the React Compiler, so a mounted screen
// kept its old language after a switch ("स्मार्ट शुरुआत" on Tools after going
// back to English). Every navigator remounts its leaf screens when the language
// changes; these checks keep a new navigator or screen from slipping past that.

const APP = join(process.cwd(), 'app');
const read = (rel: string) => readFileSync(join(APP, rel), 'utf8');

function layouts(dir = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(APP, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...layouts(rel));
    else if (e.name === '_layout.tsx') out.push(rel);
  }
  return out;
}

describe('language switch remounts screens', () => {
  it('every navigator layout passes screenLayout', () => {
    const missing = layouts().filter(rel => /<(Stack|Tabs)\b/.test(read(rel)) && !/screenLayout=\{/.test(read(rel)));
    expect(missing).toEqual([]);
  });

  it('the root keeps exactly the routes that are nested navigators', () => {
    const nested = readdirSync(APP, { withFileTypes: true })
      .filter(e => e.isDirectory() && existsSync(join(APP, e.name, '_layout.tsx')))
      .map(e => e.name)
      .sort();
    const keep = read('_layout.tsx').match(/NESTED_NAVIGATORS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '';
    expect([...keep.matchAll(/'([^']+)'/g)].map(m => m[1]).sort()).toEqual(nested);
  });

  it('a screen kept from remounting does not use the cached ttx()', () => {
    // signup-wizard switches language in place and holds form input, so it is
    // not remounted; its strings must come from useI18n().tt, which re-renders.
    const auth = read('auth/_layout.tsx');
    const kept = [...(auth.match(/KEEP_MOUNTED = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]);
    expect(kept).toContain('signup-wizard');
    for (const name of kept) expect(read(`auth/${name}.tsx`)).not.toMatch(/\bttx\(/);
  });
});
