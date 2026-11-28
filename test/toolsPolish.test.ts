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

// 2026-11-28 pass (Fitness, Learn, Planner).
const fitness = read('app/mini-apps/fitness.tsx');
const planner = read('app/mini-apps/planner.tsx');

describe('tool headers', () => {
  it('carry no one-word lane tag as a subtitle ("Fit", "Plan", "Master", …)', () => {
    for (const f of ['markdown', 'json-formatter', 'world-clock', 'editor', 'studio', 'planner', 'dice', 'learn', 'calculator', 'color-tools', 'converter', 'bill-splitter', 'fitness', 'voice-memo']) {
      expect(read(`app/mini-apps/${f}.tsx`)).not.toMatch(/<MiniAppShell[^>]*?subtitle=(\{ttx\("\w+"\)\}|"Post-process"|\{activeGoal)/);
    }
  });
});

describe('Fitness', () => {
  it('has no always-up trend icon and labels the weight chart by date', () => {
    expect(fitness).not.toMatch(/<TrendUp color=\{colors\.accent\} size=\{36\}/);
    expect(fitness).toMatch(/chartDate\(pts\[0\]\.date\)/);
    expect(fitness).not.toMatch(/\{min\.toFixed\(1\)\} \{ttx\("kg"\)\}/);
  });

  it('shows the actions panel only once something is logged', () => {
    expect(fitness).toMatch(/\{\(totals\.calories > 0 \|\| weekCount > 0 \|\| streak > 0\) && <EdgeFeaturePanel/);
  });
});

describe('Planner', () => {
  it('shows a readable date, one empty line and no panel on an empty day', () => {
    expect(planner).not.toMatch(/marginTop: 2 \}\}>\{date\}<\/Text>/);
    expect(planner).toMatch(/ttx\("Nothing planned for this day\."\)/);
    expect(planner).not.toMatch(/ttx\("No"\) \{section\.label/);
    expect(planner).toMatch(/\{stats\.total > 0 && <EdgeFeaturePanel/);
  });
});

// 2026-11-28 pass (Shopping, Studio, Editor, Marketplace).
const shopping = read('app/mini-apps/shopping-list.tsx');
const studio = read('app/mini-apps/studio.tsx');
const editor = read('app/mini-apps/editor.tsx');
const market = read('app/mini-apps/marketplace.tsx');

describe('Shopping', () => {
  it('is named as on its tile, hides totals on an empty list, and shows no dollar prices', () => {
    expect(shopping).toMatch(/<MiniAppShell title=\{ttx\("Shopping"\)\} /);
    expect(shopping).toMatch(/\{listItems\.length > 0 && \(<>/);
    expect(shopping).not.toMatch(/• \$\{item\.price/);
    expect(read('lib/mini-apps/shoppingList.ts')).not.toMatch(/price: [1-9]/);
  });
});

describe('Studio', () => {
  it('does not paint the Video button red', () => {
    expect(studio).not.toMatch(/backgroundColor: colors\.danger/);
  });
});

describe('Editor', () => {
  it('promises only what it does: video is trim only', () => {
    expect(editor).not.toMatch(/native effects|Full Scale|Pro-grade/);
    expect(editor).toMatch(/ttx\('Trim video'\)/);
  });
});

describe('Marketplace', () => {
  it('has a back button, its tile name, and accent chips', () => {
    expect(market).toMatch(/<BackButton fallback="\/\(tabs\)\/apps" \/>/);
    expect(market).toMatch(/ttx\("Marketplace"\)/);
    expect(market).not.toMatch(/backgroundColor: active \? meta\.color/);
    expect(market).not.toMatch(/seed the market/);
  });
});
