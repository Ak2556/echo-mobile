# downloadecho.com 3D Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the download page with a scroll-driven Three.js + GSAP story that is roughly a third of its current weight.

**Architecture:** One fixed canvas behind DOM content. One Three.js scene, one camera, driven by a single GSAP ScrollTrigger progress value. The renderer wakes on scroll and idles otherwise. A capability probe picks a tier *before* Three.js is fetched, so weak devices never download it.

**Tech Stack:** Three.js 0.185.1 and GSAP 3.15.0 from cdnjs via import map, vanilla ESM, no bundler. Vitest (`logic` project) for the pure logic. `ffmpeg`/`cwebp` for asset re-encoding.

**Spec:** `docs/superpowers/specs/2026-09-07-downloadecho-3d-site-design.md`

## Global Constraints

- **Total page weight ≤ 900,000 bytes gzipped**, including WebGL. Enforced by `scripts/check-page-budget.mjs`, which must fail CI above it.
- **No bundler, no new npm dependencies, no deploy-pipeline change.** `public/` is copied verbatim into `dist/` by `npx expo export -p web`; Netlify publishes `dist/`.
- **Pinned CDN versions, exactly:** `three.js/0.185.1/three.module.min.js`, `gsap/3.15.0/gsap.min.js`, `gsap/3.15.0/ScrollTrigger.min.js`.
- **All copy is DOM, never geometry.** Text in WebGL is invisible to crawlers and screen readers.
- **Palette comes from the existing CSS custom properties.** Dark `--ground:#0B0D07 --ink:#F1F3E7 --ink-soft:#A9B197 --ink-faint:#7C8470 --accent:#A3C165 --accent-deep:#6E8B3D --flag:#DDAF60 --line:#262C1A`. Light `--ground:#F2F1E7 --ink:#14180E --ink-soft:#4B5340 --ink-faint:#6E7660 --accent:#55731F --accent-deep:#3D5415 --line:#D8D5C3`. Easing `cubic-bezier(.22,.61,.36,1)`. Type: Fraunces / Inter / IBM Plex Mono.
- **`prefers-reduced-motion: reduce` always resolves to the poster tier.** No exceptions.
- **No post-processing.** No `EffectComposer`, no bloom pass. Bloom is the usual budget killer in a scene like this; glow is faked with additive sprites at a fraction of the cost. Adding a composer later silently doubles the fill cost and is the most likely way this page becomes slow again.
- **Geometry is allocated once at init and mutated in place.** Rebuilding buffers per frame produces the GC sawtooth that reads as stutter on cheap Android.
- **Never edit `ios/` or `android/`** — gitignored CNG output.
- **Commits carry no AI attribution.**
- The live page must keep working throughout: the APK link `https://echo-mobile.at3236129.workers.dev/media/echo-media/downloads/echo-latest.apk` and the `/` root rewrite to `/download/index.html` must not break at any commit.

## File Structure

| Path | Responsibility |
|---|---|
| `public/download/index.html` | Markup, styles, copy, import map, inline tier probe |
| `public/download/tier.js` | Pure tier resolution. No DOM, no Three.js. **Unit-tested.** |
| `public/download/scene.js` | Three.js scene, camera, geometry, render-on-demand loop |
| `public/download/story.js` | GSAP timeline binding scroll progress to scene + DOM |
| `public/download/poster/` | Rendered fallback frames + the still hero |
| `public/download/media/` | Re-encoded video and WebP images |
| `scripts/check-page-budget.mjs` | Gzips the page and its assets; exits non-zero above budget |
| `public/download/tier.test.ts` | Vitest coverage of the resolver |

`tier.js` is deliberately dependency-free so it can be imported by vitest under the `logic` project without stubbing anything.

---

### Task 1: The budget gate, before anything can grow

Written first on purpose. Every later task is measured by it, and a gate added at the end is a gate that gets negotiated away.

