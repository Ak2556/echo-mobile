## 2026-08-12T10:17:43Z
You are worker_m2c. Your task is to execute Milestone M2C: Tier 3 Utilities & Helper Components Hardcoded Style Eradication.

Workspace Root: /Users/aena/Developer/echo-ios
Metadata Directory: /Users/aena/Developer/echo-ios/.agents/orchestrator_1

Mandatory Documents to read first:
1. /Users/aena/Developer/echo-ios/ORIGINAL_REQUEST.md
2. /Users/aena/Developer/echo-ios/.agents/orchestrator_1/PROJECT.md

Target Files owned exclusively by you for M2C:
11 Utility Mini-Apps in `app/mini-apps/`:
- app/mini-apps/bill-splitter.tsx
- app/mini-apps/shopping-list.tsx
- app/mini-apps/voice-memo.tsx
- app/mini-apps/world-clock.tsx
- app/mini-apps/video-player.tsx
- app/mini-apps/dice.tsx
- app/mini-apps/converter.tsx
- app/mini-apps/color-tools.tsx
- app/mini-apps/json-formatter.tsx
- app/mini-apps/markdown.tsx
- app/mini-apps/planner.tsx

Helper Components in `components/mini-apps/`:
- components/mini-apps/CompareSheet.tsx
- components/mini-apps/EdgeFeaturePanel.tsx
- components/mini-apps/ExerciseDemo.tsx
- components/mini-apps/FloatingEchoAgent.tsx
- components/mini-apps/FloatingMiniApp.tsx
- components/mini-apps/HabitDetail.tsx
- components/mini-apps/MiniAppIcon.tsx
- components/mini-apps/WorkoutSession.tsx
(and any other helper files in `components/mini-apps/`)

Specific Requirements:
1. Across all target files:
   - Replace hardcoded hex colors (`#FFFFFF`, `#000000`, etc.) and raw `rgba(...)` color values with `useTheme().colors` (e.g., `colors.bg`, `colors.surface`, `colors.border`, `colors.text`, `colors.accent`, `colors.inputBg`, `colors.textSecondary`, etc.).
   - Replace numeric `borderRadius` values (e.g. `8`, `12`, `16`, `20`) with `useTheme().radius` tokens (`radius.card`, `radius.sm`, `radius.md`, `radius.lg`, `radius.xl`, `radius.full`).
   - Replace direct `expo-haptics` / `Haptics.*` calls with `@/lib/haptics` `tap()` calls (`tap('light')`, `tap('medium')`, `tap('heavy')`, `tap('success')`, etc.).
   - Ensure consistent glassmorphism formatting (`GlassPanel`, `MiniAppShell`).
2. Build & Test Verification:
   - Run build export verification (`npx expo export`) to ensure no compilation/type errors exist in your target files.
3. Record findings in handoff report at `/Users/aena/Developer/echo-ios/.agents/worker_m2c_1/handoff.md` and send a completion message to the orchestrator.
