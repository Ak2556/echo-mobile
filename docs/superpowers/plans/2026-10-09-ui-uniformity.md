# UI Uniformity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Echo's screens look and behave like one product: one tab top, one button, one sheet, one dialog, one loading and empty state, and a voice bubble that never sits on content.

**Architecture:** Each stage adds one shared component (or fixes one root cause), migrates callers to it by a deterministic rule, and ends with a guard test so the drift cannot return. Stage 0 first records the current drift as ratchet baselines, so every later stage can only move the numbers down. One branch and one draft PR per stage; the owner merges and OTAs each.

**Tech Stack:** Expo SDK 54 / React Native 0.81, expo-router, `useTheme()` tokens (`lib/ui/theme.ts`), phosphor-react-native, vitest (`logic` project = node `*.test.ts`, `ui` project = jsdom `*.test.tsx`).

**Spec:** The audit in this conversation (2026-10-09, "what else is not uniform in the ui"). Measured on `main` @ `18cc54a`.

## Global Constraints

- **Feature freeze (as of 2026-07-27):** polish, bug-fix and test only. No new features, no removed features.
- **OTA only.** No native edits (`ios/`, `android/` are gitignored prebuild output). No new native dependency. Fingerprints must stay iOS `e0c9344ef1af`, Android `df84f9ad571f` (check with `npx expo-updates fingerprint:generate --platform <p>` before every OTA).
- **Never hardcode colours.** Use `useTheme()`; fixed colours live in `lib/ui/fixedColors.ts`. `test/noHardcodedColours.test.ts` covers `app/` only, so Stage 3 extends it to `components/`.
- **Performance first (owner 2026-10-01):** frame time beats every visual effect. No new live blur over scrolling content.
- **Screens never call `supabase` directly.** Not touched by this plan.
- **Commits carry no AI attribution.** No `Co-Authored-By` or `Claude-Session` trailers.
- **Before claiming a stage done:** `npm run typecheck`, `npx vitest run`, `npx eslint <touched files>` show no new errors or warnings (compare the warning count against `main`).
- **`ls` is aliased to `eza`:** never parse its output. Use `find`, `stat`, `wc`. zsh does not word-split unquoted variables; never write `set -- $x`.
- **Verification per stage (after the owner merges and OTAs):** Android emulator `emulator-5554`; relaunch the app 2-3 times until logcat shows `isUpdatePending=false`; screenshot with `adb exec-out screencap -p`. Check in the light theme and one dark theme, at font scale 1.3, and the Arabic locale for anything with a header. Emulator frame times are not evidence about Echo.
- **Exceptions that stay as they are** (do not "fix"): the You tab has no title (it is a profile page); Reverb (`/watch`) is full-bleed video with its own chrome; auth, onboarding, remix, evolution and thinking-partners stay dark by design (see `DARK` in `lib/ui/fixedColors.ts`).

## Stage order and why

| # | Stage | What the user sees | Risk |
|---|---|---|---|
| 0 | Ratchets | nothing | none |
| 1 | Loading ring bug | the ring over "Welcome back," disappears | low |
| 2 | Tab tops | five tabs share margins, title style, search field | medium |
| 3 | One Button | every save/post/submit button is the same size and shape | medium (many files) |
| 4 | One sheet, one dialog | confirmations look like the app, not the OS | medium |
| 5 | Loading and empty states | one spinner, one empty layout | low |
| 6 | Voice bubble | the bubble stops covering content | needs an owner decision |
| 7 | Token sweeps | almost nothing visible | low, large diff; after launch |

Do 0, 1, 2 first (visible, small). 3 and 4 are the largest visible wins. 7 is deliberately last: 1,258 raw font sizes and 347 raw radii change almost nothing on screen.

## File Structure

| Path | Responsibility |
|---|---|
| `test/uiRatchet.test.ts` (new) | Counts drift in source and fails if any count rises above its recorded ceiling. |
| `hooks/useUserRefresh.ts` (new) | Pull-to-refresh state that is true only while the *user* is refreshing. |
| `components/ui/TabHeader.tsx` (new) | The row at the top of a tab: left slot, title, subtitle, right slot, on `layout.gutter`. |
| `components/ui/SearchField.tsx` (new) | The one search input (pill, 48 pt). |
| `components/ui/Button.tsx` (revive) | The one text button: primary, secondary, ghost, danger; sizes; loading. Currently has zero callers and a hard-coded `'#fff'`. |
| `components/common/BottomSheet.tsx` (new) | Modal shell: backdrop, slide-up, safe-area, grabber, optional title. |
| `components/common/ConfirmSheet.tsx` + `hooks/useConfirm.tsx` (new) | Themed replacement for destructive `Alert.alert`. |
| `components/common/LoadingState.tsx` (new) | One centred spinner. |
| `lib/ui/floatingBubblePlacement.ts` (modify) | Where the voice bubble rests, and when it fades. |

