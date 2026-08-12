# Survey Handoff Report: Core Layout & Verification Infrastructure (R3)

## 1. Observation

### Codebase Inventory & Main Navigation Screens
Examined all 8 files in `/Users/aena/Developer/echo-ios/app/(tabs)/`:
1. `app/(tabs)/_layout.tsx` (530 lines, 21,055 bytes)
2. `app/(tabs)/home.tsx` (807 lines, 34,050 bytes)
3. `app/(tabs)/chat.tsx` (1,523 lines, 63,686 bytes)
4. `app/(tabs)/apps.tsx` (482 lines, 26,837 bytes)
5. `app/(tabs)/explore.tsx` (570 lines, 23,885 bytes)
6. `app/(tabs)/marketplace.tsx` (718 lines, 30,674 bytes)
7. `app/(tabs)/notifications.tsx` (416 lines, 16,949 bytes)
8. `app/(tabs)/you.tsx` (1,120 lines, 32,158 bytes)

### Foundational Design System & Layout Tokens
- Theme tokens in `lib/theme.ts`: `ThemeColors` (`bg`, `surface`, `border`, `accent`, `glassFill`, `glassBorder`, `glassHighlight`, `ambientGradient`), `RADIUS_MAP` (`sm`, `md`, `lg`, `xl`, `card: 14`, `full: 9999`).
- Responsive tokens in `lib/responsive.ts`: `useResponsiveLayout()` (`gutter: 16/28`, `contentMaxWidth: 760/680`, `wideMaxWidth: 1180/920`, `bottomChromePadding`, `navigationKind`).
- Foundational components in `components/ui/`: `GlassPanel.tsx` (variants: `light`, `medium`, `heavy`, `ultra`), `ResponsiveScreen.tsx` (width presets: `content`, `wide`, `form`, `full`), `ScreenHeader.tsx`, `MiniAppShell.tsx`.

### Observed Discrepancies in Main Navigation Tabs (`app/(tabs)/`)

1. **Header Hand-Rolling & Disparate Insets**:
   - `home.tsx` lines 366, 651-660: Hand-rolled header height `headerHeight = insets.top + (layout.isDesktop ? 64 : 50)` with `AnimatedBlurView`.
   - `chat.tsx` lines 449-473, 662-670: Hand-rolled header controls and BlurView overlay.
   - `apps.tsx` lines 201, 469-478: Hand-rolled sticky glass header `HEADER_HEIGHT = insets.top + 70`.
   - `explore.tsx` lines 106, 244-255: Hand-rolled header `headerHeight = insets.top + (layout.isDesktop ? 86 : 112)`.
   - `notifications.tsx` lines 186-187, 294-317: Hand-rolled header `headerHeight = insets.top + 96`.
   - `marketplace.tsx` lines 546-586: Opaque header with `paddingTop: insets.top + 10`.
   - `you.tsx` lines 187, 445-455: ScrollView header with status-bar overlay mask `insets.top + 8`.

2. **Bypassing `GlassPanel` with Raw BlurView / Gradients**:
   - `home.tsx` line 55: Uses raw `AnimatedBlurView` + `<LinearGradient colors={['#E8834E', '#C94F1D']}>` instead of `GlassPanel`.
   - `chat.tsx` lines 6, 219, 293, 620: Raw `BlurView` and `LinearGradient` layers without `GlassPanel`.
   - `apps.tsx` lines 6, 121, 152, 170, 212: Raw `BlurView` and `LinearGradient` cards (`SmartStartCard`, `StatChip`).
   - `explore.tsx` lines 8, 245, 420: Raw `BlurView` and `LinearGradient` (`TopicTile`, `ExploreGridTile`).
   - `marketplace.tsx` lines 193, 203, 337: Raw `LinearGradient` layers.

3. **Hardcoded Hex Colors & Rigid Values**:
   - `chat.tsx` line 52: `const DM_COLOR = '#E06030'`, line 204: `#38BDF8`, lines 235, 293: `['#E8834E', '#C94F1D']`.
   - `explore.tsx` lines 33-36: `CATEGORY_FALLBACKS` hardcoded hex colors (`#4E7A8B`, `#C65F3F`, `#7A8B4E`, `#8B5E7D`).
   - `marketplace.tsx` lines 63-71: `CATEGORY_META` hardcoded hex colors (`#E06030`, `#4E7A8B`, `#4E8B7A`, `#7A8B4E`, `#B35D6B`, `#8B5E7D`, `#C65F3F`, `#B08536`, `#8B6F4E`).
   - `apps.tsx` line 416: Hardcoded hex strings `['#4F7DF3', '#7C6CE8', '#12A878', '#8B5E7D']`.

