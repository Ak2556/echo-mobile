# Project: Echo iOS UI/UX Standardization

## Architecture
- **Theme & Token Infrastructure (`lib/`)**: `lib/theme.ts` (colors, radii, font sizes, line heights, glass presets, spacing), `lib/haptics.ts` (haptic feedback abstraction), `lib/motion.ts` (reanimated spring presets), `lib/responsive.ts` (responsive layout hooks & safe insets).
- **Foundational UI Components (`components/ui/` & `components/mini-apps/`)**:
  - `GlassPanel.tsx`: Primary glassmorphic container supporting blur variants (`light`, `medium`, `heavy`, `ultra`), standard radii, and top/bottom highlight borders.
  - `MiniAppShell.tsx`: Standardized container for mini-apps, managing navigation headers, safe insets, title/subtitle, back buttons, and scroll views.
  - `MiniKit.tsx`: Shared mini-app primitives (`MiniHero`, `MiniCard`, `MiniCommandDeck`, `MiniStatCard`, `MiniButton`, `MiniInput`, `MiniChip`, `MiniSectionHeader`, `MiniEmptyState`).
  - `ResponsiveScreen.tsx`: Cross-device layout container enforcing content width boundaries (`content`, `wide`, `form`, `full`).
- **Main Navigation Screens (`app/(tabs)/`)**: 8 core screens (`_layout.tsx`, `home.tsx`, `chat.tsx`, `apps.tsx`, `explore.tsx`, `marketplace.tsx`, `notifications.tsx`, `you.tsx`).
- **Mini-App Fleet (`app/mini-apps/`)**: 23 mini-app screens (+ subcomponents in `components/mini-apps/`).
- **Verification Infrastructure**: `verify_ui.sh` regex audit script, `npx expo export` compilation test.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Standardize Theme & Spacing Tokens | Add centralized `SPACING` tokens, glass blur intensity tokens (`GLASS_INTENSITY`), and clean obsolete `constants/Colors.ts` | M1 | R1 Survey |
| 2 | Standardize `GlassPanel` | Bind default `borderRadius` to theme `radius.card` (14), reference `GLASS_INTENSITY` blur tokens | M1 | R1 Survey |
| 3 | Standardize `MiniAppShell` | Replace hardcoded header blur (80), back button styles (`borderRadius: 18`, `rgba(...)`) with `IconButton` & theme tokens | M1 | R1 Survey |
| 4 | Standardize `MiniKit` Components | Update all `MiniKit` primitives (`MiniHero`, `MiniCard`, `MiniCommandDeck`, `MiniStatCard`, `MiniButton`, `MiniInput`) to use theme `radius` tokens and `colors.inputBg` | M1 | R1 Survey |
| 5 | Unify Haptic Feedback System | Consolidate direct `expo-haptics` calls into `lib/haptics.ts` `tap()` abstraction | M1 | R1 Survey |
| 6 | Eradicate Hardcoded Styles in Tier 1 Mini-Apps | Refactor 6 monolithic mini-apps (`learn.tsx`, `fitness.tsx`, `pomodoro.tsx`, `expenses.tsx`, `habits.tsx`, `notes.tsx`) | M2A | R2 Survey |
| 7 | Eradicate Hardcoded Styles in Tier 2 Mini-Apps | Refactor 6 medium mini-apps (`image-editor.tsx`, `tasks.tsx`, `password-gen.tsx`, `camera.tsx`, `calculator.tsx`, `bmi.tsx`) including wrapping `image-editor` in `GlassPanel` | M2B | R2 Survey |
| 8 | Eradicate Hardcoded Styles in Tier 3 Mini-Apps & Helpers | Refactor 11 utility mini-apps (`bill-splitter`, `shopping-list`, `voice-memo`, `world-clock`, `video-player`, `dice`, `converter`, `color-tools`, `json-formatter`, `markdown`, `planner`) & 10 `components/mini-apps/` files | M2C | R2 Survey |
| 9 | Unify Core Tab Layouts & Headers | Refactor 8 main navigation tab screens in `app/(tabs)/` to eliminate hand-rolled headers, replace raw `BlurView`s with `GlassPanel`, and replace hardcoded hexes/radii | M3 | R3 Survey |
| 10 | Create `verify_ui.sh` Audit Script | Create executable bash script `verify_ui.sh` to check `app/mini-apps/` and `app/(tabs)/` for hardcoded hex colors and non-standard border radii (0 violations) | M3 | AC1 |
| 11 | Verify Modified File Count & Build Export | Ensure >= 15 files modified across `app/mini-apps/` and `app/(tabs)/`, and verify `npx expo export` completes cleanly with exit code 0 | M3 | AC2, AC3 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Foundational Component & Token Overhaul | Refactor `lib/theme.ts`, `lib/haptics.ts`, `GlassPanel.tsx`, `MiniAppShell.tsx`, `MiniKit.tsx`, `constants/Colors.ts` | none | DONE |
| M2A | Mini-App Style Sweep: Tier 1 Monoliths | Refactor 6 Tier 1 mini-apps (`learn`, `fitness`, `pomodoro`, `expenses`, `habits`, `notes`) | M1 | DONE |
| M2B | Mini-App Style Sweep: Tier 2 Medium Apps | Refactor 6 Tier 2 mini-apps (`image-editor`, `tasks`, `password-gen`, `camera`, `calculator`, `bmi`) | M1 | DONE |
| M2C | Mini-App Style Sweep: Tier 3 Utilities & Helpers | Refactor 11 Tier 3 mini-apps & 10 helper components in `components/mini-apps/` | M1 | PLANNED |
| M3 | Core Layout Unification & UI Audit Infrastructure | Refactor 8 tab screens in `app/(tabs)/`, create `verify_ui.sh`, pass AC1, AC2, AC3 | M1, M2A, M2B, M2C | PLANNED |

