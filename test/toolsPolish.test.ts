import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 2026-11-27 tools pass (Money, Pomodoro, Habits, Notes, the shared panel).
const read = (p: string) => readFileSync(p, 'utf8');
const money = read('app/mini-apps/expenses.tsx');
const pomodoro = read('app/mini-apps/pomodoro.tsx');
const habits = read('app/mini-apps/habits.tsx');
const notes = read('app/mini-apps/notes.tsx');
const panel = read('components/mini-apps/EdgeFeaturePanel.tsx');

describe('Money', () => {
  it('has one name, the one on the Tools tile', () => {
    expect(money).toMatch(/<MiniAppShell title=\{tt\('Money'\)\}/);
    expect(money).not.toMatch(/tt\('Khata|tt\('Accounting'\)/);
  });

  it('has no gradient hero, no backwards arrows and no tab bar of its own', () => {
    expect(money).not.toMatch(/LinearGradient/);
    expect(money).not.toMatch(/<ArrowUp |<ArrowDown /);
    expect(money).not.toMatch(/Floating Bottom Navigation/);
    expect(money).toMatch(/<MiniChip key=\{key\}/);
  });

  it('uses sentence case and plain copy', () => {
    expect(money).not.toMatch(/Recent Activity|money move/);
  });
});

describe('Pomodoro', () => {
  it('draws in the app accent, not a traffic light', () => {
    expect(pomodoro).toMatch(/function modeColor\(_mode: Mode, colors: any\): string \{\n  return colors\.accent;/);
    expect(pomodoro).not.toMatch(/timerColor|interpolateColor/);
  });

  it("the selected mode tab shows the length the timer will run", () => {
    expect(pomodoro).toMatch(/\{m === mode \? activeFocusMinutes : minutesFor\(m\)\}m/);
  });
});

describe('Habits', () => {
  it('has no unexplained Best/Proof strip and no repeated percentage headline', () => {
    expect(habits).not.toMatch(/<MiniCommandDeck/);
    expect(habits).not.toMatch(/fontWeight: '900' \}\}>\{pct\}%/);
    expect(habits).toMatch(/'Any time'/);
  });
});

describe('Notes', () => {
  it('uses the app chip, no colour stripe, no "Inbox" on every note', () => {
    expect(notes).toMatch(/<MiniChip\n\s+key=\{f\.id\}/);
    expect(notes).not.toMatch(/backgroundColor: active \? colors\.text : colors\.surface/);
    expect(notes).not.toMatch(/<View style=\{\{ width: 4, backgroundColor: note\.color \}\} \/>/);
    expect(notes).toMatch(/folder === 'Inbox' \? \[\] : \[folder\]/);
  });
});

describe('Echo actions panel', () => {
  it('cannot file a snapshot into Notes', () => {
    expect(panel).not.toMatch(/createNote|saveSnapshot/);
  });

  it('Habits and Pomodoro show it only once there is something to share', () => {
    expect(habits).toMatch(/\{\(doneToday > 0 \|\| bestStreak > 0\) && <EdgeFeaturePanel/);
    expect(pomodoro).toMatch(/\{\(stats\.count > 0 \|\| streak > 0\) && <EdgeFeaturePanel/);
  });
});
