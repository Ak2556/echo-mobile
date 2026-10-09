import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The summary strip (MiniCommandDeck) sat above eleven mini-apps. On most it echoed the
 * controls or the card directly below it, and when there was nothing yet it read
 * "0 / 0 / 0" or three dashes. Source-level checks: each decision was made by looking at the
 * screen, and these keep it from drifting back.
 */
const read = (app: string) => readFileSync(`app/mini-apps/${app}.tsx`, 'utf8');

describe('strips that only echoed what is beside them are gone', () => {
  it.each([
    ['bill-splitter', 'Total, People and Mode repeated the amount field, the People header and the split selector'],
    ['dice', 'Die and Count repeated the two selectors under it'],
    ['world-clock', 'Local repeated the My location card; "Weather: 4" counted loaded cities'],
    ['color-tools', 'HEX and Contrast repeated the swatch and the Formats list'],
    ['voice-memo', 'Now repeated the recorder timer; Memos is in the header badge'],
  ])('%s', (app) => {
    expect(read(app)).not.toMatch(/<MiniCommandDeck/);
  });
});

describe('strips that stay appear only once they say something', () => {
  it.each([
    ['json-formatter', /\{input\.trim\(\)\.length > 0 && \(\s*<MiniCommandDeck/],
    ['planner', /\{stats\.total > 0 && \(\s*<MiniCommandDeck/],
    ['tasks', /\{stats\.open > 0 && \(\s*<MiniCommandDeck/],
    ['bmi', /\{bmi && \(\s*<MiniCommandDeck/],
  ])('%s', (app, pattern) => {
    expect(read(app)).toMatch(pattern);
  });
});

describe('strips that stay lose the metric that repeated its neighbour', () => {
  it('markdown does not show the View that the Editor / Preview switch already shows', () => {
    expect(read('markdown')).not.toMatch(/label: 'View'/);
    expect(read('markdown')).toMatch(/label: 'Words'/);
    expect(read('markdown')).toMatch(/label: 'Chars'/);
  });

  it('habits does not repeat the Today count that the progress card shows', () => {
    const habits = read('habits');
    // Only the strip: the share panel further down keeps its own Today metric.
    const strip = habits.slice(habits.indexOf('<MiniCommandDeck'), habits.indexOf('/>', habits.indexOf('<MiniCommandDeck')));
    expect(strip).not.toMatch(/label: tt\('Today'\)/);
    expect(strip).toMatch(/label: tt\('Best'\)/);
    expect(strip).toMatch(/label: tt\('Proof'\)/);
  });
});
