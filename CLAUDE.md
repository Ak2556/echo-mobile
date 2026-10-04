# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Echo is a voice-first social app (Expo / React Native 0.81, SDK 54) shipping to iOS, Android, web and macOS from one codebase, with a Supabase backend.

## Commands

```bash
npm start                  # Expo dev server
npm run ios                # expo run:ios  (triggers prebuild)
npm run android
npm run web

npm run lint               # expo lint (ESLint 9 flat config)
npm run typecheck          # tsc --noEmit
npm test                   # vitest run — both projects
npm run test:watch

# Single file / single case
npx vitest run lib/voice/dispatch.test.ts
npx vitest run -t "name of the test"
npx vitest run --project logic     # or --project ui

npm run audit:backend      # scripts/audit-backend.mjs — calls each RPC for real
npm run i18n:generate      # machine-translate missing strings into lib/i18n/i18nGenerated.ts
npm run mac:dev            # export web bundle + run Electron shell
```

CI (`.github/workflows/ci.yml`) runs `lint`, `typecheck`, `test` on every push and PR to `main`. Match that locally before claiming work is done.

E2E is Maestro (`e2e/*.yaml`, `.github/workflows/maestro-e2e.yml`), not part of `npm test`.

## Hard constraints

- **`ios/` and `android/` are gitignored prebuild output** (Continuous Native Generation). Never edit native files — they are regenerated and your change is lost. Configure native behaviour in `app.json` / `app.config.js` / `plugins/`. `npm audit` findings in native build tooling are build-only, not shipped.
- **Use the Supabase CLI, not the MCP server, for this project's database.** The `claude.ai Supabase` connector resolves to the wrong project. The local `supabase` server in `.mcp.json` is pinned to `eyokhisijabitzjiydmz` and is safe; the CLI (`supabase db`, `supabase migration`, `supabase functions`) is the primary path.
- **Commits carry no AI attribution.** Strip `Co-Authored-By: Claude` and `Claude-Session:` trailers. Body text stays.
- **`ls` is aliased to `eza`.** Never parse its output — use `stat`, `wc`, `find`.
- Supabase Preview branch replay is broken: migrations do not apply from scratch, so the PR migration check fails on every migration PR. Not caused by your change.

## Architecture

### Routing

Expo Router, file-based, `app/`. `app/_layout.tsx` is a large root that composes the whole runtime: `PersistQueryClientProvider` (TanStack Query persisted to MMKV via `lib/queryPersister`), WatermelonDB `DatabaseProvider`, `AuthListenerProvider`, `ShareIntentProvider`, plus app-wide overlays (`ToastProvider`, `CommandPalette`, `FloatingMiniApp`, `VoiceControl`, `NowReadingBar`, `TutorialOverlay`, `ConsentBanner`).

Tabs in `app/(tabs)/`; everything else stack-pushes from the root. Cold-start routing must wait for `useRootNavigationState` before navigating — several past bugs came from routing before the navigator mounted.

### Where code lives

| Path | Holds |
|---|---|
| `app/` | Screens, file-based routing. |
| `components/` | UI, grouped by area: `feed/` (`FeedCard`, `InlineVideo`, …), `chat/`, `voice/` (`VoiceControl`), `ranks/`, `mini-apps/`, `ui/` (shared primitives), `common/`, `ai/`, … |
| `hooks/` | React Query hooks: the feed/ads/ranks ones at the top level, DMs, follows, notifications and profile in `queries/`. |
| `lib/` | Logic grouped by area, one level deep (`ai`, `core`, `database`, `feed`, `i18n`, `media`, `mini-apps`, `privacy`, `retention`, `routing`, `social`, `ui`, …). `supabaseEchoApi.ts` (4.3k lines) is the single gateway to Supabase and stays at the `lib/` root. `lib/ui/theme.ts` is the theme, `lib/i18n/i18n.ts` (~530KB) the string source, `lib/database/` the WatermelonDB schema. Tests sit beside their module; cross-cutting guard tests that read source or migrations live in `test/`. |
| `store/` | Zustand, sliced (`slices/{auth,chat,social,settings,retention}Slice.ts`). |
| `supabase/functions/` | 20 Deno edge functions. |
| `supabase/migrations/` | 155 migrations — the only source of truth for the schema. A legacy Python/FastAPI service lived in `backend/` and was removed on 2026-09-04; nothing referenced it and the edge functions superseded it. Recover from git history if ever needed. |