4. **Hardcoded Border Radii violatons**:
   - `chat.tsx` lines 99, 214, 280, 545, 580: `borderRadius: 28`, `borderRadius: 22`, `borderRadius: 21`, `borderRadius: 19`, `borderRadius: 18`.
   - `apps.tsx` lines 100, 120, 136, 145, 318, 429: `borderRadius: 22`, `borderRadius: 18`, `borderRadius: 16`, `borderRadius: 14`.
   - `explore.tsx` lines 151, 358, 419: `borderRadius: 18`, `borderRadius: 14`, `borderRadius: 13`.
   - System standard: `radius.card` (14), `radius.lg` (14), `radius.xl` (18), `radius.full` (9999) from `useTheme().radius`.

5. **Padding & Screen Structure Fragmentation**:
   - `apps.tsx` lines 23-24: `const PAD = 20; const GAP = 12;`.
   - `marketplace.tsx` lines 54-55: `const CARD_GAP = 12; const CARD_H_PADDING = 16;`.
   - `home.tsx` / `explore.tsx` / `notifications.tsx`: Use `layout.gutter`.

### Verification Infrastructure & Build Setup
- Found `package.json` scripts: `npm run mac:export` (`expo export --platform web --output-dir dist/web`), `npm run typecheck` (`tsc --noEmit`), `npm run test` (`vitest run`).
- Command `npx expo export` verifies compilation for production web/desktop.
- **Verification Script Absence**: Searched repository for `verify_ui.sh`. File `verify_ui.sh` **does not exist yet** in the codebase.

---

## 2. Logic Chain

1. **Premise**: Requirement R3 mandates that all main navigation screens in `app/(tabs)/` strictly adhere to the exact same padding, layout constraints, typography rules, border radii, and glassmorphism established by foundational components (`GlassPanel`, `ResponsiveScreen`, `ScreenHeader`, theme tokens). Acceptance criteria require automated UI verification via `verify_ui.sh` and error-free `npx expo export` build.
2. **Step 1 (Headers & Layout)**: Observing 7 different header height equations (`insets.top + 50/64/70/86/96/112`) across tabs demonstrates layout fragmentation. Unifying tab header structures and wrapping root views with `ResponsiveScreen` will standardize safe areas, top padding, and max-width bounds across iPhone, iPad, and Desktop.
3. **Step 2 (Glassmorphism & Panels)**: Observing raw `BlurView` + background View opacity hacks in `home.tsx`, `chat.tsx`, `apps.tsx`, `explore.tsx`, `notifications.tsx` shows non-conformance with `GlassPanel`. Replacing ad-hoc BlurViews with `<GlassPanel variant="...">` ensures consistent GPU performance, elevation shadows, borders, and light/dark mode glass fills.
4. **Step 3 (Color Tokens & Radii)**: Observing hardcoded hex colors (`#E06030`, `#4E7A8B`, `#C65F3F`, `#4F7DF3`, `#7C6CE8`) and rigid radii (`28`, `22`, `19`) across `chat.tsx`, `apps.tsx`, `explore.tsx`, `marketplace.tsx` proves violations of the design system. Refactoring these to `colors.accent`, `colors.surface`, `colors.border`, and `radius.card` / `radius.xl` / `radius.full` will achieve 100% theme token compliance.
5. **Step 4 (Verification Infrastructure)**: Because `verify_ui.sh` does not exist yet, an automated script must be created in the root directory. The script must regex-scan `app/mini-apps/` and `app/(tabs)/` for hardcoded hex colors (e.g. `#FFFFFF`, `#000000`, `#121214`) and non-standard `borderRadius` values, exiting with code 0 only when zero violations remain.

---

## 3. Caveats

