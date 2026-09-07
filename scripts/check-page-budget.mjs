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

// The page's own JavaScript is not reachable through any attribute: tier.js and
// scene.js are pulled in by ES imports inside an inline <script type="module">.
// An attribute-only scan counted neither, so the page's script weight was
// invisible AND a broken module path — which is precisely what took the live
// site's entire interactive layer down — looked identical to no change at all.
const SCRIPT = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
// Matched only inside script bodies, so prose containing the word "import"
// cannot produce a phantom reference that fails the build.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

// Bare specifiers ("three") are resolved by the import map to a CDN URL, which
// is deliberately outside this budget. Only relative and root-absolute paths
// name bytes we ship.
function* moduleSpecifiers(htmlText) {
  for (const [, body] of htmlText.matchAll(SCRIPT)) {
    for (const [, spec] of body.matchAll(SPECIFIER)) {
      if (spec.startsWith('.') || spec.startsWith('/')) yield spec;
    }
  }
}

function* references(htmlText) {
  for (const [, ref] of htmlText.matchAll(REF)) yield ref;
  yield* moduleSpecifiers(htmlText);
}

export async function measurePage(htmlPath, siteRoot) {
  const root = dirname(resolve(htmlPath));
  // The page lives at public/download/index.html but is SERVED at "/", so its
  // asset paths are root-absolute. Those have to be resolved against the
  // publish root or the budget silently stops counting them — which is worse
  // than over-counting, because the number would quietly go to nearly zero.
  const site = siteRoot ? resolve(siteRoot) : dirname(root);
  const html = await readFile(htmlPath);
  const breakdown = [{ file: 'index.html', gzip: (await gz(html, { level: 9 })).length }];

  const seen = new Set();
  const missing = [];
  for (const ref of references(html.toString('utf8'))) {
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:') || ref.startsWith('#') || ref.startsWith('mailto:')) continue;
    // A root-absolute ref is either a real asset under the publish root or a
    // site route like /privacy that this page does not own. Resolve it against
    // the publish root: found means it is our bytes, missing means it is a
    // route (checked by the healthcheck, not counted here).
    let abs;
    if (ref.startsWith('/')) {
      const candidate = resolve(site, '.' + ref.split('?')[0].split('#')[0]);
      try {
        const st = await stat(candidate);
        if (!st.isFile()) continue;
      } catch {
        continue; // a site route, not an asset
      }
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      breakdown.push({ file: relative(site, candidate), gzip: (await gz(await readFile(candidate), { level: 9 })).length });
      continue;
    }
    const clean = ref.split('?')[0].split('#')[0];
    if (!clean) continue;
    abs = resolve(root, clean);
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
  const siteRoot = process.argv[3] ?? join(process.cwd(), 'public');
  const { total, breakdown, missing } = await measurePage(target, siteRoot);
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