---

## Interface Contracts

### 1. Theme & Token Contract (`lib/theme.ts`)
```typescript
const { colors, radius, spacing, glass, font } = useTheme();
// colors: bg, surface, border, text, accent, inputBg, glassFill, glassBorder, glassHighlight, etc.
// radius: sm (6), md (10), lg (14), xl (18), card (14), full (9999)
// spacing: xs (4), sm (8), md (12), lg (16), xl (20), xxl (24), xxxl (32)
// glass: light (18), medium (30), heavy (45), ultra (70)
```

### 2. Haptic Feedback Contract (`lib/haptics.ts`)
```typescript
import { tap } from '@/lib/haptics';
tap('light');    // light tap
tap('medium');   // standard feedback
tap('heavy');    // strong feedback
tap('success');  // success notification
tap('warning');  // warning notification
tap('error');    // error notification
tap('selection');// picker selection
```

### 3. GlassPanel Component Contract (`components/ui/GlassPanel.tsx`)
```typescript
<GlassPanel
  variant="light" | "medium" | "heavy" | "ultra"  // Default: "medium"
  borderRadius={radius.card}                         // Default: useTheme().radius.card
  style={...}
  contentStyle={...}
>
  {children}
</GlassPanel>
```

### 4. MiniAppShell Component Contract (`components/mini-apps/MiniAppShell.tsx`)
```typescript
<MiniAppShell
  title="App Title"
  subtitle="Optional subtitle"
  scrollable={true | false}
  headerRight={<HeaderAction />}
>
  {children}
</MiniAppShell>
```

---

## Code Layout & Write Boundaries

- **M1 (Foundational Components)**:
  - `lib/theme.ts`
  - `lib/haptics.ts`
  - `components/ui/GlassPanel.tsx`
  - `components/mini-apps/MiniAppShell.tsx`
  - `components/mini-apps/MiniKit.tsx`
  - `constants/Colors.ts`

- **M2A (Tier 1 Mini-Apps)**:
  - `app/mini-apps/learn.tsx`
  - `app/mini-apps/fitness.tsx`
  - `app/mini-apps/pomodoro.tsx`
  - `app/mini-apps/expenses.tsx`
  - `app/mini-apps/habits.tsx`
  - `app/mini-apps/notes.tsx`

- **M2B (Tier 2 Mini-Apps)**:
  - `app/mini-apps/image-editor.tsx`
  - `app/mini-apps/tasks.tsx`
  - `app/mini-apps/password-gen.tsx`
  - `app/mini-apps/camera.tsx`
  - `app/mini-apps/calculator.tsx`
  - `app/mini-apps/bmi.tsx`

- **M2C (Tier 3 Mini-Apps & Helpers)**:
  - `app/mini-apps/bill-splitter.tsx`
  - `app/mini-apps/shopping-list.tsx`
  - `app/mini-apps/voice-memo.tsx`
  - `app/mini-apps/world-clock.tsx`
  - `app/mini-apps/video-player.tsx`
  - `app/mini-apps/dice.tsx`
  - `app/mini-apps/converter.tsx`
  - `app/mini-apps/color-tools.tsx`
  - `app/mini-apps/json-formatter.tsx`
  - `app/mini-apps/markdown.tsx`
  - `app/mini-apps/planner.tsx`
  - `components/mini-apps/CompareSheet.tsx`
  - `components/mini-apps/EdgeFeaturePanel.tsx`
  - `components/mini-apps/ExerciseDemo.tsx`
  - `components/mini-apps/FloatingEchoAgent.tsx`
  - `components/mini-apps/FloatingMiniApp.tsx`
  - `components/mini-apps/HabitDetail.tsx`
  - `components/mini-apps/MiniAppIcon.tsx`
  - `components/mini-apps/WorkoutSession.tsx`

- **M3 (Core Tabs & UI Audit Infrastructure)**:
  - `app/(tabs)/_layout.tsx`
  - `app/(tabs)/home.tsx`
  - `app/(tabs)/chat.tsx`
  - `app/(tabs)/apps.tsx`
  - `app/(tabs)/explore.tsx`
  - `app/(tabs)/marketplace.tsx`
  - `app/(tabs)/notifications.tsx`
  - `app/(tabs)/you.tsx`
  - `verify_ui.sh`
  - `package.json`
