import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * What the fitness screen shows, checked in its source because the screen is a
 * 1,500-line component that is not rendered under test.
 */
const screen = readFileSync('app/mini-apps/fitness.tsx', 'utf8');

describe('fitness screen', () => {
  it('does not repeat the day\'s totals in a banner above the tabs', () => {
    // The banner showed the same three numbers as the cards below it, on every tab,
    // and rounded water to whole litres, so 250 ml read as "0L".
    expect(screen).not.toMatch(/<MiniCommandDeck/);
    expect(screen).not.toMatch(/waterToday \/ 1000\)\}L/);
  });

  it('shows a calorie or macro target only after the person has set one', () => {
    expect(screen).toMatch(/goalsAreSet\(doc, \{ goals: DEFAULT_GOALS, settings: DEFAULT_SETTINGS \}\)/);
    for (const m of ['protein', 'carbs', 'fat']) {
      expect(screen, m).toMatch(new RegExp(`goalsSet \\? \`of \\$\\{doc\\.goals\\.${m}\\}g\` : ''`));
    }
    expect(screen).toMatch(/goalsSet \? ` \/ \$\{doc\.goals\.calories\} ` : ' '/);
    expect(screen).toMatch(/Set your daily goal/);
  });

  it('opens Progress to the weight trend and a few entries, with the rest behind a header', () => {
    expect(screen).toMatch(/recentWeights\(sortedWeights, showAllWeights\)/);
    for (const key of ['measure', 'lifts', 'logs']) expect(screen, key).toContain(`toggleSection('${key}')`);
  });

  it('keeps every feature: the measurements sheet, the routines and the library are still reachable', () => {
    expect(screen).toMatch(/setShowMeasure\(true\)/);
    expect(screen).toMatch(/setRoutineEditor\(/);
    expect(screen).toMatch(/tab === 'library'/);
  });
});
