# Handoff Report: Foundational UI Components & Design Tokens Survey (R1)

## 1. Observation

Direct observations and evidence gathered from code investigation across `/Users/aena/Developer/echo-ios`:

### A. Foundational UI Components & Wrappers
1. **`MiniAppShell` (`components/mini-apps/MiniAppShell.tsx`)**:
   - Primary wrapper for mini-apps. Accepts `title`, `subtitle`, `children`, `scrollable`, `scrollPadding` (default `20`), `headerRight`, `bottomPad` (default `32`).
   - Line 52: Header height calculation is hardcoded: `HEADER_H = embedded ? 0 : insets.top + 60`.
   - Line 117: Header blur uses hardcoded intensity: `<BlurView intensity={80} tint={tint} ... />`.
   - Line 148: Back button uses hardcoded border radius (`borderRadius: 18`) and hardcoded translucent fill (`colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'`) instead of using `radius` tokens or `IconButton`.
   - Line 173: Title uses `Fraunces_600SemiBold` 20px (lineHeight 25px); subtitle uses 12px `colors.textMuted`.

2. **`GlassPanel` (`components/ui/GlassPanel.tsx`)**:
   - Core glassmorphism surface wrapper. Defines 4 variant blur intensity presets (Line 15):
     - `light: 0`, `medium: 18`, `heavy: 30`, `ultra: 42`.
   - Line 45: Default border radius is hardcoded: `borderRadius = 16` (does not reference `radius.card` or `radius.lg` from `lib/theme.ts`).
   - Line 60-62: Uses `tintOverride ?? (colors.glassFill ?? 'rgba(255,255,255,0.07)')`, `border: colors.glassBorder ?? 'rgba(255,255,255,0.13)'`, `highlight: colors.glassHighlight ?? 'rgba(255,255,255,0.09)'`.
   - Lines 89-112: Renders top edge highlight line (1px, `colors.glassHighlight`) and optional bottom edge highlight.
   - Lines 120-132: Fallback for Android/non-blur mode renders opaque `colors.surface` background with 1px `colors.glassBorder`.

3. **`MiniKit` (`components/mini-apps/MiniKit.tsx`)**:
   - Shared component vocabulary for mini-apps: `MiniCommandDeck`, `MiniHero`, `MiniStatCard`, `MiniChip`, `MiniCard`, `MiniSectionHeader`, `MiniEmptyState`, `MiniButton`, `MiniInput`.
   - Line 56: `MiniCommandDeck` hardcodes `borderRadius={compact ? 18 : 22}`.
   - Line 131: `MiniHero` hardcodes `borderRadius={24}`.
   - Line 164: `MiniStatCard` hardcodes `borderRadius: 14`.
   - Line 238: `MiniCard` hardcodes `borderRadius={20}`.
   - Line 336: `MiniButton` hardcodes `borderRadius: 16`.
   - Line 409: `MiniInput` hardcodes `borderRadius: 14` and uses hardcoded `rgba(255,255,255,0.05)` / `rgba(0,0,0,0.03)` instead of `colors.inputBg`.

4. **`AnimatedPressable` (`components/ui/AnimatedPressable.tsx`)**:
   - Interactive touch primitive with Lite path (un-animated Pressable) and Heavy path (Reanimated spring, 3D tilt, depth sink).
   - Partitioning logic automatically separates outer layout props from inner box styling to prevent Release build layout drops.
   - Lines 116-121 & 278-283: Invokes `Haptics.impactAsync` directly using `expo-haptics` import instead of calling `lib/haptics.ts`.

5. **`ResponsiveScreen` (`components/ui/ResponsiveScreen.tsx`)**:
   - Cross-device layout contract wrapper. Enforces safe area edges and max content width (`content` 680/760px, `wide` 920/1180px, `form` 460/560px, `full` edge-to-edge).

6. **`ScreenHeader` (`components/ui/ScreenHeader.tsx`) & `IconButton` (`components/ui/IconButton.tsx`)**:
   - Standardized header row and icon button primitives using Phosphor icon tokens (`ICON_SIZE`, `ICON_WEIGHT`).

---

