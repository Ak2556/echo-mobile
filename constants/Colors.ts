/**
 * @deprecated Legacy color constants. Prefer using `useTheme()` from `@/lib/theme`
 * or `THEMES` for dynamic theme support.
 */
import { THEMES } from '../lib/theme';

export const Colors = {
  background: THEMES.midnight.bg,
  surface: THEMES.midnight.surface,
  primary: THEMES.midnight.accent,
  text: THEMES.midnight.text,
  textMuted: THEMES.midnight.textMuted,
  border: THEMES.midnight.border,
} as const;

export default Colors;

