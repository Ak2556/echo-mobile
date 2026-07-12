// Warm editorial avatar palette. The original identity colors were saturated
// Tailwind hues (indigo/sky/lime…) that fight the warm-ink design system —
// every avatar was the loudest thing on screen. These ten sit back: muted,
// warm-leaning, all readable with white initials.
//
// The DB migration (20260712140000) remaps stored values; this module keeps a
// legacy→warm map anyway so cached rows, local seed data, and stale clients
// render warm immediately.

export const WARM_AVATAR_COLORS = [
  '#C65F3F', // terracotta
  '#B08536', // ochre
  '#7A8B4E', // olive
  '#4E8B7A', // sage
  '#4E7A8B', // steel
  '#5E748B', // dusk
  '#8B5E7D', // plum
  '#B35D6B', // rose clay
  '#A04E4E', // brick
  '#8B6F4E', // caramel
] as const;

const LEGACY_TO_WARM: Record<string, string> = {
  '#6366f1': '#5E748B', // indigo → dusk
  '#3b82f6': '#4E7A8B', // blue → steel
  '#8b5cf6': '#8B5E7D', // violet → plum
  '#a78bfa': '#8B5E7D', // violet light → plum
  '#ec4899': '#B35D6B', // pink → rose clay
  '#f472b6': '#B35D6B', // pink light → rose clay
  '#ef4444': '#A04E4E', // red → brick
  '#f59e0b': '#B08536', // amber → ochre
  '#f97316': '#C65F3F', // orange → terracotta
  '#fb923c': '#C65F3F', // orange light → terracotta
  '#10b981': '#4E8B7A', // emerald → sage
  '#4ade80': '#7A8B4E', // green → olive
  '#84cc16': '#7A8B4E', // lime → olive
  '#14b8a6': '#4E8B7A', // teal → sage
  '#06b6d4': '#4E7A8B', // cyan → steel
  '#38bdf8': '#4E7A8B', // sky → steel
};

/**
 * Resolve any stored identity color to the warm palette: warm values pass
 * through, legacy values map to their warm equivalent, anything else falls
 * back deterministically from the seed (usually the display name) so the
 * same user always gets the same tone.
 */
export function warmAvatarColor(color?: string | null, seed?: string): string {
  const c = color?.trim().toLowerCase();
  if (c) {
    if ((WARM_AVATAR_COLORS as readonly string[]).some(w => w.toLowerCase() === c)) return color!.trim();
    const mapped = LEGACY_TO_WARM[c];
    if (mapped) return mapped;
    if (/^#[0-9a-f]{6}$/.test(c)) {
      // Unknown custom color — keep the hue family stable by hashing it.
      return WARM_AVATAR_COLORS[hash(c) % WARM_AVATAR_COLORS.length];
    }
  }
  return WARM_AVATAR_COLORS[hash(seed ?? 'echo') % WARM_AVATAR_COLORS.length];
}

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}
