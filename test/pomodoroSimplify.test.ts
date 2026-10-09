import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The pomodoro screen stacked eleven panels around a timer, with the Start button
 * below the bottom of the screen. The source is checked because the screen is a
 * 1,300-line component that is not rendered under test.
 */
const screen = readFileSync('app/mini-apps/pomodoro.tsx', 'utf8');
const at = (needle: string) => screen.indexOf(needle, screen.indexOf('export default function'));

describe('pomodoro screen order', () => {
  it('puts the timer and its controls before every analytics panel', () => {
    const controls = at('{/* Controls */}');
    expect(controls).toBeGreaterThan(0);
    for (const panel of ['<FocusMomentumStrip', '<FocusGarden', '<FocusIntelligencePanel', 'LAST 7 DAYS']) {
      expect(at(panel), panel).toBeGreaterThan(controls);
    }
  });

  it('does not repeat the day\'s totals above the timer', () => {
    expect(screen).not.toMatch(/<MiniCommandDeck/);
    expect(screen).not.toMatch(/function TimerInsightStrip/);
    expect(screen).not.toMatch(/<TimerInsightStrip/);
  });

  it('shows the stage rail and the presets only when they mean something', () => {
    expect(screen).toMatch(/showStageRail\(running, pct\) && <StageRail/);
    expect(screen).toMatch(/showFocusPresets\(mode, running\) && \(/);
  });

  it('folds the analytics into one closed section that names what is inside', () => {
    expect(screen).toMatch(/<CollapsibleSection[\s\S]*?title=\{tt\('Progress'\)\}[\s\S]*?progressSummary\(stats\.count, stats\.goal, streak\)/);
    expect(screen).toMatch(/useState\(false\);?\s*\n[\s\S]*?showProgress/);
  });

  it('keeps every feature: the panels, the log, the settings and the share panel', () => {
    for (const thing of ['<FocusMomentumStrip', '<FocusGarden', '<FocusBeatsPanel', '<FocusIntelligencePanel', 'LAST 7 DAYS', "tt('TODAY')", '<SettingsSheet', '<EdgeFeaturePanel', '<StageRail', '<FocusPresetRail']) {
      expect(screen, thing).toContain(thing);
    }
  });

  it('keeps the one thing the three-chip strip said that nothing else does: when it ends, and what is next', () => {
    expect(screen).toMatch(/tt\('Ends'\)\} \$\{endAtLabel\}/);
    expect(screen).toMatch(/tt\('Next'\)\}: \{tt\(nextLabel\)\}/);
  });
});
