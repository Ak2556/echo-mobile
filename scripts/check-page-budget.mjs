#!/usr/bin/env node
/**
 * Fails the build when the download page exceeds its byte budget.
 *
 * This exists because the page it guards reached 2.3MB gzipped — not through
 * one bad decision but through a series of individually reasonable ones, each
 * of which inlined an image. Without a number that fails, the same thing
 * happens again and nobody notices until conversion has already dropped.
 *
 * Remote URLs are excluded deliberately. The CDN's bytes are real, but they are
 * cached across sites, out of our control, and counting them would make the
 * budget unactionable. Local assets are the ones we can actually fix.
 */
import { readFile, stat } from 'node:fs/promises';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { dirname, join, relative, resolve } from 'node:path';

const gz = promisify(gzip);

export const BUDGET_BYTES = 900_000;

// poster= is how a <video> names its still frame, and srcset= how an <img>
// names its alternates. Both are bytes the visitor downloads; omitting them
// let 13KB hide from the first measurement of this very page.
const REF = /(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi;

export async function measurePage(htmlPath) {
  const root = dirname(resolve(htmlPath));
  const html = await readFile(htmlPath);
  const breakdown = [{ file: 'index.html', gzip: (await gz(html, { level: 9 })).length }];

  const seen = new Set();
  const missing = [];
  for (const [, ref] of html.toString('utf8').matchAll(REF)) {
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:') || ref.startsWith('#') || ref.startsWith('mailto:')) continue;
    const clean = ref.split('?')[0].split('#')[0];
    if (!clean) continue;
    const abs = resolve(root, clean);
    if (seen.has(abs)) continue;
    seen.add(abs);
    try {
      const st = await stat(abs);
      if (!st.isFile()) continue;
    } catch {
      // Silently skipping here would make a broken path indistinguishable from
      // a lighter page — the budget would go DOWN when an image 404s, which is
      // exactly backwards.
      missing.push(relative(root, abs));
      continue;
    }
    breakdown.push({ file: relative(root, abs), gzip: (await gz(await readFile(abs), { level: 9 })).length });
  }

  return { total: breakdown.reduce((n, b) => n + b.gzip, 0), breakdown, missing };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2] ?? join(process.cwd(), 'public/download/index.html');
  const { total, breakdown, missing } = await measurePage(target);
  for (const b of breakdown.sort((a, c) => c.gzip - a.gzip)) {
    console.log(`  ${String(b.gzip).padStart(9)}  ${b.file}`);
  }
  if (missing.length) {
    console.error(`\n::error::${missing.length} reference(s) point at files that do not exist:`);
    for (const m of missing) console.error(`    ${m}`);
    process.exit(1);
  }

  const pct = Math.round((total / BUDGET_BYTES) * 100);
  console.log(`\n  total ${total.toLocaleString()} bytes gzipped — ${pct}% of ${BUDGET_BYTES.toLocaleString()}`);
  if (total > BUDGET_BYTES) {
    console.error(`\n::error::download page is ${(total - BUDGET_BYTES).toLocaleString()} bytes over budget`);
    process.exit(1);
  }
}
