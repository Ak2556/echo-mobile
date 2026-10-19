import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Edge functions import their dependencies by URL or npm specifier, resolved when the function is
 * deployed. A floating version (`@2`, `@latest`, no version) means the next deploy can pull in a
 * release nobody tested, into code that holds the service-role key. Every remote import must name an
 * exact version.
 */
const ROOT = 'supabase/functions';

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : sources(p);
    return /\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });

const SPEC = /(?:from|import\s*\()\s*['"]((?:https?:\/\/|npm:|jsr:)[^'"]+)['"]/g;
const EXACT = /@\d+\.\d+\.\d+(?:[-+][\w.]+)?(?:[/?#].*)?$/;

describe('edge function remote imports are pinned to an exact version', () => {
  const specs: Array<{ file: string; spec: string }> = [];
  for (const file of sources(ROOT)) {
    const text = readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n');
    for (const m of text.matchAll(SPEC)) specs.push({ file, spec: m[1] });
  }

  it('finds the imports it is meant to check', () => {
    expect(specs.length).toBeGreaterThan(20);
  });

  it('none is a floating range', () => {
    const floating = specs.filter(({ spec }) => !EXACT.test(spec)).map(({ file, spec }) => `${file}: ${spec}`);
    expect(floating).toEqual([]);
  });

  it('every function uses the same supabase-js version, so behaviour does not differ between them', () => {
    const versions = new Set(
      specs.filter(({ spec }) => spec.includes('@supabase/supabase-js')).map(({ spec }) => spec.match(/@(\d+\.\d+\.\d+)/)![1]),
    );
    expect([...versions]).toEqual(['2.45.4']);
  });
});
