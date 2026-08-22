#!/usr/bin/env node
// Generates NOTICE (human-readable attribution) and sbom.json (CycloneDX 1.5)
// from the production dependency tree.
//
//   npm run legal:sbom
//
// Both outputs are things counsel and acquirers ask for, and both go stale the
// moment a dependency changes — so regenerate before any release rather than
// hand-editing either file.
//
// Licence elections live in ELECTIONS below. They are decisions, not facts:
// when a package offers a choice (node-forge is BSD-3-Clause OR GPL-2.0), the
// company must pick one and record it. Add to this list, don't bury it.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAMP = process.env.SBOM_DATE || new Date().toISOString().slice(0, 10);

const ELECTIONS = `LICENCE ELECTIONS AND OBLIGATIONS
---------------------------------
node-forge is offered under (BSD-3-Clause OR GPL-2.0). Echo elects the
  BSD-3-Clause licence.
lightningcss (and its platform binaries) are MPL-2.0. Echo uses them
  unmodified; no MPL source-disclosure obligation is triggered. If a file
  covered by the MPL is ever modified, that file must be published.
Inter and Fraunces are distributed under the SIL Open Font License 1.1.
  Attribution is given here; the fonts are not sold or redistributed
  standalone.
caniuse-lite is CC-BY-4.0; attribution is given here.
react-native-fit-image is distributed under the Beerware licence.
@nozbe/sqlite is distributed under the SQLite public-domain terms.
`;

function readTree() {
  const raw = execFileSync(
    'npx',
    ['--yes', 'license-checker', '--production', '--json'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const all = JSON.parse(raw);
  return Object.entries(all).filter(([k]) => !k.startsWith('echo@'));
}

function writeNotice(rows) {
  const byLicence = {};
  for (const [pkg, meta] of rows) {
    const lic = String(meta.licenses || 'UNKNOWN');
    (byLicence[lic] ||= []).push(pkg);
  }
  const ordered = Object.entries(byLicence).sort((a, b) => b[1].length - a[1].length);

  let out = 'ECHO — THIRD-PARTY SOFTWARE NOTICES\n';
  out += '===================================\n\n';
  out += 'Echo incorporates the open-source packages listed below. Each remains the\n';
  out += 'property of its respective copyright holders and is used under the licence\n';
  out += 'shown. Full licence texts are distributed with each package inside\n';
  out += 'node_modules/<package>/LICENSE.\n\n';
  out += `Generated from the production dependency tree on ${STAMP}.\n`;
  out += `Total packages: ${rows.length}\n\n`;
  out += ELECTIONS;

  for (const [lic, pkgs] of ordered) {
    out += `\n${lic}  (${pkgs.length})\n${'-'.repeat(Math.max(lic.length, 12))}\n`;
    out += pkgs.sort().join('\n') + '\n';
  }
  writeFileSync(join(ROOT, 'NOTICE'), out);
  return ordered.length;
}

function writeSbom(rows) {
  const components = rows.map(([key, meta]) => {
    const at = key.lastIndexOf('@');
    const name = key.slice(0, at);
    const version = key.slice(at + 1);
    return {
      type: 'library',
      'bom-ref': `pkg:npm/${name}@${version}`,
      name,
      version,
      purl: `pkg:npm/${name}@${version}`,
      licenses: [{ license: { name: String(meta.licenses || 'UNKNOWN') } }],
      ...(meta.repository ? { externalReferences: [{ type: 'vcs', url: meta.repository }] } : {}),
    };
  });

  writeFileSync(join(ROOT, 'sbom.json'), JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: `${STAMP}T00:00:00Z`,
      component: { type: 'application', name: 'echo', version: '1.0.0', 'bom-ref': 'pkg:npm/echo@1.0.0' },
      tools: [{ name: 'license-checker + scripts/generate-sbom.mjs' }],
    },
    components,
  }, null, 2) + '\n');
  return components.length;
}

const rows = readTree();
const licences = writeNotice(rows);
const count = writeSbom(rows);
console.log(`NOTICE      ${rows.length} packages across ${licences} licences`);
console.log(`sbom.json   ${count} components (CycloneDX 1.5)`);
