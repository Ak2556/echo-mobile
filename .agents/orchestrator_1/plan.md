# Execution Plan

## Objective
Standardize UI/UX across the Echo iOS codebase, fulfilling R1, R2, R3, and Acceptance Criteria.

## Strategy & Workflow
Following the Project Orchestration Pattern:

1. **Step 0: Survey & Codebase Mapping**
   - Dispatch 3 `teamwork_preview_explorer` subagents to investigate:
     - Explorer 1: Foundational UI components, theme tokens, design system definitions (`MiniAppShell`, `GlassPanel`, design tokens, haptics, typography).
     - Explorer 2: Hardcoded styles in `app/mini-apps/` (hex colors, rigid padding, mismatch border radii, existing components).
     - Explorer 3: Core navigation screens in `app/(tabs)/` (`home.tsx`, `chat.tsx`, `apps.tsx`, `explore.tsx`, `notifications.tsx`, etc.), layout structures, and `verify_ui.sh` or build setup.

2. **Step 1: Project Plan & Decomposition (`PROJECT.md`)**
   - Synthesize findings into `PROJECT.md` with:
     - Architecture & Design Token System
     - Feature Inventory
     - Milestones & Dependencies
     - Code Layout & Write Boundaries

3. **Step 2: Milestone Execution Loop (M1, M2, M3)**
   - For each milestone:
     - Explorer(s) -> Strategy recommendation
     - Worker -> Implementation & verification
     - Reviewer(s) -> Code review
     - Challenger(s) -> Testing & empirical verification
     - Forensic Auditor (`teamwork_preview_auditor`) -> Integrity verification
     - Gate evaluation -> PASS / FAIL

4. **Step 3: Verification & Victory Reporting**
   - Verify `verify_ui.sh` / style audit passes (0 hardcoded violations).
   - Verify >= 15 files modified across mini-apps and tabs.
   - Verify `npx expo export` build passes cleanly.
   - Send final victory report to Sentinel (parent).
