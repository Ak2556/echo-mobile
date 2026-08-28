import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Edge functions are excluded from the project's `tsc` run (see tsconfig
 * "exclude"), because they are Deno code with URL imports that the app's
 * compiler options reject. The cost of that exclusion was two live bugs found
 * on 2026-08-28:
 *
 *   * push-fanout's `messageFor` read `actorName`, which only ever existed in
 *     the request handler. Every "reacted to your daily answer" push threw
 *     ReferenceError instead of sending.
 *   * echo-ai's `runAgentLoop` read `body.mode` with no `body` in scope, so
 *     every agent turn threw on its first iteration.
 *
 * Both are the same shape — an identifier that resolves nowhere — and both are
 * invisible to the deploy, because Supabase bundles with esbuild, which strips
 * types without checking them.
 *
 * This does not try to type-check Deno properly. It runs the compiler purely to
 * collect unresolved identifiers, and ignores everything else: Deno globals,
 * URL imports, missing lib types. Narrow on purpose — a stricter check here
 * would fail constantly on things that are correct under Deno.
 */

const FUNCTIONS_DIR = join(import.meta.dirname!, '.');

function entryPoints(): string[] {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_'))
    .map(e => join(FUNCTIONS_DIR, e.name, 'index.ts'));
}

describe('edge functions', () => {
  it('reference no identifier that resolves nowhere', () => {
    const files = entryPoints();
    expect(files.length).toBeGreaterThan(0);

    let output = '';
    try {
      execFileSync(
        'npx',
        ['tsc', '--noEmit', '--skipLibCheck', '--allowJs', '--target', 'es2022',
         '--module', 'esnext', '--moduleResolution', 'bundler', ...files],
        { encoding: 'utf8', cwd: join(FUNCTIONS_DIR, '..', '..') },
      );
    } catch (e) {
      // tsc exits non-zero whenever it emits any diagnostic, and it always will
      // here — Deno globals and https: imports are expected. The exit code
      // carries no signal; only the diagnostics do.
      output = String((e as { stdout?: string }).stdout ?? '');
    }

    const unresolved = output
      .split('\n')
      .filter(line => line.includes('Cannot find name'))
      // `Deno` is a genuine global in the runtime these actually execute in.
      .filter(line => !line.includes("'Deno'"))
      .sort();

    expect(unresolved).toEqual([]);
  }, 120_000);
});
