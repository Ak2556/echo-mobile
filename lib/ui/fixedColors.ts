/**
 * Colours that do not follow the theme, on purpose.
 *
 * A screen reads its colours from `useTheme()`; a hex literal in a screen is a
 * colour that ignores the user's theme, the dark/light switch and a custom accent.
 * Everything here is deliberate, and named for the job it does so a reader can
 * tell it from an accident. `test/noHardcodedColours.test.ts` fails on any other
 * hex literal under app/.
 */
import { WARM_AVATAR_COLORS } from '../social/avatarPalette';

const [terracotta, ochre, olive, sage, steel, dusk, plum, roseClay, brick, caramel] = WARM_AVATAR_COLORS;

/** The warm editorial palette used for categories, tints and identity colours. */
export const WARM = { terracotta, ochre, olive, sage, steel, dusk, plum, roseClay, brick, caramel, heather: '#6E5E8B' } as const;

/** Echo's own marks. */
export const BRAND = {
  ember: '#E06030',
  emberFrom: '#E8834E',
  emberTo: '#C94F1D',
  ink: '#0C0B09',
  indigo: '#6366F1',
  gold: '#EAB308',
  mint: '#34D399',
  like: '#F0506E',
} as const;

/** Tints for the three dashboard stat chips on the Tools tab. */
export const STAT = { blue: '#4F7DF3', violet: '#7C6CE8', green: '#12A878' } as const;

/** Topic colours on Explore that sit beside the warm palette. */
export const TOPIC = { vermilion: '#C6533F', slate: '#5E7A8B', moss: '#7D8B5E', straw: '#8B7A4E' } as const;

/** Badge tiers below gold. */
export const TIER = { bronze: '#B45309', silver: '#71717A' } as const;

/** Status colours for modules that have no theme in scope (a screen with a theme uses `colors.danger` and friends). */
export const STATUS = { danger: '#EF4444', success: '#10B981', warning: '#F59E0B' } as const;

/** Content over a photo, a video, a dark scrim or an avatar colour. White stays white in every theme. */
export const ON_MEDIA = '#FFFFFF';
/** Content on a solid danger, success or warning fill. */
export const ON_STATUS = '#FFFFFF';
/** The knob of a switch. */
export const SWITCH_THUMB = '#FFFFFF';
/** Drop shadows are black in every theme. */
export const SHADOW = '#000000';
/** A black stage: the media viewer behind a photo or video. */
export const STAGE = '#000000';

/**
 * Screens that are dark whatever the theme: the sign-in flow, a few full-bleed
 * conversation screens. Keeping them in one place is what lets them be moved onto
 * the theme later in one edit.
 */
export const DARK = {
  canvas: '#0A0A0F',
  bg: '#000000',
  raised: '#18181B',
  line: '#27272A',
  lineStrong: '#3F3F46',
  faint: '#52525B',
  muted: '#71717A',
  soft: '#A1A1AA',
  text: '#FFFFFF',
  onLight: '#000000',
  panel: '#101018',
  divider: '#141418',
  pale: '#E4E4E7',
} as const;
