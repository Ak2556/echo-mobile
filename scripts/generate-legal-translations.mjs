#!/usr/bin/env node
// Legal-document translation generator.
//
// WHY
// DPDP Act 2023 §5 requires the notice be available in English or any of the 22
// Eighth Schedule languages, at the user's option. This script produces those
// translations for the Terms of Service and Privacy Policy.
//
// HOW IT DIFFERS FROM scripts/generate-i18n.mjs
// That one translates short UI strings. A legal document is one long structured
// text where a mistranslated clause has consequences, so this script:
//   · splits on markdown "## " section boundaries and translates section by
//     section, keeping each request small enough to stay coherent
//   · preserves markdown structure, headings, tables and placeholders verbatim
//   · never touches the entity name, email addresses or section numbers
//   · writes one file per language so a partial run can resume
//
// USAGE
//   OPENROUTER_API_KEY=sk-... node scripts/generate-legal-translations.mjs
//
//   --only=hi,bn,ta     translate a subset
//   --doc=terms|privacy which document (default: both)
//   --dry               parse and report without calling the model
//   --force             retranslate languages that already have a file
//
// OUTPUT
//   constants/legal/translations/<doc>.<code>.json
//
// ⚠ THESE ARE CONVENIENCE TRANSLATIONS. Terms §25 makes English authoritative.
//   Before launch, commission human review of at least hi, bn, ta, te, mr — the
//   highest-population languages Echo will actually launch into.
//
// ⚠ SCRIPT SUPPORT. Santali (Ol Chiki) and Manipuri (Meitei Mayek) will render
//   as empty boxes on stock iOS. Either bundle Noto Sans Ol Chiki / Noto Sans
//   Meetei Mayek, or serve those two in Devanagari and Bengali script
//   respectively — both are accepted in practice. Counsel should confirm.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'constants', 'legal', 'translations');

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.LEGAL_TRANSLATE_MODEL || 'google/gemini-2.5-pro';
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
const DOC_ARG = (process.argv.find(a => a.startsWith('--doc=')) || '').split('=')[1];

// ── the 22, read from the single source of truth ────────────────────────────
function loadLanguages() {
  const src = readFileSync(join(ROOT, 'constants', 'legal', 'eighthSchedule.ts'), 'utf8');
  // Bound the slice to the array literal — LEGAL_AUTHORITATIVE below it has the
  // same shape and would otherwise be picked up as a 23rd language.
  const start = src.indexOf('EIGHTH_SCHEDULE_LANGUAGES');
  const end = src.indexOf('] as const;', start);
  const block = src.slice(start, end);
  const rows = [...block.matchAll(
    /code:\s*'([^']+)',\s*englishName:\s*'([^']+)',\s*nativeName:\s*'([^']+)'/g
  )];
  if (!rows.length) throw new Error('could not parse eighthSchedule.ts');
  return rows.map(m => ({ code: m[1], englishName: m[2], nativeName: m[3] }));
}

// ── the documents ───────────────────────────────────────────────────────────
function loadDoc(name) {
  const file = name === 'terms' ? 'termsOfService.ts' : 'privacyPolicy.ts';
  const constant = name === 'terms' ? 'TERMS_OF_SERVICE_MD' : 'PRIVACY_POLICY_MD';
  const src = readFileSync(join(ROOT, 'constants', 'legal', file), 'utf8');
  const start = src.indexOf(constant);
  if (start < 0) throw new Error(`${constant} not found in ${file}`);
  const open = src.indexOf('`', start);
  const close = src.indexOf('`;', open + 1);
  return src.slice(open + 1, close);
}

/** Split on "## " headings so each request is one coherent clause group. */
function splitSections(md) {
  const parts = md.split(/\n(?=## )/);
  return parts.map(s => s.trim()).filter(Boolean);
}

const SYSTEM = `You are a legal translator producing a faithful translation of a consumer Terms of Service / Privacy Policy for an Indian mobile app.

ABSOLUTE RULES:
- Translate meaning precisely. This is a binding legal document; do not soften, summarise, omit or add obligations.
- Preserve markdown EXACTLY: heading levels, bold, italics, lists, tables, block quotes, horizontal rules, line breaks.
- Do NOT translate: brand names (Echo, Apple, Google, Gemini, OpenRouter, Supabase, Cloudflare, Razorpay, RevenueCat, Sentry, PostHog), email addresses, URLs, section numbers, statute names and citations (e.g. "Digital Personal Data Protection Act, 2023", "DSA Art. 20"), currency codes and amounts.
- Leave any text inside double square brackets [[LIKE THIS]] completely untouched — it is an unfilled placeholder.
- Keep legal terms of art accurate in the target language; where no settled term exists, use the accepted English term followed by a translation in parentheses on first use.
- Output ONLY the translated markdown. No preamble, no explanation, no code fences.`;

async function translateSection(section, lang) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Translate into ${lang.englishName} (${lang.nativeName}), BCP-47 "${lang.code}".\n\n---\n${section}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${lang.code}: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  const json = await res.json();
  const out = json?.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error(`${lang.code}: empty completion`);
  return out.replace(/^```(?:markdown)?\n?/, '').replace(/\n?```$/, '');
}

async function run() {
  const languages = loadLanguages().filter(l => !ONLY || ONLY.split(',').includes(l.code));
  const docs = DOC_ARG ? [DOC_ARG] : ['terms', 'privacy'];

  mkdirSync(OUT_DIR, { recursive: true });

  for (const doc of docs) {
    const md = loadDoc(doc);
    const sections = splitSections(md);
    const words = md.split(/\s+/).length;
    console.log(`\n${doc}: ${sections.length} sections, ~${words} words, ${languages.length} languages`);

    if (DRY) {
      console.log('  --dry: sections →');
      sections.forEach((s, i) => console.log(`   ${String(i + 1).padStart(2)}. ${s.split('\n')[0].slice(0, 68)}`));
      continue;
    }
    if (!API_KEY) {
      console.error('\n  OPENROUTER_API_KEY is not set. Re-run with the key, or use --dry.');
      process.exitCode = 1;
      return;
    }

    for (const lang of languages) {
      const outFile = join(OUT_DIR, `${doc}.${lang.code}.json`);
      if (existsSync(outFile) && !FORCE) {
        console.log(`  ${lang.code.padEnd(4)} skip (exists — use --force to redo)`);
        continue;
      }
      const translated = [];
      try {
        for (let i = 0; i < sections.length; i++) {
          process.stdout.write(`\r  ${lang.code.padEnd(4)} ${i + 1}/${sections.length}   `);
          translated.push(await translateSection(sections[i], lang));
        }
      } catch (err) {
        console.log(`\n  ${lang.code.padEnd(4)} FAILED: ${err.message}`);
        console.log('         (partial output discarded; re-run to resume this language)');
        continue;
      }
      writeFileSync(outFile, JSON.stringify({
        doc,
        language: lang.code,
        englishName: lang.englishName,
        nativeName: lang.nativeName,
        model: MODEL,
        // Recorded so a reviewer can tell machine output from reviewed text.
        provenance: 'machine',
        reviewedBy: null,
        markdown: translated.join('\n\n'),
      }, null, 2) + '\n');
      console.log(`\r  ${lang.code.padEnd(4)} written (${translated.join(' ').length} chars)`);
    }
  }

  const written = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter(f => f.endsWith('.json')).length : 0;
  console.log(`\n${written} translation file(s) in constants/legal/translations/`);
  console.log('Reminder: these are machine translations. English remains authoritative (Terms §25).');
}

run().catch(err => { console.error(err); process.exitCode = 1; });