---

## Stage 0: Ratchets

### Task 0: Record the drift so it can only fall

**Files:**
- Create: `test/uiRatchet.test.ts`

**Interfaces:**
- Produces: `CEILINGS` (the numbers later stages lower). Each later stage edits one number in this file as part of its PR.

- [ ] **Step 1: Write the test with today's counts as ceilings**

```ts
/**
 * Drift ratchets. Each count is a ceiling taken from `main` @ 18cc54a. A stage that
 * removes drift lowers its ceiling in the same PR; nothing may raise one.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (p.endsWith('.tsx')) yield p;
  }
}

function count(re: RegExp, dirs = ['app']): number {
  let n = 0;
  for (const d of dirs) for (const f of sources(join(ROOT, d))) n += (readFileSync(f, 'utf8').match(re) ?? []).length;
  return n;
}

const CEILINGS = {
  rawRadius: 347,        // borderRadius: <number>
  rawFontSize: 1258,     // fontSize: <number>
  alertAlert: 105,       // Alert.alert(
  hand_activityIndicatorScreens: 40, // files; lowered by Stage 5
  moduleHexInComponents: 0,          // set to the measured value in Step 2
};

describe('UI drift ratchets', () => {
  it('raw borderRadius numbers', () => expect(count(/borderRadius: \d+/g)).toBeLessThanOrEqual(CEILINGS.rawRadius));
  it('raw fontSize numbers', () => expect(count(/fontSize: [\d.]+/g)).toBeLessThanOrEqual(CEILINGS.rawFontSize));
  it('Alert.alert calls', () => expect(count(/Alert\.alert\(/g, ['app', 'components'])).toBeLessThanOrEqual(CEILINGS.alertAlert));
});
```

- [ ] **Step 2: Measure and set the ceilings exactly**

Run: `npx vitest run test/uiRatchet.test.ts`
If a count is below its ceiling, set the ceiling to the measured number (read it from the failing assertion by temporarily using `toBe(0)`). Delete `hand_activityIndicatorScreens` and `moduleHexInComponents` from `CEILINGS` unless a stage later adds a test using them.
Expected: PASS with ceilings equal to measured values.

- [ ] **Step 3: Commit**

```bash
git checkout -b polish/ui-ratchets main
git add test/uiRatchet.test.ts
git commit -m "Tests: ratchet the UI drift counts so they can only fall"
```

---

## Stage 1: The stray loading ring

**Root cause (verified by reading, not yet by a failing test):** `app/(tabs)/home.tsx:780-785` and `app/(tabs)/explore.tsx:223-229` bind `<RefreshControl refreshing={isRefetching}>` to React Query's `isRefetching`. That is true on *every* background refetch (app foreground, query invalidation, an OTA relaunch), not only when the user pulls. On Android the control then draws its ring; on Home `progressViewOffset={headerHeight}` puts it exactly over "Welcome back,". Every screen with the same binding has the same bug.

### Task 1: `useUserRefresh` and its guard

**Files:**
- Create: `hooks/useUserRefresh.ts`
- Create: `hooks/useUserRefresh.test.tsx`
- Modify: every file found by `grep -rn "refreshing={" app components | grep -v "userRefreshing\|refreshing={refreshing}"` (known: `app/(tabs)/home.tsx`, `app/(tabs)/explore.tsx`)
- Create: `test/refreshControlBinding.test.ts`

**Interfaces:**
- Produces: `useUserRefresh(refetch: () => Promise<unknown>): { refreshing: boolean; onRefresh: () => void }`

- [ ] **Step 1: Write the failing hook test**

```tsx
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUserRefresh } from './useUserRefresh';

describe('useUserRefresh', () => {
  it('is false until the user pulls', () => {
    const { result } = renderHook(() => useUserRefresh(() => Promise.resolve()));
    expect(result.current.refreshing).toBe(false);
  });

  it('is true only while the pulled refetch is in flight', async () => {
    let release!: () => void;
    const refetch = () => new Promise<void>(r => { release = r; });
    const { result } = renderHook(() => useUserRefresh(refetch));
    act(() => { result.current.onRefresh(); });
    expect(result.current.refreshing).toBe(true);
    await act(async () => { release(); });
    expect(result.current.refreshing).toBe(false);
  });

  it('clears even when the refetch rejects', async () => {
    const { result } = renderHook(() => useUserRefresh(() => Promise.reject(new Error('x'))));
    await act(async () => { result.current.onRefresh(); });
    expect(result.current.refreshing).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run hooks/useUserRefresh.test.tsx`