**Files:**
- Create: `scripts/check-page-budget.mjs`
- Create: `scripts/check-page-budget.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `measurePage(htmlPath): Promise<{ total: number, breakdown: Array<{file: string, gzip: number}> }>` and a CLI that exits 1 above `BUDGET_BYTES`.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/check-page-budget.test.ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { measurePage } from './check-page-budget.mjs';

function fixture(html: string, assets: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'budget-'));
  writeFileSync(join(dir, 'index.html'), html);
  for (const [name, body] of Object.entries(assets)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
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
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --project logic scripts/check-page-budget.test.ts`
Expected: FAIL — `Cannot find module './check-page-budget.mjs'`.

- [ ] **Step 3: Implement**

```js
#!/usr/bin/env node
/**
 * Fails the build when the download page exceeds its byte budget.
 *
 * This exists because the page it guards was 2.3MB gzipped — not from one bad
 * decision but from a series of individually reasonable ones, each of which
 * inlined an image. Without a number that fails, the same thing happens again
 * and nobody notices until conversion has already dropped.
 *
 * Remote URLs are excluded deliberately: the CDN's bytes are real but they are
 * cached across sites and out of our control, and counting them would make the
 * budget unactionable. Local assets are what we can actually fix.
 */
import { readFile, stat } from 'node:fs/promises';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { dirname, join, relative, resolve } from 'node:path';

const gz = promisify(gzip);

export const BUDGET_BYTES = 900_000;

const REF = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;

export async function measurePage(htmlPath) {
  const root = dirname(resolve(htmlPath));
  const html = await readFile(htmlPath);
  const breakdown = [{ file: 'index.html', gzip: (await gz(html, { level: 9 })).length }];

  const seen = new Set();
  for (const [, ref] of html.toString('utf8').matchAll(REF)) {
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:') || ref.startsWith('#') || ref.startsWith('mailto:')) continue;
    const clean = ref.split('?')[0].split('#')[0];
    const abs = resolve(root, clean);
    if (seen.has(abs)) continue;
    seen.add(abs);
    try {
      await stat(abs);
    } catch {
      continue; // a reference we cannot resolve is not a byte we can count
    }
    breakdown.push({ file: relative(root, abs), gzip: (await gz(await readFile(abs), { level: 9 })).length });
  }

  return { total: breakdown.reduce((n, b) => n + b.gzip, 0), breakdown };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2] ?? join(process.cwd(), 'public/download/index.html');
  const { total, breakdown } = await measurePage(target);
  for (const b of breakdown.sort((a, c) => c.gzip - a.gzip)) {
    console.log(`  ${String(b.gzip).padStart(9)}  ${b.file}`);
  }
  const pct = Math.round((total / BUDGET_BYTES) * 100);
  console.log(`\n  total ${total} bytes gzipped — ${pct}% of ${BUDGET_BYTES}`);
  if (total > BUDGET_BYTES) {
    console.error(`\n::error::download page is ${total - BUDGET_BYTES} bytes over budget`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Tests pass**

Run: `npx vitest run --project logic scripts/check-page-budget.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Prove it fails on today's page**

Add to `package.json` scripts: `"check:page": "node scripts/check-page-budget.mjs"`.
Run: `npm run check:page`
Expected: **exit 1**, reporting roughly 2,315,900 bytes — about 257% of budget. If it passes today, the measurement is wrong.

- [ ] **Step 6: Wire into CI**

In `.github/workflows/ci.yml`, after the existing test step:

```yaml
      - name: Download page byte budget
        run: npm run check:page
```

**This will make CI red until Task 2 lands.** That is intended and is the point of writing the gate first — but say so in the commit message so a red main is not mistaken for a broken build.

- [ ] **Step 7: Commit**

```bash
git add scripts/check-page-budget.mjs scripts/check-page-budget.test.ts package.json .github/workflows/ci.yml
git commit -m "feat(web): fail CI when the download page exceeds its byte budget"
```

---

