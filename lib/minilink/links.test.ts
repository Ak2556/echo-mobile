import { describe, it, expect } from 'vitest';
import { LINKS } from './links';

/**
 * The role table in the design is only real if something enforces it.
 * Note the asymmetry: a declared role need not be wired (a Tracker with no
 * incoming link is valid), but a wired link must match the roles.
 */
const TRACKERS = ['tasks', 'expenses', 'notes', 'fitness', 'habits', 'planner', 'shopping-list', 'learn'];
const EMITTERS = ['bill-splitter', 'pomodoro', 'bmi', 'marketplace'];
const UTILITIES = ['calculator', 'converter', 'dice', 'color-tools', 'json-formatter', 'world-clock', 'markdown', 'studio', 'editor'];

describe('minilink link table', () => {
  it('never routes to or from a Utility app', () => {
    const bad = LINKS.filter(l => UTILITIES.includes(l.from) || UTILITIES.includes(l.to));
    expect(bad.map(l => `${l.from}->${l.to}`), 'Utilities hold no state worth propagating').toEqual([]);
  });

  it('only ever targets a Tracker', () => {
    const bad = LINKS.filter(l => !TRACKERS.includes(l.to));
    expect(bad.map(l => l.to), 'only Trackers can receive facts').toEqual([]);
  });

  it('only ever sources from a Tracker or an Emitter', () => {
    const bad = LINKS.filter(l => !TRACKERS.includes(l.from) && !EMITTERS.includes(l.from));
    expect(bad.map(l => l.from)).toEqual([]);
  });

  it('has no duplicate (kind, from) pair — findLink would silently pick the first', () => {
    const seen = LINKS.map(l => `${l.kind}:${l.from}`);
    expect(seen.length).toBe(new Set(seen).size);
  });

  it('gives every link both an apply and a revert, so nothing is unundoable', () => {
    for (const l of LINKS) {
      expect(typeof l.apply, `${l.from}->${l.to} apply`).toBe('function');
      expect(typeof l.revert, `${l.from}->${l.to} revert`).toBe('function');
    }
  });
});
