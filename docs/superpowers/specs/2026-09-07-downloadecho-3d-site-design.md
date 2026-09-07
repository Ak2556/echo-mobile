# downloadecho.com — scroll-driven 3D site

**Design, 2026-09-07.** Replaces the current static download page with a
scroll-driven Three.js and GSAP experience, without making the page slower for
the people it is meant to convert.

---

## 1. Goal

Tell one story as the visitor scrolls — *you speak, it becomes a post, it
carries even when the network doesn't, get Echo* — rendered in a single
continuous 3D scene, and land on a page that is **lighter than the one it
replaces**.

The second half of that sentence is the constraint that shapes everything
else. This is the acquisition surface for an audience on inexpensive Android
phones over Indian mobile data. A page that looks extraordinary and loads
slowly costs installs, and no amount of craft above the fold compensates for a
visitor who left before it painted.

## 2. What is there today

`public/download/index.html` — one hand-authored file, **3,114,230 bytes raw /
2,315,900 gzipped**, almost entirely inlined base64 images:

| Asset | Decoded | Note |
|---|---|---|
| GIF | 949,434 B | largest single asset |
| PNG | 365,172 B | **byte-identical to the next row** |
| PNG | 365,172 B | duplicate |
| PNG | 199,302 B | |
| PNG | 190,257 B | |
| PNG | 110,220 B | **byte-identical to the next row** |
| PNG | 110,220 B | duplicate |
| PNG | 7,101 B | |

Roughly **475KB is the same two images inlined twice**, and the 949KB GIF is a
format choice that costs about 10–20× what an equivalent WebM would.

It is deployed by being copied: `npx expo export -p web` copies `public/` into
`dist/`, and Netlify publishes `dist/`. There is no build step for this page,
and this design does not add one.

## 3. Global constraints

- **No bundler, no new npm dependencies, no change to the deploy pipeline.** The
  repository is in feature freeze. The page is `public/download/index.html` plus
  a small number of ESM modules served beside it from the same directory —
  browsers load them directly, and `public/` is copied verbatim into `dist/`, so
  there is still nothing to build.

  *Revised from "a single self-contained file" during planning.* The tier
  resolver is pure logic worth unit-testing, and logic inside a `<script>` tag
  cannot be imported by vitest; testing a mirrored copy only lets the two drift.
  The constraint that mattered was avoiding a build step, and separate ESM files
  do not introduce one.
- **Total page weight ≤ 900KB gzipped**, including WebGL. Enforced by a script
  that fails CI.
- **Libraries from cdnjs at pinned exact versions**, loaded as ESM via an import
  map. Measured 2026-09-07:

  | Library | Raw | Gzip | Brotli |
  |---|---|---|---|
  | `three.js/0.185.1/three.module.min.js` | 365,552 | 86,569 | 72,382 |
  | `gsap/3.15.0/gsap.min.js` | 72,927 | 28,314 | 25,706 |
  | `gsap/3.15.0/ScrollTrigger.min.js` | 44,575 | 17,982 | 16,224 |
  | **Total** | | **131,962** | **114,312** |

- **All copy is DOM**, never geometry. Text rendered into WebGL is invisible to
  search crawlers and to screen readers.
- **The existing brand palette is the palette.** No new colour system.
- The page must work in both themes and honour `prefers-reduced-motion`.

## 4. Palette and type

Already defined in the current page; the 3D reads these from CSS custom
properties so the scene follows the theme rather than fighting it.

| Token | Dark | Light |
|---|---|---|
| `--ground` | `#0B0D07` | `#F2F1E7` |
| `--surface` | `#12150D` | — |
| `--ink` | `#F1F3E7` | `#14180E` |
| `--ink-soft` | `#A9B197` | `#4B5340` |
| `--ink-faint` | `#7C8470` | `#6E7660` |
| `--accent` | `#A3C165` | `#55731F` |
| `--accent-deep` | `#6E8B3D` | `#3D5415` |
| `--accent-wash` | `#18210E` | `#E4EAD2` |
| `--flag` | `#DDAF60` | `#DDAF60` |
| `--line` | `#262C1A` | `#D8D5C3` |

Type: Fraunces (display), Inter (body), IBM Plex Mono (detail). Easing:
`cubic-bezier(.22,.61,.36,1)`.

## 5. Byte budget

The redesign reclaims more than it spends.

| | Gzipped |
|---|---|
| Current page | 2,315,900 |
| − re-encode the 949KB GIF to WebM | ≈ −880,000 |
| − dedupe two pairs of identical PNGs | ≈ −475,000 |
| − remaining images re-encoded to WebP | ≈ −250,000 |
| + Three.js, GSAP, ScrollTrigger | +131,962 |
| + scene code, styles, markup | ≈ +25,000 |
| **Target** | **≤ 900,000** |

Replacing the GIF is not purely an encoding change: it becomes a `<video>`
with `autoplay muted loop playsinline` and a `poster`. `muted` and
`playsinline` are load-bearing — without both, iOS Safari refuses to autoplay
and the visitor gets a still frame where the old page had motion. The WebM
needs an MP4/H.264 sibling for Safari.

The ceiling is a hard gate, not an aspiration: `scripts/check-page-budget.mjs`
gzips the page and its referenced assets and exits non-zero above it, added as a
step to `.github/workflows/ci.yml`, which already runs lint, typecheck and
test on every push and PR. Without it, this page returns to 2.3MB within six
months and nobody notices until conversion has already dropped.

## 6. Architecture

### 6.1 Layers

One fixed full-viewport `<canvas>` behind the content. Content sections are
ordinary DOM stacked above it. The canvas never scrolls; the camera moves.

### 6.2 The scroll engine

