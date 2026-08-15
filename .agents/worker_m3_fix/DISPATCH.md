## 2026-08-12T21:02:54Z

You are worker_m3_fix, a teamwork_preview_worker completing Milestone M3 (Core Layout Unification & UI Audit Infrastructure) for Echo iOS (/Users/aena/Developer/echo-ios).

Your Working Directory: /Users/aena/Developer/echo-ios/.agents/worker_m3_fix

Read ORIGINAL_REQUEST.md at /Users/aena/Developer/echo-ios/ORIGINAL_REQUEST.md and PROJECT.md at /Users/aena/Developer/echo-ios/.agents/orchestrator_1/PROJECT.md before starting.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:
1. Apply the M3 refactoring changes across all 8 tab screens in `app/(tabs)/`:
   - `app/(tabs)/_layout.tsx`: Replace raw `BlurView` in FloatingTabBar with `<GlassPanel variant="medium" borderRadius={radius.full}>`. Use `@/lib/haptics` `tap('light')`/`tap('medium')`. Replace numeric radii (`borderRadius: 999` -> `radius.full`, `10` -> `radius.md`, `12` -> `radius.lg`).
   - `app/(tabs)/home.tsx`: Replace sticky header `AnimatedBlurView` with `<GlassPanel variant="medium" style={StyleSheet.absoluteFill}>`. Replace hardcoded radii (`20`, `18`, `999`, `17`) with `radius` tokens.
   - `app/(tabs)/chat.tsx`: Replace header `BlurView` with `<GlassPanel variant="medium">`. Replace numeric radii (`28`, `18`, `20`, `999`) with `radius` tokens. Ensure chat send/tool buttons use `@/lib/haptics` `tap()`.
   - `app/(tabs)/apps.tsx`: Replace direct `expo-haptics` imports/calls with `import { tap } from '../../lib/haptics'`. Replace header `AnimatedBlurView` with `GlassPanel`. Replace numeric radii (`999`, `18`, `22`, `16`) with `radius` tokens.
   - `app/(tabs)/explore.tsx`: Replace search header `BlurView` with `GlassPanel`. Replace numeric radii (`999`, `18`, `14`) with `radius` tokens.
   - `app/(tabs)/marketplace.tsx`: Replace hardcoded hex colors with `colors.surface`, `colors.accent`, `colors.border`. Replace numeric radii (`999`, `18`, `14`) with `radius` tokens.
   - `app/(tabs)/notifications.tsx`: Replace sticky header `BlurView` with `GlassPanel`. Replace numeric radii (`99`, `999`) with `radius.full`.
   - `app/(tabs)/you.tsx`: Replace numeric radii (`99`, `full`) with `radius.full` and `radius.card`.

2. Create `/Users/aena/Developer/echo-ios/verify_ui.sh`:
   - An executable bash script (`chmod +x verify_ui.sh`).
   - Audits `app/mini-apps/` and `app/(tabs)/` for hardcoded hex colors (`#[0-9a-fA-F]{3,8}`) and non-token `borderRadius` (`borderRadius:\s*[0-9]+`).
   - Returns exit code 0 when 0 violations are found.

3. Update `/Users/aena/Developer/echo-ios/package.json`:
   - Add `"verify:ui": "bash verify_ui.sh"` under `"scripts"`.

4. Execute verification commands:
   - Run `bash verify_ui.sh` or `npm run verify:ui` and confirm 0 violations returned (exit code 0).
   - Check git status / diff to confirm >= 15 files modified across `app/mini-apps/` and `app/(tabs)/`.
   - Run `npx expo export` and confirm clean exit code 0.

5. Write handoff report to `/Users/aena/Developer/echo-ios/.agents/worker_m3_fix/handoff.md` with command outputs and send completion message to parent.
