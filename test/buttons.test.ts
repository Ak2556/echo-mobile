/**
 * One text button. The same save, submit or enter button was drawn by hand on each screen:
 * 12, 14, 15 or 16 px of padding, radii of 12, 14, 16 or 99, and some with a text colour
 * that went unreadable on a light accent. components/ui/Button.tsx is the one, and the form
 * screens use it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const MIGRATED = [
  'app/welcome.tsx', 'app/appeal.tsx', 'app/report.tsx', 'app/get-verified.tsx',
  'app/edit-profile.tsx', 'app/persona.tsx', 'app/onboarding.tsx',
];

describe('Button', () => {
  it.each(MIGRATED)('%s uses the shared Button', (file) => {
    expect(read(file)).toContain("components/ui/Button'");
    expect(read(file)).toContain('<Button');
  });

  it('onboarding no longer draws its own primary and secondary buttons', () => {
    const src = read('app/onboarding.tsx');
    expect(src).not.toContain('function PrimaryButton');
    expect(src).not.toContain('function SecondaryButton');
  });

  it('the button reads its colours from the theme, never a hex', () => {
    const src = read('components/ui/Button.tsx');
    expect(src).not.toMatch(/['"]#[0-9a-fA-F]{3,8}['"]/);
    expect(src).toContain('colors.onAccent');
  });

  it('comes in three fixed heights', () => {
    const src = read('components/ui/Button.tsx');
    expect(src).toMatch(/compact: 36, regular: 48, large: 56/);
  });
});
