import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 2026-10-01, new user report: "Make it yours" (step 5) → Continue landed
// back on "Welcome to Echo" (step 3). The DOB step was inserted at index 3 on
// 2026-08-22 and the later panels still called goToStep(2/3/4), so nobody
// could finish sign-up: Avatar → Name, Bio → DOB, Interests → Avatar.
describe('sign-up wizard forward path', () => {
  const src = readFileSync('app/auth/signup-wizard.tsx', 'utf8');

  it('never jumps to a step by bare number', () => {
    expect(src).not.toMatch(/goToStep\(\s*\d/);
  });

  it('each panel moves forward to the next one, in order', () => {
    const order = src.match(/const STEP = \{([^}]+)\}/)![1]
      .split(',').map(p => p.split(':')[0].trim()).filter(Boolean);
    const afterName = src.slice(src.indexOf('{/* STEP 2: NAME */}'));
    const targets = [...afterName.matchAll(/goToStep\(STEP\.([A-Z]+)/g)].map(m => m[1])
      .filter((t, i, all) => t !== all[i - 1]);
    expect(targets).toEqual(order.slice(order.indexOf('NAME') + 1));
  });
});
