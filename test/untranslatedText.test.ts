/**
 * Plain English that is the only child of a <Text> never reaches the translator, so a
 * Hindi user sees it in English. Every such string was wrapped in ttx() in the copy sweep;
 * this counts what is left (strings next to variables, which need a template rather than a
 * wrap, plus a few deliberate ones) and lets the number only go down.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(__dirname, '..');
const CEILING = 4; // dev probe overlay (2), the reviewer sign-in label, the web promo line

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (p.endsWith('.tsx') && !p.endsWith('.test.tsx')) yield p;
  }
}

function plainTextChildren(): string[] {
  const found: string[] = [];
  for (const dir of ['app', 'components']) {
    for (const file of sources(join(ROOT, dir))) {
      const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: ts.Node) => {
        if (ts.isJsxElement(n) && /^(Text|Animated\.Text)$/.test(n.openingElement.tagName.getText())) {
          const sig = n.children.filter(c => !(ts.isJsxText(c) && !c.text.trim()));
          if (sig.length === 1 && ts.isJsxText(sig[0])) {
            const t = sig[0].text.replace(/\s+/g, ' ').trim();
            if (/[A-Za-z]{3,}/.test(t) && t !== 'Echo' && t !== 'echo') found.push(`${file.slice(ROOT.length + 1)}: ${t}`);
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
  }
  return found;
}

describe('untranslated screen text', () => {
  it('whole-string <Text> literals not wrapped in ttx()', () => {
    const found = plainTextChildren();
    expect(found.length, found.join('\n')).toBeLessThanOrEqual(CEILING);
  });
});
