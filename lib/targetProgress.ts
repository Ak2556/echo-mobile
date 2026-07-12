import { formatMoney } from './expenses';
import type { TodayProductivity } from './localSearch';
import type { TargetCategory } from './targetCategories';

export interface TargetProgressDigest {
  title: string;
  prompt: string;
  response: string;
  comparison: Array<{ label: string; you: string; partner: string; group: string }>;
}

export function buildTargetProgressDigest(
  category: TargetCategory,
  outcome: string,
  productivity: TodayProductivity,
): TargetProgressDigest {
  const cleanOutcome = outcome.trim() || category.outcome;
  const habitsLine = productivity.habits.total
    ? `${productivity.habits.done}/${productivity.habits.total} habits complete today (${productivity.habits.percent}%).`
    : 'No habits are set yet.';
  const notesLine = productivity.notes.total
    ? `${productivity.notes.total} notes saved. Recent: ${productivity.notes.recent.map(note => note.title).join(', ') || 'none'}.`
    : 'No notes are saved yet.';
  const expensesLine = `This week: $${formatMoney(productivity.expenses.expense)} spent, $${formatMoney(productivity.expenses.income)} income, $${formatMoney(productivity.expenses.balance)} balance.`;
  const memosLine = productivity.voiceMemos.total
    ? `${productivity.voiceMemos.total} voice memos captured.`
    : 'No voice memos captured yet.';
  const blockers = productivity.habits.remaining.slice(0, 3);
  const blockerLine = blockers.length
    ? `Next tasks: ${blockers.join(', ')}.`
    : 'Next task: choose one measurable action for tomorrow.';

  return {
    title: `${category.label} progress`,
    prompt: `Share my progress toward: ${cleanOutcome}`,
    response: [
      `Target: ${cleanOutcome}`,
      habitsLine,
      notesLine,
      expensesLine,
      memosLine,
      blockerLine,
      'I am sharing this so others can follow along, join the task, or compare progress honestly.',
    ].join('\n'),
    comparison: [
      {
        label: category.metrics[0] ?? 'Main metric',
        you: productivity.habits.total ? `${productivity.habits.percent}%` : 'Not set',
        partner: 'Invite',
        group: 'Open',
      },
      {
        label: category.metrics[1] ?? 'Consistency',
        you: `${productivity.notes.total} notes`,
        partner: 'Invite',
        group: 'Open',
      },
      {
        label: category.metrics[2] ?? 'Momentum',
        you: `${productivity.voiceMemos.total} memos`,
        partner: 'Invite',
        group: 'Open',
      },
    ],
  };
}
