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
import { demote } from './tier.js';

export function createScene(canvas, tier) {
  const COUNT = tier === 'full' ? 1200 : 620;

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: tier === 'full', alpha: true, powerPreference: 'low-power',
  });
  renderer.setPixelRatio(tier === 'full' ? Math.min(devicePixelRatio, 2) : 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 7.2);

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

  // Layout A — a radial waveform. Radius modulated by summed sines so it reads
  // as an audio meter rather than a plain circle.
  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2;
    const amp = 0.55 * Math.sin(a * 7) + 0.30 * Math.sin(a * 13 + 1.1) + 0.18 * Math.sin(a * 23 + 2.3);
    const r = 2.15 + amp * 0.62;
    ring[i * 3]     = Math.cos(a) * r;
    ring[i * 3 + 1] = Math.sin(a) * r * 0.62;
    ring[i * 3 + 2] = Math.sin(a * 5) * 0.20;
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
    size: tier === 'full' ? 0.05 : 0.075,
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

      // Idle life while at rest, so a paused scroll is not a still image.
      const calm = (1 - toCard) * (1 - toLand);
      positions[j] = x;
      positions[j + 1] = y + calm * 0.05 * Math.sin(now * 0.0022 + seed[i] * 31.4);
      positions[j + 2] = z;

      // Colour carries the meaning: accent while it is a voice, gold as it
      // becomes a post, drained to faint while the network is gone, accent
      // again once it sends.
      tmp.copy(accent)
        .lerp(flag, toCard * 0.55 * (0.6 + breathe * 0.4))
        .lerp(faint, toQueue * (1 - toLand))
        .lerp(accent, toLand * 0.8);
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

    points.rotation.y = p * 1.35 + Math.sin(now * 0.0004) * 0.06;
    points.rotation.x = -0.28 * Math.sin(p * Math.PI);
    camera.position.z = 7.2 - Math.sin(p * Math.PI) * 1.6;
  }

  function draw() {
    queued = false;
    if (disposed || !visible) return;
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

  resize();
  startIdle();
  return { setProgress, resize, dispose };
}
