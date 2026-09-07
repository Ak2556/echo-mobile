import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { measurePage } from './check-page-budget.mjs';

function fixture(html: string, assets: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'budget-'));
  writeFileSync(join(dir, 'index.html'), html);
  for (const [name, body] of Object.entries(assets)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  return join(dir, 'index.html');
}

describe('page budget', () => {
  it('counts the html itself', async () => {
    const r = await measurePage(fixture('<html>hello</html>'));
    expect(r.total).toBeGreaterThan(0);
    expect(r.breakdown.map(b => b.file)).toContain('index.html');
  });

  it('counts local assets the page references', async () => {
    const big = 'x'.repeat(200_000);
    const r = await measurePage(fixture(
      '<html><script src="./scene.js"></script><img src="./media/a.png"></html>',
      { 'scene.js': big, 'media/a.png': big },
    ));
    expect(r.breakdown.map(b => b.file).sort()).toEqual(['index.html', 'media/a.png', 'scene.js']);
  });

  it('ignores remote URLs — the CDN is not our budget', async () => {
    const r = await measurePage(fixture(
      '<html><script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.1/three.module.min.js"></script></html>',
    ));
    expect(r.breakdown).toHaveLength(1);
  });

  it('does not double-count an asset referenced twice', async () => {
    const r = await measurePage(fixture(
      '<html><img src="./media/a.png"><img src="./media/a.png"></html>',
      { 'media/a.png': 'y'.repeat(50_000) },
    ));
    expect(r.breakdown.filter(b => b.file === 'media/a.png')).toHaveLength(1);
  });

  it('reports gzipped size, not raw', async () => {
    const compressible = 'a'.repeat(500_000);
    const r = await measurePage(fixture(`<html>${compressible}</html>`));
    expect(r.total).toBeLessThan(50_000);
  });

  it('skips references it cannot resolve rather than throwing', async () => {
    const r = await measurePage(fixture('<html><img src="./missing.png"></html>'));
    expect(r.breakdown).toHaveLength(1);
  });
});

describe('reference coverage', () => {
  it('counts a video poster, which is bytes the visitor downloads', async () => {
    const r = await measurePage(fixture(
      '<html><video poster="./media/p.webp"><source src="./media/v.webm"></video></html>',
      { 'media/p.webp': 'p'.repeat(40_000), 'media/v.webm': 'v'.repeat(40_000) },
    ));
    expect(r.breakdown.map(b => b.file).sort()).toEqual(['index.html', 'media/p.webp', 'media/v.webm']);
  });

  it('reports broken local references instead of quietly getting cheaper', async () => {
    const r = await measurePage(fixture('<html><img src="./gone.webp"></html>'));
    expect(r.missing).toEqual(['gone.webp']);
  });
});

describe('root-absolute references', () => {
  it('treats /privacy as a site route, not a missing file', async () => {
    const r = await measurePage(fixture('<html><a href="/privacy">Privacy</a></html>'));
    expect(r.missing).toEqual([]);
    expect(r.breakdown).toHaveLength(1);
  });

  it('still counts genuinely relative assets alongside routes', async () => {
    const r = await measurePage(fixture(
      '<html><a href="/terms">T</a><img src="./media/a.webp"></html>',
      { 'media/a.webp': 'z'.repeat(30_000) },
    ));
    expect(r.missing).toEqual([]);
    expect(r.breakdown.map(b => b.file).sort()).toEqual(['index.html', 'media/a.webp']);
  });
});

describe('root-absolute assets under the publish root', () => {
  it('counts /download/media/x.webp when it exists under the site root', async () => {
    const site = mkdtempSync(join(tmpdir(), 'site-'));
    mkdirSync(join(site, 'download', 'media'), { recursive: true });
    writeFileSync(join(site, 'download', 'media', 'a.webp'), 'w'.repeat(60_000));
    writeFileSync(join(site, 'download', 'index.html'), '<html><img src="/download/media/a.webp"></html>');
    const r = await measurePage(join(site, 'download', 'index.html'), site);
    expect(r.missing).toEqual([]);
    expect(r.breakdown.map(b => b.file).sort()).toEqual(['download/media/a.webp', 'index.html']);
  });

  it('still treats /privacy as a route rather than an asset', async () => {
    const site = mkdtempSync(join(tmpdir(), 'site-'));
    mkdirSync(join(site, 'download'), { recursive: true });
    writeFileSync(join(site, 'download', 'index.html'), '<html><a href="/privacy">P</a></html>');
    const r = await measurePage(join(site, 'download', 'index.html'), site);
    expect(r.missing).toEqual([]);
    expect(r.breakdown).toHaveLength(1);
  });
});

// The page loads tier.js and scene.js with ES imports inside an inline
// <script type="module">, never with src=. An attribute-only scan therefore
// could not see them: the page's own JavaScript went uncounted, and a broken
// module path — the exact failure that took the live site's whole interactive
// layer down — registered here as no change at all.
describe('module specifiers', () => {
  it('counts a statically imported module', async () => {
    const r = await measurePage(fixture(
      '<html><script type="module">import { resolveTier } from "./tier.js";</script></html>',
      { 'tier.js': 'a'.repeat(40_000) },
    ));
    expect(r.breakdown.map(b => b.file).sort()).toEqual(['index.html', 'tier.js']);
  });

  it('counts a dynamically imported module', async () => {
    const r = await measurePage(fixture(
      '<html><script type="module">const m = await import("./scene.js");</script></html>',
      { 'scene.js': 'b'.repeat(40_000) },
    ));
    expect(r.breakdown.map(b => b.file).sort()).toEqual(['index.html', 'scene.js']);
  });

  it('counts a side-effect import with no bindings', async () => {
    const r = await measurePage(fixture(
      '<html><script type="module">import "./boot.js";</script></html>',
      { 'boot.js': 'c'.repeat(40_000) },
    ));
    expect(r.breakdown.map(b => b.file).sort()).toEqual(['boot.js', 'index.html']);
  });

  it('counts a root-absolute module under the publish root', async () => {
    const site = mkdtempSync(join(tmpdir(), 'site-'));
    mkdirSync(join(site, 'download'), { recursive: true });
    writeFileSync(join(site, 'download', 'tier.js'), 'd'.repeat(60_000));
    writeFileSync(join(site, 'download', 'index.html'),
      '<html><script type="module">import { t } from "/download/tier.js";</script></html>');
    const r = await measurePage(join(site, 'download', 'index.html'), site);
    expect(r.missing).toEqual([]);
    expect(r.breakdown.map(b => b.file).sort()).toEqual(['download/tier.js', 'index.html']);
  });

  it('reports a broken module path instead of silently getting cheaper', async () => {
    const r = await measurePage(fixture(
      '<html><script type="module">import { x } from "./gone.js";</script></html>',
    ));
    expect(r.missing).toEqual(['gone.js']);
  });

  it('ignores bare and remote specifiers — the import map points at the CDN', async () => {
    const r = await measurePage(fixture(
      '<html><script type="importmap">{"imports":{"three":"https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.1/three.module.min.js"}}</script>'
      + '<script type="module">import * as THREE from "three";</script></html>',
    ));
    expect(r.missing).toEqual([]);
    expect(r.breakdown).toHaveLength(1);
  });

  it('does not mistake the word import in page copy for a reference', async () => {
    const r = await measurePage(fixture(
      '<html><p>You can import your notes from "./anywhere.js" if you like.</p></html>',
    ));
    expect(r.missing).toEqual([]);
    expect(r.breakdown).toHaveLength(1);
  });
});