Expected: FAIL, "Failed to resolve import './useUserRefresh'".

- [ ] **Step 3: Implement**

```ts
import { useCallback, useState } from 'react';

/**
 * Pull-to-refresh state that belongs to the *user*. `isRefetching` from React Query is
 * true on every background refetch, so binding it to <RefreshControl refreshing> draws the
 * ring whenever the app refetches on its own (foreground, invalidation, OTA relaunch).
 */
export function useUserRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.resolve()
      .then(refetch)
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [refetch]);
  return { refreshing, onRefresh };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run hooks/useUserRefresh.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing guard test**

```ts
// test/refreshControlBinding.test.ts
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
function* files(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith('.tsx')) yield p;
  }
}

describe('RefreshControl', () => {
  it('is never bound to a query\'s isRefetching / isFetching', () => {
    const offenders: string[] = [];
    for (const d of ['app', 'components']) for (const f of files(join(ROOT, d))) {
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (/refreshing=\{\s*(is(Re)?[Ff]etching\w*|\w*\.isRefetching|\w*\.isFetching)\s*\}/.test(l)) offenders.push(`${relative(ROOT, f)}:${i + 1}`);
      });
    }
    expect(offenders, 'use useUserRefresh(refetch)').toEqual([]);
  });
});
```

Run: `npx vitest run test/refreshControlBinding.test.ts`
Expected: FAIL listing `app/(tabs)/home.tsx` and `app/(tabs)/explore.tsx` (and any other hit).

- [ ] **Step 6: Fix each offender** (shown for Home; Explore is the same shape)

In `app/(tabs)/home.tsx` add `import { useUserRefresh } from '../../hooks/useUserRefresh';`, then next to the query hook:

```tsx
const { refreshing: pulling, onRefresh: onPull } = useUserRefresh(refetch);
```

and replace the control with:

```tsx
<RefreshControl
  refreshing={pulling}
  onRefresh={onPull}
  tintColor={colors.accent}
  progressViewOffset={headerHeight}
/>
```

Explore: `useUserRefresh(refetchFeed)`; `refreshing={pulling} onRefresh={onPull}`; keep `colors={[colors.accent]}`.

- [ ] **Step 7: Run the guard and the suite**

Run: `npx vitest run && npm run typecheck`
Expected: all PASS.

- [ ] **Step 8: Commit and open the draft PR**

```bash
git checkout -b polish/refresh-ring main
git add hooks/useUserRefresh.ts hooks/useUserRefresh.test.tsx test/refreshControlBinding.test.ts "app/(tabs)/home.tsx" "app/(tabs)/explore.tsx"
git commit -m "Refresh: the ring shows only when the user pulls"
```

Emulator check after OTA: cold-launch Home five times; the ring never appears over the title. Pull down once; the ring appears and clears.

---

## Stage 2: Tab tops

**Facts:** Home and Chat sit on `layout.gutter` (16 pt phone). Tools (`app/(tabs)/apps.tsx:25`) uses `const PAD = 20`. Explore's title is `fontSize: layout.isPhone ? 34 : 40` (explore.tsx:322); Tools' is the same numbers but with a subtitle and the label "Echo Tools" while the tab says "Tools". Explore's search is a full pill; Tools' is `borderRadius: 16` at a different height (apps.tsx:327).

### Task 2: `TabHeader` and `SearchField`

**Files:**
- Create: `components/ui/TabHeader.tsx`, `components/ui/SearchField.tsx`
- Create: `components/ui/TabHeader.test.tsx`
- Modify: `app/(tabs)/explore.tsx` (title block ~lines 318-340, search field below it), `app/(tabs)/apps.tsx` (lines 25, 481-490 and its search at ~327)

**Interfaces:**
- Produces:
  - `TabHeader({ title?: string; subtitle?: string; left?: ReactNode; right?: ReactNode })`: renders on `layout.gutter`, title in `font.displayBlack` at `layout.isPhone ? 34 : 40` with `letterSpacing: -0.5`.
  - `SearchField({ value, onChangeText, placeholder, onFocus?, onClear? })`: 48 pt tall, `radius.full`, `colors.inputBg`, magnifier at 20.
- Consumes: `useTheme()`, `useResponsiveLayout()` (`lib/ui/responsive`), `HeaderActionButton`, `HeaderAddButton`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../../lib/ui/theme', () => ({
  useTheme: () => ({ colors: { text: '#111', textMuted: '#777' }, font: { displayBlack: {} } }),
}));
vi.mock('../../lib/ui/responsive', () => ({
  useResponsiveLayout: () => ({ gutter: 16, isPhone: true, wideContentStyle: {} }),
}));

import { TabHeader } from './TabHeader';

describe('TabHeader', () => {
  it('shows the title and subtitle', () => {
    const { getByText } = render(<TabHeader title="Tools" subtitle="12 connected essentials" />);
    expect(getByText('Tools')).toBeTruthy();
    expect(getByText('12 connected essentials')).toBeTruthy();
  });
  it('renders both slots', () => {
    const { getByText } = render(<TabHeader left={<span>L</span>} right={<span>R</span>} />);
    expect(getByText('L')).toBeTruthy();
    expect(getByText('R')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run components/ui/TabHeader.test.tsx` — Expected: FAIL (import).