### Task 2: Reclaim 1.4MB before spending anything

**Files:**
- Create: `public/download/media/` (re-encoded assets)
- Modify: `public/download/index.html` (swap base64 for file references)

- [ ] **Step 1: Extract every inlined asset**

```bash
node -e "
const fs=require('fs');
const s=fs.readFileSync('public/download/index.html','utf8');
fs.mkdirSync('public/download/media',{recursive:true});
let i=0;
for (const m of s.matchAll(/data:image\/(png|gif|jpe?g);base64,([A-Za-z0-9+\/=]+)/g)) {
  const buf=Buffer.from(m[2],'base64');
  const hash=require('crypto').createHash('sha1').update(buf).digest('hex').slice(0,8);
  const name='public/download/media/'+hash+'.'+(m[1]==='jpeg'?'jpg':m[1]);
  if(!fs.existsSync(name)) fs.writeFileSync(name,buf);
  console.log(++i, name, buf.length);
}
"
```

Content-hashed filenames make the duplicate pairs collapse automatically — the two 365,172-byte PNGs and the two 110,220-byte PNGs write to one file each. Expect **8 references resolving to 6 files**.

- [ ] **Step 2: Re-encode**

```bash
cd public/download/media
# The GIF is the single biggest asset. Two codecs: Safari needs the MP4.
for g in *.gif; do
  ffmpeg -y -i "$g" -c:v libvpx-vp9 -crf 34 -b:v 0 -an "${g%.gif}.webm"
  ffmpeg -y -i "$g" -c:v libx264 -crf 24 -pix_fmt yuv420p -movflags +faststart -an "${g%.gif}.mp4"
  ffmpeg -y -i "$g" -frames:v 1 "${g%.gif}-poster.webp"
  rm "$g"
done
for p in *.png; do cwebp -q 82 "$p" -o "${p%.png}.webp" && rm "$p"; done
ls -la
```

- [ ] **Step 3: Replace the references in the HTML**

Every `<img src="data:image/png;base64,…">` becomes `<img src="./media/<hash>.webp" width="…" height="…" loading="lazy" decoding="async">`. **Explicit `width` and `height` on every image** — without them the page reflows as each one arrives and CLS goes above the 0.1 target on its own.

The GIF becomes:

```html
<video autoplay muted loop playsinline poster="./media/<hash>-poster.webp"
       width="…" height="…" class="loop">
  <source src="./media/<hash>.webm" type="video/webm">
  <source src="./media/<hash>.mp4" type="video/mp4">
</video>
```

`muted` and `playsinline` are load-bearing — without both, iOS Safari refuses to autoplay and the visitor gets a still where the old page had motion.

- [ ] **Step 4: Verify the budget now passes with room to spare**

Run: `npm run check:page`
Expected: **exit 0**, total around 700–750KB — leaving roughly 150–200KB of headroom for the libraries in Task 5. If it is above 800KB here, re-encode harder before continuing; there is no room later.

- [ ] **Step 5: Verify the page still looks right**

Open `public/download/index.html` in a browser. Every image present, the loop playing, no broken references, layout unchanged.

- [ ] **Step 6: Commit**

```bash
git add public/download
git commit -m "perf(web): un-inline the download page's images, 2.3MB to ~0.7MB"
```

---

### Task 3: The tier resolver

Pure logic, no DOM, no Three.js. This decides whether a visitor's device downloads 86KB of Three.js at all, which makes it the highest-consequence code on the page and the only part genuinely worth unit tests.

**Files:**
- Create: `public/download/tier.js`
- Create: `public/download/tier.test.ts`