### B. Design Token Definitions & Export/Import Architecture
1. **Color Tokens (`lib/theme.ts` & `lib/accentDesign.ts`)**:
   - `lib/theme.ts`: Exports `THEMES` object defining 9 color themes (`midnight`, `amoled`, `nord`, `tokyonight`, `rosepine`, `light`, `nord_light`, `tokyonight_day`, `rosepine_dawn`).
   - 23 color tokens per theme: `bg`, `bgPure`, `surface`, `surfaceHover`, `border`, `text`, `textSecondary`, `textMuted`, `accent`, `accentMuted`, `danger`, `dangerMuted`, `success`, `warning`, `tabBar`, `tabBorder`, `inputBg`, `inputBorder`, `glassFill`, `glassBorder`, `glassHighlight`, `glassHeavyFill`, `glassLightFill`, `ambientGradient`.
   - `lib/accentDesign.ts`: Exports `ACCENT_COLORS` (`cyan`, `magenta`, `lime`, `violet`, `amber` and `Dim` variants) and `GRADIENTS` (`remix`, `evolutions`, `forYou`, `achievement`, `heroOverlay`).
   - Legacy file `constants/Colors.ts` contains an obsolete 9-line object with 6 hardcoded colors (`background: '#000000'`, `surface: '#121214'`, `primary: '#3B82F6'`, `text: '#FFFFFF'`, `textMuted: '#A1A1AA'`, `border: '#27272A'`). Zero imports exist in active UI files.

2. **Typography Tokens (`lib/theme.ts`, `lib/fontPresets.ts`, `lib/accentDesign.ts`)**:
   - `FONT_SIZE_MAP` in `lib/theme.ts`: `small`, `medium`, `large` font scaling maps (`caption`, `small`, `body`, `title`, `heading`).
   - `LINE_HEIGHT_MULTIPLIERS` in `lib/theme.ts`: `caption` (1.35), `small` (1.45), `body` (1.5), `title` (1.3), `heading` (1.22).
   - `lib/fontPresets.ts`: `buildFontPreset()` supporting 'editorial', 'modern', 'system', 'reader' mapped to Fraunces (display/serif) and Inter (body).
   - `DISPLAY_TYPE` in `lib/accentDesign.ts`: `hero` (44/48/900), `display` (34/38/900), `title` (26/30/800), `eyebrow` (11/800/2.5/uppercase), `stat` (28/900/tabular-nums).

3. **Corner Radii Tokens (`lib/theme.ts`)**:
   - `RADIUS_MAP` in `lib/theme.ts` for small/medium/large settings:
     - `medium` (default): `{ sm: 6, md: 10, lg: 14, xl: 18, card: 14, full: 9999 }`.

4. **Haptic Feedback Tokens (`lib/haptics.ts` vs `lib/accentDesign.ts` vs direct imports)**:
   - `lib/haptics.ts`: `tap(kind: HapticKind)` handling `'light'`, `'medium'`, `'heavy'`, `'success'`, `'warning'`, `'error'`, `'selection'`.
   - `lib/accentDesign.ts`: `feedbackHaptic(intensity)` handling `'tap'`, `'select'`, `'success'`, `'remix'`, `'celebrate'`.
   - Direct `expo-haptics` imports: 25+ files import `* as Haptics from 'expo-haptics'` directly and invoke `Haptics.impactAsync(...)` (e.g., `app/mini-apps/pomodoro.tsx`, `app/mini-apps/camera.tsx`, `app/mini-apps/dice.tsx`, `app/mini-apps/fitness.tsx`, `components/ui/AnimatedPressable.tsx`).

5. **Motion & Spring Tokens (`lib/theme.ts` vs `lib/motion.ts` vs `lib/accentDesign.ts`)**:
   - `lib/theme.ts` defines `ANIM` (`springSnappy`, `springPress`, `springBadge`).
   - `lib/motion.ts` defines `MOTION` (`pressSoft`, `pressFirm`, `pressDeep`, `release`, `snap`, `settle`, `overshoot`, `entrance`, `cardEntrance`, `modalEntrance`) and `PRESS_DEPTH`.
   - `lib/accentDesign.ts` defines `ACCENT_SPRING` (`press`, `pop`, `pulse`, `release`).

6. **Icon System (`lib/icons.ts`)**:
   - `ICON_SIZE`: `xs: 14`, `sm: 16`, `md: 20`, `lg: 24`, `xl: 28`, `hero: 44`.
   - `ICON_WEIGHT`: `resting: 'bold'`, `active: 'fill'`, `hero: 'duotone'`.

---

## 2. Logic Chain

1. **Premise 1: Design System Standardization Goal (R1)**
   Requirement R1 specifies standardizing `MiniAppShell`, `GlassPanel`, and shared UI wrappers to enforce a strict set of premium design tokens (border radii, glassmorphism opacities, haptics, typography, spacing).

