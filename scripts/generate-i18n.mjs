#!/usr/bin/env node
// Build-time translation generator.
//
// Runs every English UI string (BASE_TRANSLATIONS in lib/i18n.ts) through the
// same model the app uses (Gemini via OpenRouter) for every supported language,
// and writes lib/i18nGenerated.ts. This gives all languages offline, zero-cost,
// zero-latency translations for the whole UI. Hand-authored strings still win at
// runtime (see lib/i18n.ts precedence), so this only fills the rest.
//
// Two ways to run:
//   A) Direct — needs the OpenRouter key locally:
//        OPENROUTER_API_KEY=sk-... node scripts/generate-i18n.mjs
//   B) Via the deployed i18n-translate edge function — no local API key, just a
//      shared secret you set once (supabase secrets set I18N_GEN_SECRET=...):
//        I18N_GEN_SECRET=... node scripts/generate-i18n.mjs
//      (override the project URL with SUPABASE_URL=... if needed)
//
//   Add --only=ta,ar for a subset, --dry to validate extraction without calling.
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
const GEN_SECRET = process.env.I18N_GEN_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eyokhisijabitzjiydmz.supabase.co';
const EDGE_URL = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/i18n-translate`;
const MODEL = process.env.VOICE_COMMAND_MODEL || process.env.ECHO_AI_MODEL || 'google/gemini-2.5-flash';
const CHUNK = 55;
const DRY = process.argv.includes('--dry');
const EDGE = !API_KEY && !!GEN_SECRET; // prefer direct if both are somehow set

if (!API_KEY && !GEN_SECRET && !DRY) {
  console.error('Provide one of:');
  console.error('  OPENROUTER_API_KEY=sk-...   (direct)');
  console.error('  I18N_GEN_SECRET=...         (via the deployed edge function)');
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

async function translate(name, code, items) {
  return EDGE ? translateChunkEdge(code, name, items) : translateChunkDirect(name, code, items);
}

async function translateChunkEdge(code, name, items) {
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-gen-secret': GEN_SECRET },
    body: JSON.stringify({ language: code, languageName: name, items }),
  });
  if (!res.ok) throw new Error(`edge ${res.status}: ${await res.text()}`);
  const out = await res.json();
  return out.translations ?? {};
}

async function translateChunkDirect(name, code, items) {
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

// Parse the current GENERATED object out of the output file so re-runs merge.
function loadExisting() {
  try {
    const src = readFileSync(OUT, 'utf8');
    const eq = src.indexOf('= {');
    const end = src.lastIndexOf('};');
    if (eq === -1 || end === -1) return {};
    return JSON.parse(src.slice(eq + 2, end + 1));
  } catch {
    return {};
  }
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
  console.log(`Translating ${keys.length} strings into ${languages.length} languages via ${EDGE ? 'edge function' : `OpenRouter (${MODEL})`}…`);

  // Merge with whatever is already generated, so partial / incremental runs
  // (e.g. --only=ta,ar, or resuming after a quota limit) accumulate instead of
  // wiping earlier work. Only missing keys are translated → quota-friendly.
  const generated = loadExisting();
  for (const { code, name } of languages) {
    const map = generated[code] || {};
    const missing = keys.filter((k) => typeof map[k] !== 'string');
    if (missing.length === 0) { console.log(`  ${name} (${code}): already complete`); generated[code] = map; continue; }
    const chunks = chunk(missing, CHUNK);
    for (let i = 0; i < chunks.length; i++) {
      const items = Object.fromEntries(chunks[i].map((k) => [k, base[k]]));
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          const part = await translate(name, code, items);
          const got = chunks[i].filter((k) => typeof part[k] === 'string');
          if (got.length === 0) throw new Error('empty');
          for (const k of got) map[k] = part[k];
          ok = true;
          process.stdout.write(`  ${code} ${Object.keys(map).length}/${keys.length}\r`);
        } catch (e) {
          if (attempt === 2) console.error(`\n  ${code} chunk ${i} failed after retries: ${e.message}`);
        }
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
