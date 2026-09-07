/**
 * The hero scene — a real WebGL point cloud, not a 2D canvas.
 *
 * One BufferGeometry allocated once and mutated in place. Two target layouts
 * live alongside it: a radial waveform (sound made visible) and the outline of
 * an echo card. Scroll interpolates between them, so the wave does not get
 * swapped for a card — it BECOMES one. Reusing the same buffer is what makes
 * that read as a transformation, and it costs nothing per frame.
 *
 * The renderer does not hold a permanent rAF loop. It draws when scroll moves
 * or the idle drift needs a frame, and stops entirely when the tab is hidden
 * or the hero leaves the viewport. On a mid-range Android that is the
 * difference between a page people scroll and one that heats the phone.
 */
import * as THREE from 'three';
import { demote } from '/download/tier.js';

export function createScene(canvas, tier) {
  const COUNT = tier === 'full' ? 1200 : 620;

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: tier === 'full', alpha: true, powerPreference: 'low-power',
  });
  renderer.setPixelRatio(tier === 'full' ? Math.min(devicePixelRatio, 2) : 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 5.4);

  const css = getComputedStyle(document.documentElement);
  const read = (n, fb) => {
    const v = css.getPropertyValue(n).trim();
    try { return new THREE.Color(v || fb); } catch { return new THREE.Color(fb); }
  };
  const accent = read('--accent', '#A3C165');
  const faint  = read('--ink-faint', '#7C8470');
  const flag   = read('--flag', '#DDAF60');

  // Allocated once, mutated in place. Rebuilding buffers per frame is what
  // produces the GC sawtooth that reads as stutter on cheap Android.
  const positions = new Float32Array(COUNT * 3);
  const colors    = new Float32Array(COUNT * 3);
  const ring      = new Float32Array(COUNT * 3);
  const card      = new Float32Array(COUNT * 3);
  const drift     = new Float32Array(COUNT * 3);
  const queue     = new Float32Array(COUNT * 3);
  const seed      = new Float32Array(COUNT);

  // Layout A — concentric ripples.
  //
  // This replaced a single wobbling perimeter with an amplitude of +-0.62 on a
  // 2.15 radius. That read as a lumpy closed blob, because an irregular curve
  // has no symmetry and nothing tells the eye it was chosen rather than
  // stumbled into. Perfect circles are unmistakably deliberate, and rings
  // spreading outward are what the product is named after.
  //
  // The displacement here is 0.035, roughly a twentieth of what it was: enough
  // that the rings breathe, far too little to make them look drawn by hand.
  const RINGS = 7;
  const perRing = Math.floor(COUNT / RINGS);
  const ringIndex = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const r_i = Math.min(RINGS - 1, Math.floor(i / perRing));
    const k = i - r_i * perRing;
    // Offset each ring's start angle so the dots do not line up into spokes,
    // which is the other way a pattern like this looks cheap.
    const a = (k / perRing) * Math.PI * 2 + r_i * 0.37;
    const radius = 0.9 + r_i * 0.42;
    ringIndex[i] = r_i;
    ring[i * 3]     = Math.cos(a) * radius;
    ring[i * 3 + 1] = Math.sin(a) * radius * 0.82;
    ring[i * 3 + 2] = -r_i * 0.16;
    seed[i] = Math.random();
  }

  // Layout B — the outline of an echo card, walked as a perimeter so points
  // arrive in an order that makes the morph look intentional.
  const W = 2.5, H = 1.55, R = 0.34;
  const per = 2 * (W - 2 * R) + 2 * (H - 2 * R) + 2 * Math.PI * R;
  for (let i = 0; i < COUNT; i++) {
    let d = (i / COUNT) * per, x = 0, y = 0;
    const straightW = W - 2 * R, straightH = H - 2 * R, arc = (Math.PI / 2) * R;
    if (d < straightW) { x = -straightW / 2 + d; y = H / 2; }
    else if ((d -= straightW) < arc) { const t = d / arc * (Math.PI / 2); x = straightW / 2 + Math.sin(t) * R; y = H / 2 - R + Math.cos(t) * R; }
    else if ((d -= arc) < straightH) { x = W / 2; y = straightH / 2 - d; }
    else if ((d -= straightH) < arc) { const t = d / arc * (Math.PI / 2); x = straightW / 2 + Math.cos(t) * R; y = -straightH / 2 - Math.sin(t) * R; }
    else if ((d -= arc) < straightW) { x = straightW / 2 - d; y = -H / 2; }
    else if ((d -= straightW) < arc) { const t = d / arc * (Math.PI / 2); x = -straightW / 2 - Math.sin(t) * R; y = -H / 2 + R - Math.cos(t) * R; }
    else if ((d -= arc) < straightH) { x = -W / 2; y = -straightH / 2 + d; }
    else { const t = (d - straightH) / arc * (Math.PI / 2); x = -straightW / 2 - Math.cos(t) * R; y = straightH / 2 + Math.sin(t) * R; }
    card[i * 3] = x; card[i * 3 + 1] = y; card[i * 3 + 2] = (seed[i] - 0.5) * 0.06;
    // Layout C — where points go when the network drops and nothing sends.
    drift[i * 3]     = (seed[i] - 0.5) * 9;
    drift[i * 3 + 1] = (Math.random() - 0.5) * 5;
    drift[i * 3 + 2] = (Math.random() - 0.5) * 3.5;
    // Layout D — the outbox. Points stack into a held column: nothing is lost,
    // nothing has sent. This is store/outbox.ts, not an abstract flourish.
    const row = Math.floor(i / 34);
    queue[i * 3]     = ((i % 34) - 16.5) * 0.095;
    queue[i * 3 + 1] = 1.9 - row * 0.105;
    queue[i * 3 + 2] = (seed[i] - 0.5) * 0.25;
  }

  positions.set(ring);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: tier === 'full' ? 0.028 : 0.042,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    // Additive so overlapping points bloom without a post-processing pass —
    // EffectComposer would roughly double the fill cost for this one effect.
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  }));
  scene.add(points);

  const tmp = new THREE.Color();
  let progress = 0, queued = false, visible = true, disposed = false, t0 = performance.now();

  /* Interaction.
   *
   * Scroll-reactive is animation; pointer-reactive is interaction, and the
   * difference is whether the page answers the person or the scrollbar.
   *
   * The gesture is the product's own: press and hold is how you speak into
   * Echo, so holding here swells the ripples the way holding the record button
   * swells a waveform, and releasing sends one out. The site's interaction and
   * the app's interaction are the same gesture, which is the only reason to
   * choose this one over a hundred prettier ideas. */
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  let energy = 0, targetEnergy = 0, burstAt = -9, holding = false;

  function build(now) {
    const p = progress;
    // Cheap early-out: while the scene is hidden there is nothing to compute.
    if (p > 0.21 && p < 0.89) { points.visible = false; return; }
    // Five beats across the whole document. The camera never cuts.
    //   .00-.18  a voice          ring
    //   .18-.38  it becomes a post ring -> card
    //   .38-.58  it carries        card -> drift
    //   .58-.78  the signal drops  drift -> queue, colour falls out
    //   .78-1.0  it lands          queue -> converge behind the CTA
    const seg = (a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));
    const ease = t => t * t * (3 - 2 * t);

    const toCard   = ease(seg(0.18, 0.38));
    const toDrift  = ease(seg(0.14, 0.20));
    const toQueue  = ease(seg(0.90, 0.955));
    const toLand   = ease(seg(0.955, 1.00));
    const breathe  = Math.sin(now * 0.0013) * 0.5 + 0.5;

    for (let i = 0; i < COUNT; i++) {
      const j = i * 3;
      let x = ring[j], y = ring[j + 1], z = ring[j + 2];
      x += (card[j]  - x) * toCard;  y += (card[j + 1]  - y) * toCard;  z += (card[j + 2]  - z) * toCard;
      x += (drift[j] - x) * toDrift; y += (drift[j + 1] - y) * toDrift; z += (drift[j + 2] - z) * toDrift;
      x += (queue[j] - x) * toQueue; y += (queue[j + 1] - y) * toQueue; z += (queue[j + 2] - z) * toQueue;
      // Landing: everything converges and lifts, fastest points first, so the
      // release reads as a drain rather than a fade.
      const lift = toLand * (0.55 + seed[i] * 0.45);
      x += (0 - x) * lift; y += (0.15 - y) * lift; z += (0 - z) * lift;

      // At rest the rings travel outward and fade — an echo leaving, on a
      // loop. Motion carries the idea; the geometry stays perfectly circular.
      const calm = (1 - toCard) * (1 - toLand);
      if (calm > 0.001) {
        // Holding speeds the rings up and pushes them wider; a release sends
        // one pulse travelling outward from the moment of release.
        const since = (now - burstAt) * 0.001;
        const burst = since > 0 && since < 2.2 ? (1 - since / 2.2) : 0;
        // Holding must not blow the rings apart. The first attempt tripled
        // the travel speed and widened the spread by 1.1, which pushed every
        // ring off-screen and left a scattered starfield — losing the exact
        // structure that made the form read as deliberate, at the precise
        // moment someone is interacting with it. A hold should swell and
        // brighten in place.
        const speed = 0.00016 * (1 + energy * 0.55);
        const phase = (now * speed + ringIndex[i] / RINGS) % 1;
        const spread = 1 + phase * (1.5 + energy * 0.22 + burst * 0.55);
        x *= 1 + (spread - 1) * calm;
        y *= 1 + (spread - 1) * calm;
        // Breathe, not wobble: 0.035 against a radius near 1, so the ring
        // stays a ring.
        // Amplitude grows with the hold — the ring still stays a ring, the
        // ceiling is 0.10 rather than the 0.62 that made it a blob.
        const amp = 0.035 + energy * 0.085;
        // Phase per RING, not per point. seed[i] is random per point, so using
        // it made every dot on a ring breathe independently — an imperceptible
        // shimmer at 0.035 and a shredded, fuzzy band at 0.12 under a hold.
        // A ring only stays a ring if its points move together.
        const b = amp * Math.sin(now * (0.0019 + energy * 0.0022) + ringIndex[i] * 1.05);
        x += x * b; y += y * b;
        // Parallax: the field leans toward the pointer. Small on purpose —
        // enough to feel alive, not enough to look like it is chasing you.
        x += ptr.x * 0.22 * (0.4 + ringIndex[i] / RINGS);
        y += ptr.y * 0.16 * (0.4 + ringIndex[i] / RINGS);
      }
      positions[j] = x; positions[j + 1] = y; positions[j + 2] = z;

      // Colour carries the meaning: accent while it is a voice, gold as it
      // becomes a post, drained to faint while the network is gone, accent
      // again once it sends.
      const fade = 1 - (ringIndex[i] / RINGS) * 0.55;
      tmp.copy(accent)
        .lerp(flag, toCard * 0.55 * (0.6 + breathe * 0.4))
        .lerp(faint, toQueue * (1 - toLand))
        .lerp(accent, toLand * 0.8)
        .multiplyScalar((0.45 + fade * 0.55) * (1 + energy * 1.35));
      colors[j] = tmp.r; colors[j + 1] = tmp.g; colors[j + 2] = tmp.b;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;

    // Commit or disappear.
    //
    // The first version faded to a tenth through the content and read as dust
    // on the screen — visible enough to look like an artifact, faint enough to
    // look unintentional. That is worse than either extreme. So the scene is
    // fully present where it can be beautiful and fully ABSENT where it would
    // fight body copy; there is no in-between state where it merely lingers.
    const leave  = ease(seg(0.09, 0.20));
    // Returns only for the closing CTA. The panels section occupies most of
    // the last quarter of the scroll and is dense with text, so an earlier
    // ramp put the cloud straight through "competitors can't retrofit" —
    // the same mistake as the first version, just further down the page.
    const arrive = ease(seg(0.90, 0.97));
    const presence = Math.max(1 - leave, arrive);
    points.material.opacity = 0.95 * presence;
    points.visible = presence > 0.02;

    points.rotation.y = p * 0.9 + Math.sin(now * 0.0004) * 0.04;
    points.rotation.x = -0.28 * Math.sin(p * Math.PI);
    camera.position.z = 5.4 - Math.sin(p * Math.PI) * 1.1;
  }

  function draw() {
    queued = false;
    if (disposed || !visible) return;
    ptr.x += (ptr.tx - ptr.x) * 0.07;
    ptr.y += (ptr.ty - ptr.y) * 0.07;
    // Rises quickly, falls slowly — a held note, not a switch.
    energy += (targetEnergy - energy) * (targetEnergy > energy ? 0.10 : 0.035);
    build(performance.now() - t0);
    renderer.render(scene, camera);
  }
  function request() {
    if (queued || disposed || !visible) return;
    queued = true;
    requestAnimationFrame(draw);
  }

  // Idle drift needs frames even when scroll is still, but only while the hero
  // is actually on screen.
  let idle = null;
  function startIdle() { if (!idle) idle = setInterval(request, tier === 'full' ? 33 : 66); }
  function stopIdle() { if (idle) { clearInterval(idle); idle = null; } }

  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) { startIdle(); request(); } else stopIdle();
  });

  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { startIdle(); request(); } else stopIdle();
  }, { threshold: 0 });
  io.observe(canvas);

  function setProgress(t) { progress = Math.max(0, Math.min(1, t)); request(); }
  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    request();
  }
  function dispose() { disposed = true; stopIdle(); io.disconnect(); geometry.dispose(); renderer.dispose(); }

  // Frame probe: static hints guess at capability, this measures it. A phone
  // that benchmarks acceptably and then thermally throttles is caught here and
  // nowhere else.
  const samples = [];
  let last = performance.now(), probing = tier !== 'poster';
  const origDraw = draw;
  function probedDraw() {
    const now = performance.now();
    if (probing) {
      samples.push(now - last);
      if (samples.length >= 60) {
        probing = false;
        const median = samples.slice().sort((a, b) => a - b)[30];
        if (median > 28) {
          const next = demote(tier);
          document.documentElement.dataset.tier = next;
          if (next === 'poster') { dispose(); canvas.style.display = 'none'; }
        }
      }
    }
    last = now;
    origDraw();
  }
  draw = probedDraw;

  const onMove = e => {
    ptr.tx = (e.clientX / innerWidth) * 2 - 1;
    ptr.ty = -((e.clientY / innerHeight) * 2 - 1);
    request();
  };
  const press = () => { holding = true; targetEnergy = 1; document.documentElement.classList.add('holding'); request(); };
  const release = () => {
    if (!holding) return;
    holding = false; targetEnergy = 0;
    burstAt = performance.now() - t0;
    document.documentElement.classList.remove('holding');
    request();
  };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerdown', press, { passive: true });
  addEventListener('pointerup', release, { passive: true });
  addEventListener('pointercancel', release, { passive: true });
  // Leaving the window while held would otherwise strand energy at 1 forever.
  addEventListener('blur', release);

  resize();
  startIdle();
  return { setProgress, resize, dispose };
}
