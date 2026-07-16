export type FontStyleName = 'editorial' | 'modern' | 'system' | 'reader';

export const FONT_STYLE_OPTIONS: { label: string; value: FontStyleName; desc: string }[] = [
  { label: 'Editorial', value: 'editorial', desc: 'Echo default: warm serif headings with clean body text' },
  { label: 'Modern Sans', value: 'modern', desc: 'Minimal Inter across headings, labels, and body' },
  { label: 'System', value: 'system', desc: 'Native iOS/Android typography for maximum familiarity' },
  { label: 'Reader', value: 'reader', desc: 'Softer serif voice for posts, notes, and longer reading' },
];

export function fontStyleLabel(value: FontStyleName): string {
  return FONT_STYLE_OPTIONS.find(option => option.value === value)?.label ?? FONT_STYLE_OPTIONS[0].label;
}

// The canonical uppercase eyebrow label. Apply color (usually colors.textMuted)
// at the call site; this owns size, weight, tracking, and casing only.
const EYEBROW = { fontSize: 12, fontFamily: 'Inter_600SemiBold' as const, letterSpacing: 1.4, textTransform: 'uppercase' as const };

export function buildFontPreset(value: FontStyleName) {
  switch (value) {
    case 'modern':
      return {
        body:         { fontFamily: 'Inter_400Regular' },
        bodyMedium:   { fontFamily: 'Inter_500Medium' },
        bodySemibold: { fontFamily: 'Inter_600SemiBold' },
        bodyBold:     { fontFamily: 'Inter_700Bold' },
        display:      { fontFamily: 'Inter_700Bold' as const, letterSpacing: 0 },
        displayBlack: { fontFamily: 'Inter_800ExtraBold' as const, letterSpacing: 0 },
        serif:        { fontFamily: 'Inter_400Regular' as const, letterSpacing: 0 },
        quote:        { fontFamily: 'Inter_400Regular' as const, letterSpacing: 0 },
        eyebrow:      EYEBROW,
      };
    case 'system':
      return {
        body:         {},
        bodyMedium:   { fontWeight: '500' as const },
        bodySemibold: { fontWeight: '600' as const },
        bodyBold:     { fontWeight: '700' as const },
        display:      { fontWeight: '700' as const, letterSpacing: 0 },
        displayBlack: { fontWeight: '800' as const, letterSpacing: 0 },
        serif:        { letterSpacing: 0 },
        quote:        { fontStyle: 'italic' as const, letterSpacing: 0 },
        eyebrow:      { fontSize: 12, fontWeight: '600' as const, letterSpacing: 1.4, textTransform: 'uppercase' as const },
      };
    case 'reader':
      return {
        body:         { fontFamily: 'Inter_400Regular' },
        bodyMedium:   { fontFamily: 'Inter_500Medium' },
        bodySemibold: { fontFamily: 'Inter_600SemiBold' },
        bodyBold:     { fontFamily: 'Inter_700Bold' },
        display:      { fontFamily: 'Fraunces_400Regular' as const, letterSpacing: 0 },
        displayBlack: { fontFamily: 'Fraunces_500Medium' as const, letterSpacing: 0 },
        serif:        { fontFamily: 'Fraunces_400Regular' as const, letterSpacing: 0 },
        quote:        { fontFamily: 'Fraunces_400Regular_Italic' as const, letterSpacing: 0 },
        eyebrow:      EYEBROW,
      };
    case 'editorial':
    default:
      return {
        body:         { fontFamily: 'Inter_400Regular' },
        bodyMedium:   { fontFamily: 'Inter_500Medium' },
        bodySemibold: { fontFamily: 'Inter_600SemiBold' },
        bodyBold:     { fontFamily: 'Inter_700Bold' },
        display:      { fontFamily: 'Fraunces_500Medium' as const, letterSpacing: 0 },
        displayBlack: { fontFamily: 'Fraunces_600SemiBold' as const, letterSpacing: 0 },
        serif:        { fontFamily: 'Fraunces_400Regular' as const, letterSpacing: 0 },
        quote:        { fontFamily: 'Fraunces_400Regular_Italic' as const, letterSpacing: 0 },
        eyebrow:      EYEBROW,
      };
  }
}
