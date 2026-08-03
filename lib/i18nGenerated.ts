// AUTO-GENERATED build-time translations.
//
// Populated by `scripts/generate-i18n.mjs` (npm run i18n:generate), which runs
// every English UI string through the app's model (Gemini/OpenRouter) and writes
// one static map per language. Gives every language offline, zero-latency
// translations for the whole UI.
//
// Precedence at runtime (see lib/i18n.ts `translate`):
//   hand-authored static  >  GENERATED (this file)  >  on-device runtime cache  >  English
//
// Empty until a full generation run completes — until then the runtime layer
// translates on demand. The generator MERGES, so partial/incremental runs
// (e.g. resuming after a rate limit, or --only=ta,ar) accumulate here.

import type { AppLanguageCode } from './languages';

export const GENERATED: Partial<Record<AppLanguageCode, Record<string, string>>> = {};
