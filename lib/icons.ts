/**
 * Echo icon system.
 *
 * Before this, ~772 icon usages across 122 files mixed five phosphor weights
 * (bold/fill/regular/thin/duotone) and ad-hoc sizes from 11→48px with no
 * system. This module is the single source of truth for the app-wide sweep.
 *
 * Weight roles — confident, high-contrast (the app already leans bold):
 *   • resting  → `bold`     most standalone / inline UI icons
 *   • active   → `fill`     selected / active / accent-emphasis glyphs
 *   • hero     → `duotone`  large decorative icons (empty states, features)
 *  (`thin` is retired — too fragile at UI sizes.)
 *
 * Size scale — a small, deliberate set. Reach for the nearest token instead of
 * a bespoke number.
 *   xs 14 · sm 16 · md 20 · lg 24 · xl 28 · hero 44
 *
 * Navigation / tab-bar icons are deliberately OUT of scope for the sweep and
 * keep their own treatment.
 */

import type { IconWeight } from 'phosphor-react-native';

export const ICON_SIZE = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
  hero: 44,
} as const;

export type IconSizeToken = keyof typeof ICON_SIZE;

export const ICON_WEIGHT = {
  resting: 'bold',
  active: 'fill',
  hero: 'duotone',
} as const satisfies Record<string, IconWeight>;

export type IconRole = keyof typeof ICON_WEIGHT;
