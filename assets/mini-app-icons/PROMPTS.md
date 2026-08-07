# Echo mini-app icon prompt pack (AI first pass)

16 copy-paste prompts, built around **one shared style system** so the set looks
like a cohesive, premium suite — not 16 random icons. Generate them **in one
session with the same settings** (this is what kills the "AI mediocre" look).

## How to use
1. Pick a tool: **Midjourney** (best cohesion via style reference), **Ideogram**,
   **DALL·E 3**, or an icon-specific tool.
2. For every icon, paste its full prompt below (each already includes the style
   system + the symbol + the brand color).
3. **Consistency is everything:**
   - **Midjourney:** append `--ar 1:1 --style raw --v 6`. Generate `tasks` first,
     then grab its `--sref <url>` (style reference) and add it to the other 15 so
     they share a look. Or reuse the same `--seed 1234` on all.
   - **DALL·E / Ideogram:** paste the same style sentence every time, generate all
     16 back-to-back in one chat/session.
4. Export each as **1024×1024 PNG, full-bleed** (the colored rounded-square IS the
   icon — I round the corners in-app), named exactly `<id>.png`.
5. Drop them in this folder (`assets/mini-app-icons/`) and tell me — I wire them
   into `ICON_ASSETS` and they render instantly.

## Shared style system (baked into every prompt below)
> Premium mobile app icon, one bold simple symbol centered with generous padding,
> flat minimalist vector style, subtle soft gradient with gentle top-down light,
> **matte finish (not glossy)**, clean geometric shapes, rounded-square icon on a
> solid color background, cohesive modern iOS design language, crisp edges, high
> detail, studio quality, 1:1 square.

## Negative prompt (use where supported)
`text, words, letters, numbers, watermark, signature, glossy reflection, harsh glare, photorealistic, cluttered, busy background, multiple objects, drop shadow, transparent background, heavy 3d bevel, low quality, jpeg artifacts, distorted`

---

## The 16 prompts

**tasks.png** — Premium mobile app icon, a clean checklist with a single bold checkmark, flat minimalist vector, subtle soft gradient, matte finish, generous padding, rounded-square icon on a solid royal-blue (#4F7DF3) background, cohesive iOS design language, crisp, studio quality, 1:1. No text.

**habits.png** — Premium mobile app icon, a bold checkmark inside a circle with a subtle repeating ring/streak motif, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid emerald-green (#10B981) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

**fitness.png** — Premium mobile app icon, a clean dumbbell, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid teal (#14B8A6) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

**notes.png** — Premium mobile app icon, a note page with a pencil writing on it, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid warm amber (#F59E0B) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

**pomodoro.png** — Premium mobile app icon, a clean stopwatch/timer with a single tick, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid vivid red (#EF4444) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

**expenses.png** — Premium mobile app icon, a simple wallet, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid violet (#8B5CF6) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

**learn.png** — Premium mobile app icon, a graduation cap, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid sky-blue (#38BDF8) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

**planner.png** — Premium mobile app icon, a calendar with one highlighted day, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid soft-purple (#7C6CE8) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

**shopping-list.png** — Premium mobile app icon, a shopping cart, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid green (#12A878) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

**calculator.png** — Premium mobile app icon, a calculator with a simple button grid, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid blue (#3B82F6) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

**voice-memo.png** — Premium mobile app icon, a microphone with a subtle soundwave, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid red (#EF4444) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

**camera.png** — Premium mobile app icon, a clean camera with a lens, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid indigo (#6366F1) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

**image-editor.png** — Premium mobile app icon, a photo/landscape thumbnail with a small edit slider, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid pink (#EC4899) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

**world-clock.png** — Premium mobile app icon, a globe with clean meridian lines and a small clock accent, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid sky-blue (#0EA5E9) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

**markdown.png** — Premium mobile app icon, a fountain pen nib writing a line, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid slate-grey (#64748B) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

**password-gen.png** — Premium mobile app icon, a key with a subtle shield motif, flat minimalist vector, soft gradient, matte finish, generous padding, rounded-square on a solid emerald-green (#10B981) background, cohesive iOS design, crisp, studio quality, 1:1. No text.

---

### Tips for a premium result
- **Say "matte, not glossy"** — the glossy sheen is the #1 tell of a cheap icon.
- Keep **one symbol per icon**, big and simple, lots of padding.
- Generate all 16 with the **same tool + settings + style reference** in one go.
- If two share a color (pomodoro/voice-memo = red, habits/passwords = green),
  that's fine — the symbols differ. Nudge a hue if you want more separation.
- Do a quick pass: any icon that looks busy or off-style, regenerate it alone
  with the same seed/style ref until the set feels uniform.