Imports are relative in `app/`; `@/*` maps to the repo root via tsconfig `paths`.

### State: three layers

1. **Zustand** (`store/useAppStore.ts`) — composed from five slices. Persistence goes through `store/persist.ts`, which prefers MMKV and falls back to AsyncStorage; on the fallback path the store hydrates asynchronously after creation, so early reads can see defaults.
2. **TanStack Query** — all server data, persisted across restarts through `mmkvPersister`.
3. **WatermelonDB** (`lib/database`) — offline-first local DB for messaging, synced via `hooks/useDatabaseSync`.

Writes that must survive offline go through `store/outbox.ts` + `lib/core/outboxProcessor.ts`.

### Supabase access

Screens must never call `supabase` directly — everything goes through `lib/supabaseEchoApi.ts`. RLS is real and enforced; several past security fixes were RPCs trusting a caller-supplied user id, so never accept an identity parameter where `auth.uid()` will do. 152 migrations in `supabase/migrations/`.

### AI + voice pipeline

```
audio (expo-audio) → supabase/functions/voice-command
    → Gemini direct (GEMINI_API_KEY) or OpenRouter fallback
    → { transcript, structured intent, spoken reply } in ONE model call
  → lib/voice/dispatch.ts → 18 in-app actions
```

`lib/voice/localIntent.ts` resolves common intents on-device without a model call — extend it before adding server round-trips. Chat streams SSE from `supabase/functions/echo-ai` via `lib/ai/api.ts`; tools with `requiresConfirm` pause the stream for a confirm card.

**The AI account is free-tier (~20 req/day)** and throttles chat, voice and translate in production. Failures that look like bugs are often quota.

### i18n

26 languages. `lib/i18n/i18n.ts` is the source: `BASE_TRANSLATIONS` (English) plus per-language maps. Fix English copy there directly. `npm run i18n:generate` fills gaps into `lib/i18n/i18nGenerated.ts` (the only generated file, so don't hand-edit that one), and hand-authored strings win at runtime. Many non-English entries are corrupt (truncated, translated from Bengali); a re-translation run is still owed. Layout must handle RTL (Arabic) and the interface itself is localised, not only content.

### Theming

`useTheme()` from `lib/ui/theme` returns colours, font sizes, radii, and an `animation()` helper that returns `undefined` when `reduceAnimations` is on. Never hardcode colours.

## Testing notes

`vitest.config.ts` defines two projects: `logic` (node, `*.test.ts`) and `ui` (jsdom, `*.test.tsx`, `react-native` aliased to `react-native-web`). Native modules that throw at import under node — reanimated, secure-store, crypto, notifications, haptics, blur, linear-gradient — are aliased to hand-written stubs in `test/stubs/`. **A new native dependency imported at module load will break unrelated tests until you add a stub there.**

Tests are colocated (`lib/**/*.test.ts`) plus a suite in `test/`.

## Recurring failure modes in this repo

- **Schema drift** — client types diverging from the actual Postgres schema. Verify against the live schema, not `types/`.
- **Pressables dropping out of layout** — a control renders but is untappable or missing; check ancestor layout before the component itself.
- **Silently dead backend jobs** — crons and RPCs that report healthy while doing nothing (missing Vault secret, missing FK). Verify by querying `net._http_response` and calling each RPC for real; `npm run audit:backend` does this.
- Audit method that works: run the flow against a real probe account rather than trusting local state.

## Current phase

Feature freeze — polish, bug-fix and test only, ahead of store submission. Do not add features unless asked directly.

EAS build quota is limited: batch small changes onto `main` and let them ride the next planned build rather than proposing a rebuild for each fix.
