/**
 * Which version of the page this device gets.
 *
 * Called BEFORE Three.js is fetched. That ordering is the whole point: a phone
 * that will end up on the poster must never pay 86KB for a renderer it will
 * not use. Detection first, conditional import second.
 *
 * Missing hints mean "capable", not "weak". Safari reports neither
 * deviceMemory nor effectiveType, and defaulting those to the worst case would
 * poster every iPhone — the fastest devices in this audience.
 */
export const TIERS = ['full', 'reduced', 'poster'];

export function resolveTier(env) {
  // Accessibility first, and deliberately not overridable by ?tier=. Someone
  // who asked their OS to reduce motion asked every site, including this one.
  if (env.reducedMotion) return 'poster';

  if (TIERS.includes(env.forced)) return env.forced;

  if (!env.hasWebGL) return 'poster';
  if (env.saveData) return 'poster';
  if (env.effectiveType === '2g' || env.effectiveType === 'slow-2g') return 'poster';

  if (typeof env.deviceMemory === 'number' && env.deviceMemory <= 4) return 'reduced';
  if (typeof env.hardwareConcurrency === 'number' && env.hardwareConcurrency <= 4) return 'reduced';

  return 'full';
}

/** One step down. Used by the runtime frame-rate probe, which measures what static hints only guess. */
export function demote(tier) {
  const i = TIERS.indexOf(tier);
  if (i === -1) return 'poster';
  return TIERS[Math.min(i + 1, TIERS.length - 1)];
}
