import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Khata offered its tabs twice (a Dashboard / Parties bar at the top and a bottom bar
 * with the same destinations plus Table) and four buttons in the header. Source-level
 * checks, because the screen is a 900-line component that is not rendered under test.
 */
const screen = readFileSync('app/mini-apps/expenses.tsx', 'utf8');

describe('Khata navigation', () => {
  it('has one set of tabs, at the bottom, and no second bar at the top', () => {
    expect(screen).not.toMatch(/Top Tab Bar/);
    expect(screen.match(/setActiveTab\('/g)?.length ?? 0).toBe(0);
    expect(screen).toMatch(/\{ key: 'dashboard'[\s\S]*?\{ key: 'table'[\s\S]*?\{ key: 'parties'/);
  });

  it('labels every tab all the time, not only the selected one', () => {
    const bar = screen.slice(screen.indexOf('Floating Bottom Navigation'));
    expect(bar).toMatch(/<Text[^>]*>\{label\}<\/Text>/);
    expect(bar).not.toMatch(/activeTab === '\w+' && <Text/);
  });

  it('reports the selected tab to a screen reader', () => {
    expect(screen).toMatch(/accessibilityRole="tab"/);
    expect(screen).toMatch(/accessibilityState=\{\{ selected: active \}\}/);
  });
});

describe('Khata header', () => {
  it('carries two buttons, with reminder, profile and currency behind one gear', () => {
    const header = screen.slice(screen.indexOf('const HeaderBtns'), screen.indexOf("const profile = doc.profile"));
    expect(header.match(/<AnimatedPressable/g)?.length).toBe(2);
    expect(header).toMatch(/setShowSettings\(true\)/);
    expect(header).toMatch(/handleExport/);
  });

  it('keeps every setting reachable from the gear', () => {
    const sheet = screen.slice(screen.indexOf('<ActionSheet'), screen.indexOf('<ExportModal'));
    for (const key of ["key: 'reminder'", "key: 'profile'", "key: 'currency'"]) expect(sheet, key).toContain(key);
    expect(sheet).toMatch(/setShowProfile\(true\)/);
    expect(sheet).toMatch(/setShowCurrency\(true\)/);
    expect(sheet).toMatch(/reminders: next/);
  });

  it('keeps the export, budget, profile and currency screens', () => {
    for (const thing of ['<ExportModal', '<BudgetModal', '<CurrencyModal', '<ProfileModal', '<AddModal']) expect(screen, thing).toContain(thing);
  });
});