2. **Premise 2: Identification of Token Fragmentation & Disconnects**
   - *Haptics*: Three parallel methods exist (`lib/haptics.ts` `tap()`, `lib/accentDesign.ts` `feedbackHaptic()`, direct `expo-haptics` calls in 25+ files). Component callers bypass the haptic abstraction, causing inconsistent feedback.
   - *Glassmorphism Blur*: `GlassPanel` uses variant intensity levels (`18`, `30`, `42`), whereas `MiniAppShell` hardcodes `intensity={80}`, `Button` uses `60`/`30`, and mini-apps use arbitrary values (50, 70, 80).
   - *Corner Radii*: `lib/theme.ts` defines `radius` (`sm`, `md`, `lg`, `xl`, `card`), but `GlassPanel` defaults to hardcoded `16`, `MiniKit` hardcodes `14`/`16`/`18`/`20`/`22`/`24`, and mini-apps hand-roll numbers from `8` to `32`.
   - *Spacing*: `lib/theme.ts` lacks a centralized `spacing` token map (e.g. `spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 }`), leading to random margin/padding numbers (`7`, `9`, `11`, `13`, `15`, `17`, `21`).
   - *Motion / Springs*: Motion tokens are split across three files (`ANIM` in `lib/theme.ts`, `MOTION` in `lib/motion.ts`, `ACCENT_SPRING` in `lib/accentDesign.ts`).

3. **Premise 3: Identification of Foundational Component Refactoring Needs**
   - `GlassPanel.tsx` should bind its default `borderRadius` to `useTheme().radius.card` (14) or `radius.lg` (14/16), and export standard glass blur intensity tokens.
   - `MiniAppShell.tsx` should replace hardcoded back button styles (`borderRadius: 18`, `rgba(...)`) with `IconButton` / theme tokens, and use standardized header blur intensity.
   - `MiniKit.tsx` should bind all wrapper radii (`MiniHero`, `MiniCard`, `MiniCommandDeck`, `MiniStatCard`, `MiniButton`, `MiniInput`) directly to theme `radius` tokens, and use `colors.inputBg` for `MiniInput`.
   - Legacy `constants/Colors.ts` should be cleaned up or pointed to `useTheme()` tokens to prevent developer confusion.

---

## 3. Caveats

- **Scope Boundary**: This investigation focused specifically on Requirement R1 (Foundational Components and Design Tokens). The detailed deep sweep of individual mini-apps (R2) and main tab navigation screens (R3) was observed for token consumption patterns, but full line-by-line mini-app audit for R2 refactoring is assigned to subsequent passes.
- **Platform Specificity**: iOS supports `BlurView` hardware acceleration for glassmorphism, while Android / low-power mode falls back to opaque surface colors (`colors.surface`) with borders. Design tokens must remain cross-platform safe.

---

## 4. Conclusion

To complete Requirement R1 and prepare the codebase for R2 and R3:

1. **Enhance `lib/theme.ts`**:
   - Add centralized `SPACING` tokens (`spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 }`).
   - Consolidate Glassmorphism intensity tokens (`GLASS_INTENSITY = { light: 18, medium: 30, heavy: 45, ultra: 70 }`).
   - Re-export unified motion spring presets (`MOTION` from `lib/motion.ts`).

2. **Standardize `lib/haptics.ts`**:
   - Unify `feedbackHaptic` into `lib/haptics.ts` so all haptics (impact, notification, selection, compound feedback) flow through `tap()` or `hapticFeedback()`.

3. **Refactor `GlassPanel.tsx`**:
   - Use theme `radius.card` / `radius.lg` as the default `borderRadius`.
   - Reference `GLASS_INTENSITY` tokens for blur levels.

4. **Refactor `MiniAppShell.tsx`**:
   - Standardize glass header blur intensity to use `GLASS_INTENSITY.heavy` (or `ultra`).
   - Replace hand-rolled back button with `IconButton` or theme token styling.

5. **Refactor `MiniKit.tsx`**:
   - Update `MiniHero`, `MiniCard`, `MiniCommandDeck`, `MiniStatCard`, `MiniButton`, `MiniInput` to use theme `radius` tokens instead of hardcoded numbers.
   - Update `MiniInput` background to use `colors.inputBg`.

6. **Clean up `constants/Colors.ts`**:
   - Deprecate/update obsolete `constants/Colors.ts` file.

---

## 5. Verification Method

To independently verify these survey findings and test proposed standardization updates:

1. **File Inspection**:
   - Inspect `components/ui/GlassPanel.tsx` (lines 15, 45, 60-62) to verify intensity variants and default border radius.
   - Inspect `components/mini-apps/MiniAppShell.tsx` (lines 52, 117, 148) to verify header height calculation, blur intensity, and back button styling.
   - Inspect `components/mini-apps/MiniKit.tsx` (lines 56, 131, 164, 238, 336, 409) to verify hardcoded radius numbers.
   - Inspect `lib/theme.ts`, `lib/haptics.ts`, `lib/motion.ts`, `lib/accentDesign.ts` to confirm token structure.

2. **Compilation & Verification Commands**:
   - Check TypeScript compilation: `npx tsc --noEmit` or `npx expo export` (if dependencies are installed).
   - Search for raw hex color strings in mini-apps: `grep -E '#[0-9a-fA-F]{6}' app/mini-apps/*.tsx`.
