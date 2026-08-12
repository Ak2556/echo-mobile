# Original User Request

## 2026-08-12T12:22:43Z

# Teamwork Project Prompt — Draft

> Status: Step 9 — Ready for launch
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

**Project Description:** 
Perform a comprehensive UI/UX standardization pass across the entire Echo iOS codebase (all core navigation tabs and 20+ mini-apps). The goal is to enforce a highly polished, uniform "Silicon-Valley tier" aesthetic characterized by consistent glassmorphism, corner radii, typography, and responsive padding.

Working directory: `/Users/aena/Developer/echo-ios`
Integrity mode: development

## Requirements

### R1. Foundational Component Overhaul
Standardize `MiniAppShell`, `GlassPanel`, and any shared UI wrappers to enforce a strict set of premium design tokens (e.g., consistent border radii, glassmorphism opacities, and unified haptic feedback rules).

### R2. Mini-App Hardcoded Style Eradication (Deep Sweep)
Sweep through all files in `app/mini-apps/` and strip out hardcoded styling variables (like random hex colors, rigid padding, and mismatched border radii). Replace them with the unified theme tokens and the standardized foundational components.

### R3. Core Layout Unification
Update the main navigation screens (`home.tsx`, `chat.tsx`, `apps.tsx`, `explore.tsx`, `notifications.tsx`, etc.) to strictly adhere to the exact same padding, layout constraints, and typography rules established by the foundational components.

## Acceptance Criteria

### Objective Verification
- [ ] A `verify_ui.sh` script or regex pass run against `app/mini-apps/` returns zero instances of rigid hardcoded colors (e.g. `#FFFFFF` instead of `colors.surface`) or mismatched `borderRadius` values that violate the new design system.
- [ ] At least 15 files in `app/mini-apps/` and `app/(tabs)/` have been modified to use the new standardized layouts.
- [ ] `npx expo export` completes without compilation errors, proving the sweeping refactors didn't break React syntax.