**Interfaces:**
- Produces: `resolveTier(env): 'full' | 'reduced' | 'poster'` and `demote(tier): 'reduced' | 'poster'`.
- `env` shape: `{ reducedMotion: boolean, hasWebGL: boolean, saveData: boolean, effectiveType?: string, deviceMemory?: number, hardwareConcurrency?: number, forced?: string }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { resolveTier, demote } from './tier.js';

const capable = {
  reducedMotion: false, hasWebGL: true, saveData: false,
  effectiveType: '4g', deviceMemory: 8, hardwareConcurrency: 8,
};

describe('tier resolution', () => {
  it('gives a capable device the full scene', () => {
    expect(resolveTier(capable)).toBe('full');
  });

  it('always posters when reduced motion is requested', () => {
    expect(resolveTier({ ...capable, reducedMotion: true })).toBe('poster');
  });

  it('reduced motion beats a forced tier — accessibility is not overridable', () => {
    expect(resolveTier({ ...capable, reducedMotion: true, forced: 'full' })).toBe('poster');
  });

  it('posters without a WebGL context', () => {
    expect(resolveTier({ ...capable, hasWebGL: false })).toBe('poster');
  });

  it('posters when the visitor asked to save data', () => {
    expect(resolveTier({ ...capable, saveData: true })).toBe('poster');
  });

  it.each(['2g', 'slow-2g'])('posters on %s', t => {
    expect(resolveTier({ ...capable, effectiveType: t })).toBe('poster');
  });

  it('reduces on low memory', () => {
    expect(resolveTier({ ...capable, deviceMemory: 4 })).toBe('reduced');
  });

  it('reduces on few cores', () => {
    expect(resolveTier({ ...capable, hardwareConcurrency: 4 })).toBe('reduced');
  });

  it('treats missing hints as capable rather than assuming the worst', () => {
    // Safari reports neither deviceMemory nor effectiveType. Defaulting those
    // to "weak" would poster every iPhone, which are the fastest devices here.
    expect(resolveTier({ reducedMotion: false, hasWebGL: true, saveData: false })).toBe('full');
  });

  it('honours a forced tier otherwise, for screenshots and debugging', () => {
    expect(resolveTier({ ...capable, forced: 'poster' })).toBe('poster');
    expect(resolveTier({ ...capable, forced: 'reduced' })).toBe('reduced');
  });

  it('ignores a forced tier that is not a real tier', () => {
    expect(resolveTier({ ...capable, forced: 'ultra' })).toBe('full');
  });

  it('demotes one step at a time and stops at poster', () => {
    expect(demote('full')).toBe('reduced');
    expect(demote('reduced')).toBe('poster');
    expect(demote('poster')).toBe('poster');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --project logic public/download/tier.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
/**
 * Which version of the page this device gets.
 *
 * Called BEFORE Three.js is fetched. That ordering is the whole point: a phone
 * that will run the poster must never pay 86KB for a scene it will not render.
 *
 * Missing hints mean "capable", not "weak". Safari reports neither
 * deviceMemory nor effectiveType, and defaulting those to the worst case would
 * poster every iPhone — the fastest devices in the audience.
 */
const TIERS = ['full', 'reduced', 'poster'];

export function resolveTier(env) {
  // Accessibility first, and not overridable by ?tier=. Someone who has asked
  // their OS to reduce motion has asked every site, including this one.
  if (env.reducedMotion) return 'poster';

  if (TIERS.includes(env.forced)) return env.forced;

  if (!env.hasWebGL) return 'poster';
  if (env.saveData) return 'poster';
  if (env.effectiveType === '2g' || env.effectiveType === 'slow-2g') return 'poster';

  if (typeof env.deviceMemory === 'number' && env.deviceMemory <= 4) return 'reduced';
  if (typeof env.hardwareConcurrency === 'number' && env.hardwareConcurrency <= 4) return 'reduced';

  return 'full';
}

/** One step down, for the runtime frame-rate probe. */
export function demote(tier) {
  const i = TIERS.indexOf(tier);
  return TIERS[Math.min(i + 1, TIERS.length - 1)];
}
```

- [ ] **Step 4: Tests pass**