One renderer, one scene, one camera, one continuous 3D space. ScrollTrigger
produces a single normalized progress value `0→1` for the document, and a
master GSAP timeline maps it to camera position, geometry morph targets and
material uniforms.

The camera never cuts. It dollies and drifts along one path, which is what
makes four beats read as one story rather than four widgets stacked vertically.

### 6.3 Render on demand

**The most important decision in the build.** The renderer does not run a
permanent `requestAnimationFrame` loop. It wakes when scroll progress changes
or a tween is live, and idles otherwise. It stops entirely on
`visibilitychange` and when the canvas leaves the viewport via
`IntersectionObserver`.

On a mid-range Android this is the difference between a page people scroll and
a page that heats the phone in their hand.

### 6.4 Cost controls, by construction

- Instanced meshes for anything repeated.
- Geometry allocated once at init and mutated in place — no per-frame
  allocation, so no GC sawtooth.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`, and 1 on the reduced
  tier.
- **No post-processing.** Bloom is the usual budget killer here; glow is faked
  with additive sprites at a fraction of the cost.

## 7. The four scenes

All geometry is procedural. Nothing is modelled, so no GLTF pipeline, no Draco,
and no dependency on a 3D artist.

**01 — You speak.** A radial waveform: instanced bars around a ring, displaced
by summed sines. Sound made visible, in `--accent`. One geometry, one draw
call.

**02 — It becomes a post.** The same points lerp to new targets, and the ring
collapses into the outline of an echo card. Not a new object — the identical
buffer, morphed. That reuse is why it reads as a transformation rather than a
swap, and why it costs nothing.

**03 — It carries anyway.** The card multiplies into an instanced drift. Signal
drops: colour falls to `--ink-faint`, motion stalls, cards stack into a visible
queue. Then they release and flow upward.

This beat shows `store/outbox.ts` draining — the real offline behaviour the app
has. Showing an actual mechanism is what separates this from a gradient with
particles on it, and it is the half of the story that explains *why* voice-first
matters on the phones this audience owns.

**04 — Get Echo.** Everything converges behind the call to action and settles.
The APK link is the resting point of the whole animation.

## 8. The fallback ladder

Three tiers. **The tier is decided before Three.js is fetched** — detection runs
in inline script, and the library arrives through a conditional dynamic
`import()` only if the device earned it. Otherwise the weakest phone pays the
highest price for a scene it will never see.

| Tier | Behaviour |
|---|---|
| **Full** | pixelRatio ≤2, full counts, all four scenes |
| **Reduced** | pixelRatio 1, ~40% counts, simplified morphs, no drift |
| **Poster** | Three.js never downloaded |

Demotion rules, in order:

1. `prefers-reduced-motion: reduce` → **poster, always**. Accessibility, not optimisation.
2. No WebGL context → poster.
3. `navigator.connection.saveData` → poster. The visitor has told you something; listen.
4. `effectiveType` of `2g` or `slow-2g` → poster.
5. `deviceMemory ≤ 4` or `hardwareConcurrency ≤ 4` → reduced.
6. **Runtime probe:** measure the first ~60 frames; median frame time above
   ~28ms demotes one tier mid-session. Static detection guesses; the probe
   measures. A phone that benchmarks acceptably and then thermally throttles is
   caught by this and by nothing else.

**The poster tier is not the animation switched off.** It is the same scroll
story told with GSAP on DOM opacity and transform, which costs almost nothing
and runs everywhere. Approach C's scrubbed image sequence lives here, with a
single static hero as the floor. Nobody gets a broken page, and nobody gets a
still one.

`?tier=poster` and `?tier=reduced` force a tier, so all three are inspectable
and screenshottable without hunting for a weak device.

**Where the poster frames come from.** They are rendered from the full tier's
own scene, captured off a headless run at fixed scroll positions, so the two
tiers cannot drift apart visually. This is an ordering dependency the plan has
to respect: **the full tier must work before the poster tier can be produced.**
Building the fallback first is not possible, and treating it as independent
work is how the poster ends up looking like a different website.

## 9. Verification

**In order of how much each actually catches.**

1. **Byte budget in CI** — `scripts/check-page-budget.mjs`, fails above 900KB
   gzipped. The only check that prevents silent regrowth, and the first one to
   write.
2. **Lighthouse via `chrome-devtools-mcp`**, throttled mobile, before and after.
   Targets: performance ≥90, LCP <2.5s, CLS <0.1, TBT <200ms.
3. **Forced tiers** — all three inspected, both themes, plus
   `prefers-reduced-motion` emulation.
4. **Real hardware** — the Pixel 4 emulator already configured, and a physical
   low-end device if one is available.
5. **Healthcheck addition** — `.github/workflows/healthcheck.yml` currently
   verifies `/privacy`. Add the download page **and the APK URL itself**. If
   that R2 object 404s, every download button on the site breaks silently and
   nothing today would report it.

## 10. Out of scope

- Any change to the deploy pipeline, the Netlify configuration, or `_redirects`.
- The app itself. This is a website.
- 3D asset authoring. Everything is procedural by design.
- Analytics beyond what the page already does.
- Localisation of the site. The app is localised in 26 languages; this page is
  English for now, and translating it is separate work.

## 11. Decisions deliberately deferred

- **Whether the hero copy leads in English or Hindi.** It affects the type
  system and possibly the font stack, and it is a positioning call rather than
  an engineering one.
- **Whether beat 03 names the offline feature explicitly** or shows it without
  labelling. Showing beats telling, but a visitor who does not already know the
  app may not read a stalling queue as a feature.
- **Whether to keep the existing screenshots** (`public/shots/{feed,tools,voice}.png`,
  472KB total) or reshoot them. They are usable; they are also the largest
  remaining images after the GIF is dealt with.
