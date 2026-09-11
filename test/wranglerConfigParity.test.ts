import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The worker has two configs. Cloudflare Workers Builds deploys from the repo
 * root, so wrangler.toml there is what production runs; cloudflare/wrangler.toml
 * is what a hand deploy runs. If they drift, what reaches production depends on
 * how it was deployed — an older root copy lacked LEARN_LECTURES_BUCKET.
 *
 * Compared line by line with comments and blank lines dropped; `main` is
 * checked on its own because each path is relative to its file.
 */
const REPO = resolve(__dirname, '..');

function significantLines(file: string): string[] {
  return readFileSync(resolve(REPO, file), 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'));
}

const root = significantLines('wrangler.toml');
const worker = significantLines('cloudflare/wrangler.toml');
const withoutMain = (lines: string[]) => lines.filter(line => !line.startsWith('main ='));

describe('wrangler configs', () => {
  it('point at the same worker source', () => {
    expect(root).toContain('main = "cloudflare/src/index.ts"');
    expect(worker).toContain('main = "src/index.ts"');
  });

  it('declare the same worker in every other respect', () => {
    expect(withoutMain(root)).toEqual(withoutMain(worker));
  });
});