Run: `npx vitest run --project logic public/download/tier.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Whole suite still green**

Run: `npm test`
Expected: all pass. A new file under `public/` must not be picked up as an app route — it is not in `app/`, so it will not be, but confirm the count only grew by this file's tests.

- [ ] **Step 6: Commit**

```bash
git add public/download/tier.js public/download/tier.test.ts
git commit -m "feat(web): decide the render tier before downloading a renderer"
```

---

### Task 4: Page skeleton and the poster-tier baseline

Build the page that works everywhere first. The 3D is added on top of a page that is already complete and already fast — so at every commit from here, the site is shippable.

**Files:**
- Modify: `public/download/index.html`

- [ ] **Step 1: Restructure the markup around the four beats**

Four `<section class="beat" data-beat="1..4">` elements carrying the real copy, plus the existing download CTA and legal links. Copy:

```
01  You speak.            Hold the button. Say the thing. That is the whole
                          interaction — no keyboard, no script, no typing in a
                          language your phone fights you over.
02  It becomes a post.    Your voice is transcribed, understood, and posted.
                          People reply the same way.
03  It carries anyway.    Lost signal on the train? Echo queues what you made
                          and sends it when the network comes back. Nothing
                          waits for a perfect connection.
04  Get Echo.             Android APK, free, no account needed to look around.
```

- [ ] **Step 2: Add the fixed canvas layer and the scroll spacers**

```html
<canvas id="stage" aria-hidden="true"></canvas>
```

```css
#stage {
  position: fixed; inset: 0; width: 100%; height: 100%;
  z-index: 0; pointer-events: none; display: none;
}
:root[data-tier="full"] #stage,
:root[data-tier="reduced"] #stage { display: block; }
.beat { position: relative; z-index: 1; min-height: 100svh; }
```

`aria-hidden` on the canvas because it carries no information a screen reader needs — all meaning is in the DOM beneath it. `100svh` rather than `100vh` so mobile browser chrome does not cause a jump when the address bar collapses.

- [ ] **Step 3: Inline the probe and set the tier before anything else loads**

In `<head>`, before any stylesheet, so the first paint already knows:

```html
<script type="module">
  import { resolveTier } from './tier.js';
  const gl = (() => {
    try { return !!document.createElement('canvas').getContext('webgl2'); }
    catch { return false; }
  })();
  const c = navigator.connection || {};
  const tier = resolveTier({
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    hasWebGL: gl,
    saveData: !!c.saveData,
    effectiveType: c.effectiveType,
    deviceMemory: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    forced: new URLSearchParams(location.search).get('tier') ?? undefined,
  });
  document.documentElement.dataset.tier = tier;
</script>
```

- [ ] **Step 4: Poster-tier choreography with GSAP only**

Load `gsap` and `ScrollTrigger` from the pinned CDN URLs and give each beat a fade-and-rise as it enters. No Three.js on this path. The poster tier is the animation done cheaply, not the animation switched off.

- [ ] **Step 5: Verify all three tiers and both themes**

Open with `?tier=poster`, `?tier=reduced`, `?tier=full` and confirm `data-tier` on `<html>` matches each. Toggle `prefers-reduced-motion` in DevTools and confirm it forces poster **even with `?tier=full`**. Check light and dark.

- [ ] **Step 6: Budget still passes**

Run: `npm run check:page`
Expected: exit 0. GSAP adds ~46KB gzipped; it is loaded from the CDN so it does not count against this budget, but the page's own bytes must not have grown much.

- [ ] **Step 7: Commit**

```bash
git add public/download/index.html
git commit -m "feat(web): rebuild the download page around the four beats"
```

---

### Task 5: The scene and the render-on-demand loop

**Files:**
- Create: `public/download/scene.js`

**Interfaces:**
- Consumes: `three` via import map.
- Produces: `createScene(canvas, tier): { setProgress(t: number): void, resize(): void, dispose(): void, captureFrame(t: number): Promise<Blob> }`

- [ ] **Step 1: Add the import map**

```html
<script type="importmap">
{ "imports": {
  "three": "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.1/three.module.min.js"
} }
</script>
```

- [ ] **Step 2: Scene, camera, and the loop that idles**

```js
/**
 * The renderer does NOT hold a requestAnimationFrame loop.
 *
 * It renders when progress changes and stops when nothing is moving. A
 * permanent loop on a mid-range Android is the difference between a page
 * people scroll and a page that heats the phone in their hand — and this page
 * exists to be scrolled by exactly those devices.
 */
