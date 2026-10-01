import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addHighRefreshRate } = require('../plugins/withHighRefreshRate');

const MAIN = `package com.downloadecho.echo
import android.os.Bundle

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component.
   */
  override fun getMainComponentName(): String = "main"
}
`;

describe('withHighRefreshRate', () => {
  // Phones in "smart" refresh modes keep an app at 60 Hz unless its window
  // asks for more; Echo never asked (owner report 2026-10-01).
  it('asks for the fastest mode right after onCreate', () => {
    const out = addHighRefreshRate(MAIN);
    expect(out).toMatch(/super\.onCreate\(null\)\n\s+\/\/ echo: prefer the highest refresh rate\n\s+preferHighestRefreshRate\(\)/);
    expect(out).toMatch(/preferredDisplayModeId = best\.modeId/);
    expect(out).toMatch(/^import android\.os\.Build$/m);
  });

  it('is idempotent across prebuilds', () => {
    const once = addHighRefreshRate(MAIN);
    expect(addHighRefreshRate(once)).toBe(once);
  });

  it('fails loudly if the template changes', () => {
    expect(() => addHighRefreshRate(MAIN.replace('super.onCreate(null)', 'super.onCreate(savedInstanceState)'))).toThrow(/super\.onCreate/);
  });
});