- [ ] **Step 3: Implement `TabHeader`**

```tsx
import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../lib/ui/theme';
import { useResponsiveLayout } from '../../lib/ui/responsive';

interface TabHeaderProps {
  title?: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}

/** The row at the top of every tab: same gutter, same title, actions at the right edge. */
export function TabHeader({ title, subtitle, left, right }: TabHeaderProps) {
  const { colors, font } = useTheme();
  const layout = useResponsiveLayout();
  return (
    <View style={[layout.wideContentStyle, { paddingHorizontal: layout.gutter }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {left}
          {title ? (
            <Text
              numberOfLines={1}
              style={[font.displayBlack, { color: colors.text, fontSize: layout.isPhone ? 34 : 40, letterSpacing: -0.5 }]}
            >
              {title}
            </Text>
          ) : null}
        </View>
        {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{right}</View> : null}
      </View>
      {subtitle ? <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 2 }}>{subtitle}</Text> : null}
    </View>
  );
}
```

- [ ] **Step 4: Implement `SearchField`**

```tsx
import React from 'react';
import { TextInput, View, Pressable } from 'react-native';
import { MagnifyingGlass, X } from 'phosphor-react-native';
import { useTheme } from '../../lib/ui/theme';
import { ttx } from '../../lib/i18n/i18n';

interface SearchFieldProps {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  onFocus?: () => void;
  onClear?: () => void;
}

export function SearchField({ value, onChangeText, placeholder, onFocus, onClear }: SearchFieldProps) {
  const { colors, radius, fontSizes } = useTheme();
  return (
    <View
      style={{
        height: 48, borderRadius: radius.full, backgroundColor: colors.inputBg,
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10,
      }}
    >
      <MagnifyingGlass color={colors.textMuted} size={20} weight="bold" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        accessibilityLabel={placeholder}
        style={{ flex: 1, color: colors.text, fontSize: fontSizes.body, paddingVertical: 0 }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => { onChangeText(''); onClear?.(); }} accessibilityRole="button" accessibilityLabel={ttx('Clear search')} hitSlop={10}>
          <X color={colors.textMuted} size={18} weight="bold" />
        </Pressable>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 5: Run the component test**

Run: `npx vitest run components/ui/TabHeader.test.tsx` — Expected: PASS.

- [ ] **Step 6: Migrate Explore and Tools**

- Explore: replace the title `<Text>` block with `<TabHeader title={ttx('Explore')} />` and its search input with `<SearchField …>` keeping the existing state setters. Keep the `EdgeGlass` wrapper and `headerHeight` arithmetic unchanged.
- Tools (`apps.tsx`): delete `const PAD = 20` and use `layout.gutter` everywhere `PAD` was used; replace the title with `<TabHeader title={ttx('Tools')} subtitle={...existing "N connected essentials" string...} />` (the tab label and the title now match); replace its search bar with `SearchField`.
- Home and Chat: wrap their existing left/right content in `TabHeader` (`left` = wordmark / segmented control, `right` = the existing buttons). Do not change their behaviour.

- [ ] **Step 7: Guard test** (`test/tabTops.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('tab tops', () => {
  it.each(['home', 'explore', 'chat', 'apps'])('%s uses TabHeader', (n) => {
    expect(read(`app/(tabs)/${n}.tsx`)).toContain('<TabHeader');
  });
  it('Tools no longer has its own gutter', () => {
    expect(read('app/(tabs)/apps.tsx')).not.toMatch(/const PAD = \d+/);
  });
  it('Explore and Tools share SearchField', () => {
    expect(read('app/(tabs)/explore.tsx')).toContain('<SearchField');
    expect(read('app/(tabs)/apps.tsx')).toContain('<SearchField');
  });
});
```

- [ ] **Step 8: Verify and commit**

Run: `npm run typecheck && npx vitest run && npx eslint "app/(tabs)" components/ui/TabHeader.tsx components/ui/SearchField.tsx`
Commit: `git checkout -b polish/tab-tops main && git add -A && git commit -m "Tabs: one top (gutter, title, search) on Home, Explore, Chat and Tools"`
Emulator check: screenshot all five tabs; left edge of every title/wordmark at the same x; search fields identical height and radius; Arabic locale mirrors correctly; font scale 1.3 does not clip the title (it is `numberOfLines={1}`).

---

## Stage 3: One Button

**Facts:** `components/ui/Button.tsx` exists with `variant` primary/secondary/ghost and `size` compact/regular but has **zero callers**, uses `'#fff'` (components/ is outside the hex test), and renders `secondary` through `GlassPanel` (live blur) on iOS. 69 hand-rolled accent-fill sites exist in 31 files; some are chips (selected state), not buttons. Only the full CTAs migrate (save, post, submit, create, approve, report, sign in).

### Task 3: Make `Button` the one button

**Files:**
- Modify: `components/ui/Button.tsx`
- Create: `components/ui/Button.test.tsx`
- Modify: `test/noHardcodedColours.test.ts` (scan `components/` too, with `ReflectiveNavIcon` etc. exempt only if they genuinely need it)

**Interfaces:**
- Produces: `Button({ label, onPress, variant?: 'primary'|'secondary'|'ghost'|'danger', size?: 'compact'|'regular'|'large', loading?: boolean, disabled?: boolean, fullWidth?: boolean, leftIcon?, rightIcon?, accessibilityLabel? })`. Heights: compact 36, regular 48, large 56. Radius `radius.full`. Primary text `colors.onAccent`; danger text `ON_STATUS` on `colors.danger`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

vi.mock('../../lib/ui/theme', () => ({
  useTheme: () => ({
    colors: { accent: '#7A8B4E', onAccent: '#FFFFFF', surface: '#F4F4F5', text: '#111', textSecondary: '#555', danger: '#DC2626', border: '#ddd', glassBorder: '#ddd' },
    radius: { full: 999, lg: 16 }, reduceAnimations: true, font: { bodyBold: {} },
  }),
}));

import { Button } from './Button';

describe('Button', () => {
  it('calls onPress', () => {
    const onPress = vi.fn();
    const { getByRole } = render(<Button label="Save" onPress={onPress} />);
    fireEvent.click(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('does not call onPress while loading or disabled', () => {
    const onPress = vi.fn();
    const a = render(<Button label="Save" onPress={onPress} loading />);
    fireEvent.click(a.getByRole('button'));
    const b = render(<Button label="Save" onPress={onPress} disabled />);
    fireEvent.click(b.getAllByRole('button')[1]);
    expect(onPress).not.toHaveBeenCalled();
  });
  it('names itself to a screen reader', () => {
    const { getByLabelText } = render(<Button label="Save" onPress={() => {}} />);
    expect(getByLabelText('Save')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run components/ui/Button.test.tsx` — Expected: FAIL on `loading` handling and the label.