- **Mini-App Embeds & Floating Panels**: Some tabs (like `chat.tsx` and `apps.tsx`) launch or embed mini-apps or modal sheets. Refactoring layout headers must ensure popups/sheets retain proper z-index and safe area context.
- **Performance Constraints**: iOS `BlurView` performance on card lists is sensitive. Using `GlassPanel` with conservative blur intensities (medium: 18, heavy: 30) or performance modes is critical to maintain 60fps scrolling in FlashList / ScrollView.
- **Third-Party Colors**: External avatars or brand badges (e.g. Phosphor icons) should use theme tokens where possible, while specific functional tags (e.g., status indicators) must use tokenized status colors (`colors.success`, `colors.warning`, `colors.danger`).

---

## 4. Conclusion

All 8 main navigation tab screens in `app/(tabs)/` require layout, header, glassmorphic, and styling standardization to satisfy Requirement R3.

### Summary of Discrepancies & Required Action Plan:

| Screen File | Main Layout Discrepancies | Target Refactoring |
|---|---|---|
| `app/(tabs)/_layout.tsx` | Hardcoded colors in badge & sidebar (`#fff`, `rgba(9,11,15,0.96)`) | Standardize sidebar & floating tab bar using theme tokens & `GlassPanel`. |
| `app/(tabs)/home.tsx` | Hand-rolled `AnimatedBlurView` header, hardcoded gradient hexes (`#E8834E`), rigid radii | Replace ad-hoc BlurView with standard header styling, convert hardcoded gradients to theme tokens. |
| `app/(tabs)/chat.tsx` | 1523 lines, hardcoded `DM_COLOR = '#E06030'`, rigid `borderRadius: 28/22/19`, raw BlurView | Standardize card radii to `radius.card` / `radius.xl`, adopt `colors.accent` / `colors.surface`, replace raw BlurViews with `GlassPanel`. |
| `app/(tabs)/apps.tsx` | Hardcoded `PAD = 20, GAP = 12`, raw BlurView header, hardcoded stat chip hex colors | Replace hardcoded constants with `layout.gutter`, wrap cards in `GlassPanel`, use theme colors. |
| `app/(tabs)/explore.tsx` | Hardcoded `CATEGORY_FALLBACKS` hexes (`#4E7A8B`), raw BlurView header, rigid tile gaps | Standardize tile radii and header glassmorphism, map topic colors to theme tokens. |
| `app/(tabs)/marketplace.tsx` | Hardcoded `CATEGORY_META` hexes (`#E06030`), rigid `CARD_GAP`, `CARD_H_PADDING` | Convert `CARD_H_PADDING` to `layout.gutter`, map category colors to palette tokens. |
| `app/(tabs)/notifications.tsx` | Custom header height equation (`insets.top + 96`), raw BlurView header overlay | Align header safe-area insets with standardized header pattern. |
| `app/(tabs)/you.tsx` | Hardcoded text scale constants, status-bar overlay mask, non-standard menu row styles | Clean up status-bar overlay padding, ensure menu rows and completion cards match theme radii. |

### Verification Infrastructure Action:
Create `/Users/aena/Developer/echo-ios/verify_ui.sh` bash script to scan for hardcoded hex colors and non-standard radii, ensuring 0 violations across `app/(tabs)/` and `app/mini-apps/`. Add `"verify:ui": "bash verify_ui.sh"` to `package.json`.

---

## 5. Verification Method

To independently verify Core Layout & Verification Infrastructure:

1. **Compilation & Syntax Check**:
   ```bash
   npx expo export --platform web --output-dir dist/web
   ```
   Or `npm run typecheck` (`tsc --noEmit`).

2. **Automated Style Audit (`verify_ui.sh`)**:
   Once `verify_ui.sh` is created, execute:
   ```bash
   bash verify_ui.sh
   ```
   Expected result: 0 violations found across `app/(tabs)/` and `app/mini-apps/`.

3. **Files to Inspect**:
   - `app/(tabs)/_layout.tsx`
   - `app/(tabs)/home.tsx`
   - `app/(tabs)/chat.tsx`
   - `app/(tabs)/apps.tsx`
   - `app/(tabs)/explore.tsx`
   - `app/(tabs)/marketplace.tsx`
   - `app/(tabs)/notifications.tsx`
   - `app/(tabs)/you.tsx`
   - `verify_ui.sh`
