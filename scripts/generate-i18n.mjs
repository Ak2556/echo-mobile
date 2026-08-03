#!/usr/bin/env node
// Build-time translation generator.
//
// Runs every English UI string (BASE_TRANSLATIONS in lib/i18n.ts) through the
// same model the app uses (Gemini via OpenRouter) for every supported language,
// and writes lib/i18nGenerated.ts. This gives all languages offline, zero-cost,
// zero-latency translations for the whole UI. Hand-authored strings still win at
// runtime (see lib/i18n.ts precedence), so this only fills the rest.
//
// Usage:
//   OPENROUTER_API_KEY=sk-... node scripts/generate-i18n.mjs
//   OPENROUTER_API_KEY=sk-... node scripts/generate-i18n.mjs --only=ta,ar   # subset
//
// Re-run whenever you add UI strings. Safe to re-run; it regenerates fully.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const I18N = join(ROOT, 'lib', 'i18n.ts');
const LANGS = join(ROOT, 'lib', 'languages.ts');
const OUT = join(ROOT, 'lib', 'i18nGenerated.ts');

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.VOICE_COMMAND_MODEL || process.env.ECHO_AI_MODEL || 'google/gemini-2.5-flash';
const CHUNK = 120;
const DRY = process.argv.includes('--dry');

if (!API_KEY && !DRY) {
  console.error('Missing OPENROUTER_API_KEY. Run:  OPENROUTER_API_KEY=sk-... node scripts/generate-i18n.mjs');
  process.exit(1);
}

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).split(',').map((s) => s.trim()) : null;

// --- extract the English base ---
function extractBase() {
  const src = readFileSync(I18N, 'utf8');
  const start = src.indexOf('const BASE_TRANSLATIONS = {');
  const end = src.indexOf('} as const;', start);
  if (start === -1 || end === -1) throw new Error('Could not locate BASE_TRANSLATIONS');
  const block = src.slice(start, end);
  const re = /'([\w.]+)':\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
  const out = {};
  let m;
  while ((m = re.exec(block))) {
    // eslint-disable-next-line no-eval
    out[m[1]] = eval(m[2]); // trusted, our own source
  }
  return out;
}

// --- extract languages (code + English name), minus English ---
function extractLanguages() {
  const src = readFileSync(LANGS, 'utf8');
  const re = /code:\s*'(\w+)',\s*englishName:\s*'([^']+)'/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) if (m[1] !== 'en') out.push({ code: m[1], name: m[2] });
  return out;
}

function systemPrompt(name, code) {
  return `You are a professional mobile-app localizer. Translate each UI string from English into ${name} (BCP-47 "${code}").
Rules:
- Keep placeholder tokens like {name}, {count}, {value} EXACTLY as written.
- Keep translations short, natural and idiomatic for a phone UI.
- Do NOT translate the brand name "Echo".
- Preserve trailing punctuation and ellipsis (…).
- Include EVERY key and translate its value — never skip or leave a value in English (except "Echo" and {placeholders}).
- Return ONLY a JSON object mapping each input key to its translated string.`;
}

function parseJson(raw) {
  const s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a === -1 || b === -1) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

async function translateChunk(name, code, items) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/Ak2556/echo-mobile',
      'X-Title': 'Echo i18n gen',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt(name, code) },
        { role: 'user', content: JSON.stringify(items) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const out = await res.json();
  return parseJson(out.choices?.[0]?.message?.content ?? '') ?? {};
}

function chunk(entries, n) {
  const out = [];
  for (let i = 0; i < entries.length; i += n) out.push(entries.slice(i, i + n));
  return out;
}

async function main() {
  const base = extractBase();
  const keys = Object.keys(base);
  let languages = extractLanguages();
  if (only) languages = languages.filter((l) => only.includes(l.code));

  if (DRY) {
    console.log(`[dry] ${keys.length} English strings extracted.`);
    console.log(`[dry] ${languages.length} target languages: ${languages.map((l) => l.code).join(', ')}`);
    console.log(`[dry] sample keys: ${keys.slice(0, 5).join(', ')}`);
    console.log(`[dry] sample value: ${base[keys[0]]}`);
    return;
  }
  console.log(`Translating ${keys.length} strings into ${languages.length} languages (model: ${MODEL})…`);

  const generated = {};
  for (const { code, name } of languages) {
    const map = {};
    const chunks = chunk(keys, CHUNK);
    for (let i = 0; i < chunks.length; i++) {
      const items = Object.fromEntries(chunks[i].map((k) => [k, base[k]]));
      try {
        const part = await translateChunk(name, code, items);
        for (const k of chunks[i]) if (typeof part[k] === 'string') map[k] = part[k];
        process.stdout.write(`  ${code} ${Object.keys(map).length}/${keys.length}\r`);
      } catch (e) {
        console.error(`\n  ${code} chunk ${i} failed: ${e.message}`);
      }
    }
    generated[code] = map;
    console.log(`  ${name} (${code}): ${Object.keys(map).length}/${keys.length}`);
  }

  const header = `// AUTO-GENERATED build-time translations. Do not edit by hand.
// Regenerate with:  OPENROUTER_API_KEY=... node scripts/generate-i18n.mjs
// Precedence at runtime: hand-authored static > GENERATED > runtime cache > English.

import type { AppLanguageCode } from './languages';

export const GENERATED: Partial<Record<AppLanguageCode, Record<string, string>>> = ${JSON.stringify(generated, null, 2)};
`;
  writeFileSync(OUT, header, 'utf8');
  console.log(`\nWrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