import * as THREE from 'three';

export function createScene(canvas, tier) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'full', alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(tier === 'full' ? Math.min(devicePixelRatio, 2) : 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

  let queued = false, visible = true, disposed = false;
  const draw = () => {
    queued = false;
    if (disposed || !visible) return;
    renderer.render(scene, camera);
  };
  const request = () => {
    if (queued || disposed || !visible) return;
    queued = true;
    requestAnimationFrame(draw);
  };

  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) request();
  });

  // …geometry from Task 6/7 attaches here…

  function setProgress(t) { /* update uniforms + morph targets, then: */ request(); }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    request();
  }
  function dispose() { disposed = true; renderer.dispose(); }

  /**
   * Render one frame at an exact progress value and hand back a blob.
   * Used only by scripts/capture-poster-frames.mjs (Task 8) — the poster tier
   * is generated from this scene so the two cannot drift into looking like
   * different websites. preserveDrawingBuffer is off for performance, so the
   * canvas must be read in the same tick it is drawn.
   */
  function captureFrame(t) {
    setProgress(t);
    renderer.render(scene, camera);
    return new Promise(res => canvas.toBlob(res, 'image/webp', 0.9));
  }

  resize();
  return { setProgress, resize, dispose, captureFrame };
}
```

- [ ] **Step 3: Load it conditionally, never on the poster tier**

In `index.html`, after the tier is set:

```js
const tier = document.documentElement.dataset.tier;
if (tier !== 'poster') {
  const [{ createScene }, { bindStory }] = await Promise.all([
    import('./scene.js'), import('./story.js'),
  ]);
  bindStory(createScene(document.getElementById('stage'), tier));
}
```

`import()` inside the branch is what keeps the 86KB off the poster path. A static top-level import would fetch it for everyone and quietly defeat the entire fallback design.

- [ ] **Step 4: Wire the runtime frame probe**

`demote()` exists in `tier.js` and is tested, but nothing calls it yet. Without
this step it is dead code and the spec's sixth demotion rule is unimplemented —
static hints guess at capability, and only measurement catches a phone that
benchmarks acceptably and then thermally throttles.

In `scene.js`, sample the first 60 rendered frames:

```js
import { demote } from './tier.js';

const samples = [];
let probing = true;
function probe(dt) {
  if (!probing) return;
  samples.push(dt);
  if (samples.length < 60) return;
  probing = false;
  const median = samples.slice().sort((a, b) => a - b)[30];
  if (median <= 28) return;
  const next = demote(tier);
  if (next === tier) return;
  document.documentElement.dataset.tier = next;
  // Demoting to poster means tearing the scene down, not just thinning it —
  // a device that cannot hold 28ms will not be rescued by fewer particles.
  if (next === 'poster') { dispose(); canvas.style.display = 'none'; }
  else applyTier(next);
}

/**
 * Thin the scene without rebuilding it. Only ever called with 'reduced',
 * because 'poster' tears down instead — a device that cannot hold 28ms is not
 * rescued by fewer particles, and pretending otherwise just gives it a worse
 * version of the same problem.
 */
