# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start dev server (Expo Go / local)
npx expo start

# Native builds (requires prebuild first)
npx expo run:ios
npx expo run:android

# Lint
npm run lint          # runs expo lint (ESLint)

# No test runner is configured — there are no unit/integration tests in this repo.
```

There is no `expo prebuild` output committed. Running `expo run:ios` will trigger it. The app runs in Expo Go without a native build.

## Environment

Copy `env.example` to `.env` at the repo root. Two modes:

- **Offline / local mode** — Leave `EXPO_PUBLIC_SUPABASE_URL` unset or pointing at the placeholder host. `isSupabaseRemote()` returns `false`; all social data comes from the Zustand store + `lib/localFeedSeed.ts`. No backend required.
- **Remote mode** — Set a real Supabase URL + anon key. `isSupabaseRemote()` returns `true`; the app reads/writes to Supabase and the edge function handles AI. Run `backend/db/schema.sql` in Supabase SQL Editor first. Enable Anonymous auth in the Supabase dashboard.

`isSupabaseRemote()` (`lib/remoteConfig.ts`) is the single switch that gates every remote vs. local code path.

## Architecture

### Routing

Expo Router (file-based). The entry point is `app/_layout.tsx`, which:
- Wraps everything in `QueryClientProvider` (TanStack Query)
- Mounts `AuthListener` — a renderless component that wires `supabase.auth.onAuthStateChange` to Zustand and handles deep-link OAuth callbacks (`echo://`)
- Mounts `ToastProvider` and `CommandPalette` as app-wide overlays

Tab screens live under `app/(tabs)/`. All other screens are stack-pushed from the root Stack. Modal screens use `presentation: 'modal'`.

### State management — two parallel layers

**Zustand (`store/useAppStore.ts`)** — the source of truth for everything in offline/local mode: feed items, likes, bookmarks, reposts, comments, follows, DMs, notifications, stories, sessions, settings, and current-user profile. It is a single monolithic store (~640 lines). Every slice writes through `persistSet` (JSON-serialises to an in-memory `Map` — *not* actually persisted across restarts; it's a shim pending MMKV integration via `expo prebuild`).

**TanStack Query (`hooks/queries/`)** — wraps all async data fetching. In remote mode query functions call `lib/supabaseEchoApi.ts`; in local mode they operate on the Zustand state + seed data. The QueryClient is created in `app/_layout.tsx` with `staleTime: 0` and `refetchOnWindowFocus: false`.

The two layers are switched by `isSupabaseRemote()` inside each query hook, not at the routing level.

### Data flow for the social feed

```
useFeed() (hooks/queries/useFeed.ts)
  └─ local:  Zustand publishedEchoes + localFeedSeed → sort/filter → FeedItem[]
  └─ remote: supabaseEchoApi.fetchRemoteFeed()
               ├─ public_echoes table
               ├─ profiles table (join by author_id)
               └─ echo_likes + echo_bookmarks (parallel, uid-gated)
             → mapEchoRowToFeedItem() → FeedItem[]

FeedItem[] → FeedCard (components/social/FeedCard.tsx)
           → HeroCard  (photo/video with media)
           → EchoCard  (video-only, full-screen TikTok-style)
```

`coerceFeedItem` (`lib/localFeedSeed.ts`) normalises local Zustand echoes to the `FeedItem` shape.

### AI chat pipeline

```
User types → ChatInput → handleSend (app/(tabs)/chat.tsx)
  → streamEchoAI (lib/api.ts)        # SSE via react-native-sse
      → POST /functions/v1/echo-ai   # Supabase Edge Function
          → openRouterChat()         # OpenRouter (stream: false — full response, then re-emits deltas)
          → tool loop (requiresConfirm tools pause and emit tool_call_pending)
      → SSE events: conversation | text_delta | tool_call_pending | tool_result | done
  → upsertText / upsertTool          # update local React state (NOT Zustand store)
  → FlashList renders MessageBubble / ToolCallCard
```

The edge function holds conversation history in a Supabase table keyed by `conversation_id`; the client stores only the latest `conversation_id` in AsyncStorage (`echo-ai/last-conversation-id`).

Tool calls that `requiresConfirm: true` pause the stream and surface a confirm/reject card. Approval sends a follow-up SSE request with `confirm: { approve: true }`.

### Theming

`lib/theme.ts` exports `useTheme()` which reads `theme` from Zustand and returns a `ThemeColors` object, font sizes, border radii, and `reduceAnimations`. All components import `useTheme()` rather than hardcoding colours. Nine themes are defined (`midnight`, `amoled`, `ocean`, `sunset`, `forest`, `lavender`, `light`, `sepia`, `arctic`).

`animation(animObj)` from `useTheme()` is a helper that returns `undefined` when `reduceAnimations` is true, skipping Reanimated entering/exiting animations.

### Styling

NativeWind v4 (Tailwind for React Native) + inline `style` props. Both coexist. The `global.css` is the Tailwind base. `tailwind.config.js` extends only content paths. Icon sets: `phosphor-react-native` (primary) and `lucide-react-native`.

### Supabase schema surface

Tables accessed from the client: `public_echoes`, `profiles`, `echo_likes`, `echo_bookmarks`, `echo_comments`, `follows`. The full schema is in `backend/db/schema.sql`. All writes go through `lib/supabaseEchoApi.ts`; never call `supabase` directly from screens.

### Known architectural debts

- **`store/useAppStore.ts` persistence is a no-op** — the in-memory `_map` shim loses all data on reload. Swap for `react-native-mmkv` after `expo prebuild`, or `AsyncStorage` as an interim.
- **`useFeed` query key includes `likeSig`/`bmSig`** — causes a full feed refetch (+ 600ms artificial delay) on every like/bookmark tap. Liked/bookmarked state should be derived over cached data instead.
- **OpenRouter called with `stream: false`** in the edge function — the LLM response is fully buffered before any SSE events are emitted, killing perceived streaming latency.
- **`useAppStore()` without selectors in `FeedCard`** — subscribes to the entire store; any unrelated state write re-renders all visible cards.
- **N+1 Supabase queries** — `fetchRemoteFeed`, `fetchRemoteBookmarkedFeed`, and the followers functions each make 2–3 sequential round-trips that should be collapsed into joins or a Postgres view.
