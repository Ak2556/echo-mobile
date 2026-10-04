import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('./miniAppSync', () => ({ pullMiniAppIfNewer: vi.fn(), pushMiniApp: vi.fn() }));
vi.mock('./notes', () => ({ createNote: vi.fn() }));
vi.mock('./planner', () => ({ loadPlanner: vi.fn(), plannerToday: vi.fn(), savePlanner: vi.fn() }));

import { addLearningSession, createLearningGoal, toggleLearningTask, type LearningGoal } from './learn';

const goal = (over: Partial<LearningGoal> = {}): LearningGoal => ({
  ...createLearningGoal({ title: 'Video editing', category: 'Design', mode: 'student', level: 'beginner', targetOutcome: 'Edit a reel', dailyMinutes: 25 }),
  ...over,
});
const firstTask = (g: LearningGoal) => ({ moduleId: g.modules[0].id, taskId: g.modules[0].tasks[0].id });
const tick = (g: LearningGoal) => { const t = firstTask(g); return toggleLearningTask(g, t.moduleId, t.taskId); };

describe('learning streak and study credit', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 1, 12, 0)); });
  afterEach(() => { vi.useRealTimers(); });

  it('ticking a step credits a day; unticking it takes the credit back', () => {
    // Owner report 2026-10-01: tick + untick left streak 1→2 and 25→50 minutes.
    const start = goal({ streak: 1, studyMinutes: 25, lastStudiedAt: new Date(2026, 8, 30, 20, 0).toISOString() });
    const ticked = tick(start);
    expect(ticked.streak).toBe(2);
    expect(ticked.studyMinutes).toBe(50);
    const unticked = tick(ticked);
    expect(unticked.streak).toBe(1);
    expect(unticked.studyMinutes).toBe(25);
    expect(unticked.lastStudiedAt).toBe(start.lastStudiedAt);
  });

  it('unticking never credits study', () => {
    const start = goal({ streak: 3, studyMinutes: 75 });
    const t = firstTask(start);
    const doneAlready = { ...start, modules: start.modules.map(m => m.id === t.moduleId ? { ...m, tasks: m.tasks.map(x => x.id === t.taskId ? { ...x, done: true } : x) } : m) };
    const unticked = tick(doneAlready);
    expect(unticked.streak).toBe(3);
    expect(unticked.studyMinutes).toBe(75);
  });

  it('a missed day restarts the streak at 1', () => {
    const start = goal({ streak: 9, studyMinutes: 100, lastStudiedAt: new Date(2026, 8, 25, 9, 0).toISOString() });
    expect(tick(start).streak).toBe(1);
    expect(addLearningSession(start, { title: '', minutes: 20, focus: '' }).streak).toBe(1);
  });

  it('a second step the same day does not add another day', () => {
    const start = goal({ streak: 1, studyMinutes: 25, lastStudiedAt: new Date(2026, 8, 30, 20, 0).toISOString() });
    const once = tick(start);
    const g = once.modules[0].tasks[1] ? toggleLearningTask(once, once.modules[0].id, once.modules[0].tasks[1].id) : once;
    expect(g.streak).toBe(2);
    expect(g.studyMinutes).toBe(50);
  });

  it('uses the local day, not the UTC one', () => {
    // 04:00 IST on Oct 1 is still Sep 30 in UTC; that is "today" locally.
    vi.setSystemTime(new Date(2026, 9, 1, 23, 0));
    const earlyToday = new Date(2026, 9, 1, 0, 30).toISOString();
    const start = goal({ streak: 4, studyMinutes: 40, lastStudiedAt: earlyToday });
    expect(tick(start).streak).toBe(4);
  });
});