function applyTier(next) {
  renderer.setPixelRatio(1);
  activePoints = REDUCED_POINTS;      // 200, from Task 6
  instances.count = REDUCED_INSTANCES; // 18, from Task 7
  instances.instanceMatrix.needsUpdate = true;
  request();
}
```

Feed `probe()` the delta between frames from inside `draw()`. Verify by forcing
it: temporarily lower the threshold to 1ms and confirm a capable device demotes
to `reduced`, then to `poster` on a second demotion.

- [ ] **Step 5: Verify Three.js is genuinely not fetched on poster**

Open DevTools → Network, load `?tier=poster`, filter for `three`. Expected: **no request**. Then load `?tier=full` and confirm exactly one.

This is the single most important verification in the plan. If Three.js loads on the poster tier, the fallback is decorative and the weakest devices are paying the most.

- [ ] **Step 6: Commit**

```bash
git add public/download/scene.js public/download/index.html
git commit -m "feat(web): three.js scene that renders on demand and idles otherwise"
```

---

### Task 6: Beats 01 and 02 — the waveform that becomes a card

**Files:**
- Modify: `public/download/scene.js`
- Create: `public/download/story.js`

**Interfaces:**
- Produces: `bindStory(sceneApi): void` — wires ScrollTrigger progress to `setProgress`.

- [ ] **Step 1: One buffer, two target sets**

Allocate `N = tier === 'full' ? 512 : 200` points once. Hold two `Float32Array` target layouts: `ringTargets` (radial waveform, radius modulated by summed sines) and `cardTargets` (the rounded-rectangle outline of an echo card). Interpolate between them by progress.

```js
// Allocated once at init and mutated in place. Rebuilding geometry per frame
// is what produces the GC sawtooth that reads as stutter on cheap Android.
const positions = new Float32Array(N * 3);
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
```

The morph is the same buffer moving, not one object swapped for another — which is why it reads as a transformation and why it costs nothing.

- [ ] **Step 2: Bind scroll to progress**

**GSAP on cdnjs is UMD, not ESM** — verified 2026-09-07: the file opens with a
`typeof exports` check and contains no `export{`. So it is loaded with classic
`<script>` tags in `index.html`, before the module scripts, and read from the
globals it attaches. An import map entry for it would fail at runtime.

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.15.0/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.15.0/ScrollTrigger.min.js"></script>
```

```js
// window.gsap and window.ScrollTrigger, set by the UMD builds above.
const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);

export function bindStory(api) {
  ScrollTrigger.create({
    trigger: document.body, start: 'top top', end: 'bottom bottom',
    scrub: 0.6,                       // lag, so it glides instead of snapping
    onUpdate: self => api.setProgress(self.progress),
    invalidateOnRefresh: true,
  });
  addEventListener('resize', () => api.resize(), { passive: true });
}
```

- [ ] **Step 3: Colour from the CSS custom properties**

```js
const css = getComputedStyle(document.documentElement);
const accent = new THREE.Color(css.getPropertyValue('--accent').trim());
```

Read at init and again on theme change, so the scene follows the theme rather than hardcoding a colour that is wrong in one of them.

- [ ] **Step 4: Verify**

Scroll beats 01→02 and confirm the ring collapses into the card outline continuously, with no visible pop. Confirm in both themes. Confirm on `?tier=reduced` that it still reads correctly with 200 points.

- [ ] **Step 5: Commit**

```bash
git add public/download/scene.js public/download/story.js
git commit -m "feat(web): the waveform, and the card it collapses into"
```

---

### Task 7: Beats 03 and 04 — the queue that drains, and the landing

**Files:**
- Modify: `public/download/scene.js`

- [ ] **Step 1: Instanced drift**

One `THREE.InstancedMesh` of `tier === 'full' ? 48 : 18` cards. Positions written into the instance matrix per frame from a cheap noise function. One draw call regardless of count.

- [ ] **Step 2: The signal-loss beat**

Between progress 0.55 and 0.72: lerp instance colour toward `--ink-faint`, damp velocity to near zero, and stack the instances into a visible vertical queue. Then release upward, fastest-first, back to `--accent`.

This is `store/outbox.ts` draining. Showing a real mechanism is what separates the page from a gradient with particles on it — but it only works if the motion reads as *held then released*, so the stall needs to last long enough to register. Roughly 15% of scroll, not 3%.

- [ ] **Step 3: Converge and settle**

Above 0.9, ease every instance toward a point behind the CTA and fade opacity, so the animation comes to rest exactly where the download button is.

- [ ] **Step 4: Verify frame cost on the worst path**

With the Pixel 4 emulator, scroll the full page on `?tier=reduced` and watch a DevTools performance trace. Expected: no frame over ~32ms during the 03 transition, which is the heaviest moment. If it exceeds that, cut the instance count before adding anything else.

- [ ] **Step 5: Commit**

```bash
git add public/download/scene.js
git commit -m "feat(web): the queue that stalls, drains, and lands on the download"
```

---

### Task 8: Poster frames, generated from the real scene

**Depends on Tasks 5–7.** The poster frames are rendered from the full tier's own scene, so the two cannot drift into looking like different websites. This ordering is not negotiable — the fallback cannot be built first.

**Files:**
- Create: `public/download/poster/*.webp`
- Create: `scripts/capture-poster-frames.mjs`
- Modify: `public/download/index.html`

- [ ] **Step 1: Capture at fixed progress values**

A script driving headless Chrome (via the `chrome-devtools-mcp` plugin already installed, or `puppeteer` invoked ad hoc) that loads `?tier=full&capture=1`, calls `setProgress` at `0, 0.12, 0.25, …, 1.0` (9 frames), and screenshots the canvas at each.

- [ ] **Step 2: Encode and wire in**

`cwebp -q 78` each frame. On the poster tier, scrub them with ScrollTrigger against the same progress value the 3D would have used, so the choreography matches.

- [ ] **Step 3: Budget check — this is where it will bite**

Run: `npm run check:page`
Expected: still under 900,000. Nine frames at ~25KB each is ~225KB, which is the largest single addition in the plan. **If this breaks the budget, reduce the frame count before reducing quality** — a 5-frame scrub reads as deliberate, a blurry 9-frame scrub reads as broken.

- [ ] **Step 4: Commit**

```bash
git add public/download/poster scripts/capture-poster-frames.mjs public/download/index.html
git commit -m "feat(web): poster tier rendered from the real scene, so they cannot drift"
```

---

### Task 9: Verify, and watch it in production

**Files:**
- Modify: `.github/workflows/healthcheck.yml`

- [ ] **Step 1: Lighthouse, throttled mobile, before and after**

Through `chrome-devtools-mcp`. Targets: performance ≥90, LCP <2.5s, CLS <0.1, TBT <200ms. Record the numbers in the commit message — a target nobody wrote down is a target nobody meets.

- [ ] **Step 2: Add the download page and the APK to the healthcheck**

The workflow already checks `/privacy`. Add a step in the same shape checking `https://downloadecho.com/` returns 200 **and** that the APK URL returns 200:

```bash
          apk=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 30 \
            "https://echo-mobile.at3236129.workers.dev/media/echo-media/downloads/echo-latest.apk")
```

Add `download_ok` to the job outputs, to the alert gate's `if:`, and to the summary builder. If that R2 object 404s, every download button on the site breaks silently and nothing today reports it.

- [ ] **Step 3: Full verification pass**

`npm run lint && npm run typecheck && npm test && npm run check:page`, then all three tiers in both themes, then reduced-motion, then the Pixel 4 emulator.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/healthcheck.yml
git commit -m "feat(ops): alert when the download page or the APK stops resolving"
```

---

## Not code

- [ ] **Decide the three deferred questions** in §11 of the spec: English or Hindi hero copy, whether beat 03 names the offline behaviour, and whether to keep or reshoot the screenshots.
- [ ] **Connect Netlify** — none of this is visible on downloadecho.com until the repository is linked and the five `EXPO_PUBLIC_*` variables are set. The current live page is a hand-uploaded file, so it will not update on its own no matter what lands on `main`.