- [ ] **Step 3: Rewrite `Button.tsx`** with a single code path (no `GlassPanel`, no iOS-only branch), the sizes and variants above, `ActivityIndicator` when `loading`, `accessibilityRole="button"`, `accessibilityState={{ disabled: disabled || loading, busy: loading }}`, `accessibilityLabel={accessibilityLabel ?? label}`, `opacity: disabled ? 0.55 : 1`, and `onPress={disabled || loading ? undefined : onPress}`. Keep `AnimatedPressable` for press feedback but put every box property on an inner `View` (the repo's pressable-layout rule).

- [ ] **Step 4: Run the test** — Expected: PASS.

- [ ] **Step 5: Commit** — `git checkout -b polish/button main && git add components/ui/Button.tsx components/ui/Button.test.tsx && git commit -m "Button: one text button, themed, no live blur"`

### Task 4: Migrate the CTAs, in batches of about eight files

Migration rule (apply mechanically, then read each diff): a site migrates when it is a `Pressable`/`AnimatedPressable` with `backgroundColor: colors.accent` (or `colors.danger`), a text label, a `minHeight`/`paddingVertical`, and an `onPress` that submits or navigates. It does **not** migrate when it is a selected-state chip, a tab, a swatch, an icon-only button (those use `IconButton`, `HeaderActionButton`, `HeaderAddButton`), or a row.

Find candidates:

```bash
python3 - <<'EOF'
import re,glob
for f in sorted(glob.glob('app/**/*.tsx',recursive=True)):
    L=open(f).read().split('\n')
    for i,l in enumerate(L):
        if re.search(r"backgroundColor: [^,}]*colors\.(accent|danger)",l) and 'Muted' not in l:
            w='\n'.join(L[i:i+10])
            if 'onAccent' in w or 'ON_STATUS' in w: print(f"{f}:{i+1}")
EOF
```

Batches (order = most user-visible first):
1. `app/auth/login.tsx`, `app/onboarding.tsx` (replace its private `PrimaryButton`), `app/welcome.tsx`, `app/appeal.tsx`, `app/report.tsx`, `app/get-verified.tsx`, `app/edit-profile.tsx`, `app/persona.tsx`
2. `app/create-post.tsx`, `app/edit-post.tsx`, `app/share.tsx`, `app/create-story.tsx`, `app/create-listing.tsx`, `app/create-salon.tsx`, `app/create-office-hour.tsx`, `app/daily-question.tsx`
3. `app/messages/index.tsx`, `app/messages/[id].tsx`, `app/office-hours.tsx`, `app/office-hours/[id].tsx`, `app/salons.tsx`, `app/follow-requests.tsx`, `app/mod-appeals.tsx`, `app/bookmarks.tsx`

Each batch is one branch, one PR, and ends with the same two steps:

- [ ] **Step 1:** replace each site with, for example, `<Button label={ttx('Save')} onPress={save} loading={saving} disabled={!canSave} size="large" fullWidth />`, deleting the now-unused style code and imports.
- [ ] **Step 2:** run `npm run typecheck && npx vitest run && npx eslint <batch files>`; no new warnings versus `main`; commit `Buttons: batch N use the shared Button`.

After batch 3, add the guard and lower the ratchet:

```ts
// test/buttons.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
describe('Button', () => {
  it('the shared Button is used by the form screens', () => {
    for (const f of ['app/auth/login.tsx', 'app/onboarding.tsx', 'app/create-post.tsx', 'app/report.tsx']) {
      expect(readFileSync(resolve(__dirname, '..', f), 'utf8'), f).toContain('<Button');
    }
  });
  it('onboarding no longer draws its own PrimaryButton', () => {
    expect(readFileSync(resolve(__dirname, '../app/onboarding.tsx'), 'utf8')).not.toContain('function PrimaryButton');
  });
});
```

Emulator check per batch: open each screen; the CTA is 48 or 56 pt tall, pill-shaped, `onAccent` text, shows a spinner while saving.

---

## Stage 4: One sheet, one dialog

**Facts:** `ActionSheet` (components/common/ActionSheet.tsx) is a `Modal` + `FadeIn` backdrop + `SlideInDown`. `ModelPickerSheet`, `EditMessageModal`, `CommentsSheet`, and the Tasks, Shopping List and Habits add-sheets each rebuild the same shell. There are 105 `Alert.alert` calls: about 25 destructive confirmations, about 14 "Permission needed" hand-offs to OS Settings, the rest errors and notices.

### Task 5: `BottomSheet`, then rebuild `ActionSheet` on it

**Files:**
- Create: `components/common/BottomSheet.tsx`, `components/common/BottomSheet.test.tsx`
- Modify: `components/common/ActionSheet.tsx`

**Interfaces:**
- Produces: `BottomSheet({ visible, onClose, title?, children, keyboardAvoiding?: boolean })`: `Modal`, 55% black backdrop (tap closes), `SlideInDown.duration(220)`, `colors.surface` card with top radius `radius.xl`, grabber, bottom padding `insets.bottom + 16`, `useTheme().reduceAnimations` respected, `onRequestClose={onClose}`.

- [ ] **Step 1: Write the failing test** — renders children when `visible`, renders nothing when not, calls `onClose` on backdrop press (mock `react-native-safe-area-context` to `{ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }` and the theme like the Button test).
- [ ] **Step 2: Run to see it fail** — `npx vitest run components/common/BottomSheet.test.tsx`.
- [ ] **Step 3: Implement** by lifting the backdrop and the sheet container out of `ActionSheet.tsx` (lines 36-80) unchanged in look, parameterised by `children`.
- [ ] **Step 4: Make `ActionSheet` render its action list inside `BottomSheet`.** Visual output must not change; compare a before and after screenshot of the Chat "Echo actions" sheet.
- [ ] **Step 5:** `npx vitest run && npm run typecheck`; commit `Sheets: one BottomSheet shell; ActionSheet is built on it`.

### Task 6: Migrate the hand-built sheets

Rule: any `SlideInDown` bottom sheet that is a card at the bottom of the screen with a title and a form becomes `<BottomSheet>` with its existing body as `children`. Files: `app/mini-apps/tasks.tsx` (add sheet), `app/mini-apps/shopping-list.tsx` (add item), `app/mini-apps/habits.tsx` (`AddHabitModal`), `app/daily-question.tsx`, `components/ai/EditMessageModal.tsx`. Leave `CommentsSheet`, `ModelPickerSheet` and the media viewers alone (gesture-driven or full-screen; exceptions listed under Global Constraints). Add `test/sheets.test.ts` asserting those five files import `BottomSheet` and no longer contain `SlideInDown`.

### Task 7: `ConfirmSheet` / `useConfirm`, then replace destructive alerts

**Files:**
- Create: `components/common/ConfirmSheet.tsx`, `hooks/useConfirm.tsx`, `hooks/useConfirm.test.tsx`
- Modify: the files returned by `grep -rln "style: 'destructive'" app components`

**Interfaces:**
- Produces: `useConfirm(): { confirm(opts: { title: string; message?: string; confirmLabel: string; destructive?: boolean }): Promise<boolean>; confirmElement: ReactNode }`. The caller renders `{confirmElement}` once.

- [ ] **Step 1: Write the failing hook test** — `confirm()` resolves `true` when the confirm action is pressed, `false` when cancelled or the backdrop is tapped; two simultaneous calls resolve the first as `false`.
- [ ] **Step 2: Run to see it fail.**
- [ ] **Step 3: Implement** `ConfirmSheet` as `ActionSheet` with one destructive action and Cancel; `useConfirm` holds `{ opts, resolve }` in state, resolves the previous pending promise with `false` before opening a new one.
- [ ] **Step 4: Migrate** each `Alert.alert(title, message, [{ text: 'Cancel' }, { text, style: 'destructive', onPress }])` to `if (await confirm({ title, message, confirmLabel: text, destructive: true })) onPress();` and render `{confirmElement}`.
- [ ] **Step 5: Keep as `Alert.alert`:** "Permission needed" (OS Settings hand-off) and anything with more than two choices. **Convert to `showToast`:** single-button error notices ("Could not save", "Upload failed").
- [ ] **Step 6:** lower `alertAlert` in `test/uiRatchet.test.ts` to the new count; add to `test/dialogs.test.ts` a check that no `Alert.alert` call contains `style: 'destructive'`.
- [ ] **Step 7:** typecheck, vitest, commit `Dialogs: destructive confirmations use the app's own sheet`.

Emulator check: delete a note, block a user, delete account (cancel at the final step): the sheet matches the theme in light and dark; the Android back button dismisses it as a cancel.

---

## Stage 5: Loading and empty states

**Files:**
- Create: `components/common/LoadingState.tsx`
- Modify: the 40 files with `ActivityIndicator`; only the *full-area centred* ones change (inline button spinners stay, and `Button` owns those now)
- Modify: hand-rolled empties in `app/salons.tsx`, `app/office-hours.tsx`, `app/mini-apps/shopping-list.tsx` ("List is empty")

**Interfaces:**
- Produces: `LoadingState({ label?: string })`: `flex: 1`, centred `ActivityIndicator color={colors.accent}`, `accessibilityLabel={label ?? ttx('Loading')}`.

- [ ] **Step 1:** write `LoadingState` and a one-assertion render test.
- [ ] **Step 2:** find centred spinners: `grep -rn -B3 "<ActivityIndicator" app | grep "justifyContent: 'center'"`. Replace each `<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator …/></View>` with `<LoadingState />`. Where a list screen already has a skeleton (`UserRowSkeleton`, `FeedCardSkeleton`, `ListingCardSkeleton`), use the skeleton instead.
- [ ] **Step 3:** replace the three hand-rolled empties with `EmptyState({ icon, title, subtitle, actionLabel, onAction })`; the Salons "Start a salon" button becomes its `actionLabel`.
- [ ] **Step 4:** guard `test/loadingStates.test.ts`: `grep`-style assertion that Salons, Office Hours and Shopping List import `EmptyState`.
- [ ] **Step 5:** typecheck, vitest, commit `Loading and empty: one spinner, one empty layout`.

---

## Stage 6: The voice bubble (needs the owner's decision)

**Facts:** the bubble is 54 pt, rests bottom-right above the tab bar on tab screens and at 36% screen height elsewhere, and still covers content on Explore, Tools, You and Habits (screenshots 2026-10-09). It is the only voice trigger (long-press), so it cannot be removed.

**Options:** (a) shrink to 44 pt, rest at 55% opacity, fade to 20% while the screen scrolls and while the keyboard is open (recommended: no relocation, nothing extra to learn); (b) dock to the screen edge as a half-hidden tab that slides out on touch; (c) move voice into the tab bar's centre. (c) is a navigation change and breaks "five tabs".

### Task 8 (after the owner picks (a)): fade and shrink

**Files:** Modify `lib/ui/floatingBubblePlacement.ts`, `components/mini-apps/FloatingMiniApp.tsx`; Test `lib/ui/floatingBubblePlacement.test.ts`.

**Interfaces:**
- Produces: `bubbleOpacity(state: { scrolling: boolean; keyboardOpen: boolean; dragging: boolean }): number` returning `1` while dragging, `0.2` while scrolling or the keyboard is open, otherwise `0.55`; `BUBBLE_SIZE = 44`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { BUBBLE_SIZE, bubbleOpacity } from './floatingBubblePlacement';

describe('bubbleOpacity', () => {
  it('is full only while the user is dragging it', () => {
    expect(bubbleOpacity({ scrolling: false, keyboardOpen: false, dragging: true })).toBe(1);
  });
  it('recedes while scrolling or typing', () => {
    expect(bubbleOpacity({ scrolling: true, keyboardOpen: false, dragging: false })).toBe(0.2);
    expect(bubbleOpacity({ scrolling: false, keyboardOpen: true, dragging: false })).toBe(0.2);
  });
  it('rests at 0.55', () => {
    expect(bubbleOpacity({ scrolling: false, keyboardOpen: false, dragging: false })).toBe(0.55);
  });
  it('is 44 pt', () => expect(BUBBLE_SIZE).toBe(44));
});
```

- [ ] **Step 2:** run, see it fail. **Step 3:** implement `bubbleOpacity`, set `BUBBLE_SIZE = 44`, and drive the bubble's opacity from it with `withTiming(…, { duration: 160 })` (reanimated shared value; no re-render per frame). Scroll state comes from a tiny store `useScrollActivity` set by the screens' existing `onScroll`/`onScrollBeginDrag`/`onMomentumScrollEnd` (`voiceList` already receives these callbacks in several screens; reuse that hook rather than adding a listener per screen).
- [ ] **Step 4:** the existing placement tests that mention `BUBBLE_SIZE` keep passing (they derive from the constant). Commit `Voice bubble: smaller, and it steps back while you scroll or type`.

Emulator check: scroll Explore; the bubble fades to 20% and returns after 300 ms idle; the long-press still starts voice.

---

## Stage 7: Token sweeps (after launch)

One PR per sweep. Each uses a codemod script kept in the scratchpad (not committed), review of the diff, and lowers its ratchet in `test/uiRatchet.test.ts`.

| Sweep | Rule | Ceiling to lower |
|---|---|---|
| Radius | `borderRadius: 999` and `99` become `radius.full`; `8/12/14/16/20/24` map to the nearest of `radius.sm/md/lg/card/xl` (print the mapping from `lib/ui/theme.ts` first) | `rawRadius` 347 |
| Font size | `fontSize: 11-12.5` becomes `fontSizes.caption`, `13-14` `fontSizes.small`, `15-16` `fontSizes.body`; half-sizes round to the nearest token; leave display sizes (>=24) | `rawFontSize` 1,258 |
| Icon size | add `ICON_SIZE` tokens usage: 13-14 → `sm`, 16-18 → `md`, 20-22 → `lg`; weight `regular` → `bold` except inside tab bar idle state | new `rawIconSize` ratchet |
| Padding | screen-level `paddingHorizontal: 12/14/20/24` on a screen's outermost scroll container → `layout.gutter` | new ratchet |
| Copy | wrap the ~40 plain English `<Text>` strings in `ttx()`; run `npm run i18n:generate` | new `untranslatedText` ratchet |

Do not start Stage 7 before the stores accept the build: a 1,000-line mechanical diff is exactly the kind of change that hides a regression, and almost none of it is visible.

---

## Self-Review

- **Spec coverage:** tab tops (Stage 2), stray ring (Stage 1), buttons (Stage 3), sheets and dialogs (Stage 4), loading and empty (Stage 5), voice bubble (Stage 6), radius/font/icon/padding/copy (Stage 7), measurement so none regress (Stage 0). The audit's "headers: 30 screens draw their own" is intentionally **not** a stage: those screens (profile, thread, messages, auth, legal) have different jobs, and Stage 2 plus the earlier `BackButton` already unify what a user touches.
- **Placeholder scan:** Task 4 and Task 6 list files and a mechanical rule rather than 31 code blocks; each site's replacement is shown once and the diff is read per file. Stage 7 gives rules and ceilings, not code, because its purpose is a codemod whose mapping must be printed from `lib/ui/theme.ts` at execution time.
- **Type consistency:** `useUserRefresh` returns `{ refreshing, onRefresh }` in Tasks 1 and its usages; `TabHeader` props `title/subtitle/left/right` match Stage 2's migration; `Button` props match Task 4's example; `useConfirm().confirm` and `confirmElement` match Task 7; `bubbleOpacity` and `BUBBLE_SIZE` match Task 8.
- **Known unknowns to resolve at execution time, not guess now:** the exact `radius` and `fontSizes` token values (read `lib/ui/theme.ts` before Stage 7); which `Alert.alert` calls have more than two choices (read each); whether Chat's header still fits at 360 dp once it uses `TabHeader` (screenshot at `adb shell wm size 1080x1920` and `wm density 420`, then reset with `wm size reset`).
