import { createHabit, setHabitCompletion } from './habits';
import { logExpenseTransaction, formatMoney } from './expenses';
import { createNote, formatNoteResult, updateNote } from './notes';
import { deleteVoiceMemo, renameVoiceMemo } from './voiceMemos';

export type LocalToolName =
  | 'create_note'
  | 'update_note'
  | 'create_habit'
  | 'complete_habit'
  | 'uncomplete_habit'
  | 'log_expense_transaction'
  | 'rename_voice_memo'
  | 'delete_voice_memo';

export interface LocalToolExecution {
  ok: true;
  summary: string;
  result: Record<string, unknown>;
}

export function isLocalTool(name: string): name is LocalToolName {
  return LOCAL_TOOL_NAMES.has(name as LocalToolName);
}

export async function executeLocalTool(name: LocalToolName, args: any): Promise<LocalToolExecution> {
  switch (name) {
    case 'create_note': {
      const note = await createNote({
        title: stringArg(args?.title),
        body: stringArg(args?.body),
        color: stringArg(args?.color),
      });
      return {
        ok: true,
        summary: formatNoteResult('create', note),
        result: { id: note.id, title: note.title, updatedAt: note.updatedAt },
      };
    }
    case 'update_note': {
      const note = await updateNote({
        id: stringArg(args?.id),
        title: stringArg(args?.title),
        matchTitle: stringArg(args?.match_title ?? args?.matchTitle),
        body: stringArg(args?.body),
        color: stringArg(args?.color),
        mode: args?.mode === 'append' ? 'append' : 'replace',
      });
      return {
        ok: true,
        summary: formatNoteResult('update', note),
        result: { id: note.id, title: note.title, updatedAt: note.updatedAt },
      };
    }
    case 'create_habit': {
      const habit = await createHabit({
        name: stringArg(args?.name),
        emoji: stringArg(args?.emoji),
        color: stringArg(args?.color),
      });
      return {
        ok: true,
        summary: `Created habit "${habit.name}"`,
        result: { id: habit.id, name: habit.name, emoji: habit.emoji },
      };
    }
    case 'complete_habit':
    case 'uncomplete_habit': {
      const completed = name === 'complete_habit';
      const habit = await setHabitCompletion({
        id: stringArg(args?.id),
        name: stringArg(args?.name ?? args?.match_name ?? args?.matchName),
        date: stringArg(args?.date),
        completed,
      });
      return {
        ok: true,
        summary: `${completed ? 'Completed' : 'Uncompleted'} "${habit.name}"`,
        result: { id: habit.id, name: habit.name, completedDates: habit.completedDates },
      };
    }
    case 'log_expense_transaction': {
      const tx = await logExpenseTransaction({
        type: stringArg(args?.type),
        amount: typeof args?.amount === 'number' ? args.amount : stringArg(args?.amount),
        category: stringArg(args?.category),
        note: stringArg(args?.note),
        date: stringArg(args?.date),
      });
      return {
        ok: true,
        summary: `Logged ${tx.type} $${formatMoney(tx.amount)} for ${tx.category}`,
        result: { id: tx.id, type: tx.type, amount: tx.amount, category: tx.category, date: tx.date },
      };
    }
    case 'rename_voice_memo': {
      const memo = await renameVoiceMemo({
        id: stringArg(args?.id),
        matchTitle: stringArg(args?.match_title ?? args?.matchTitle),
        title: stringArg(args?.title ?? args?.new_title ?? args?.newTitle),
      });
      return {
        ok: true,
        summary: `Renamed voice memo to "${memo.title}"`,
        result: { id: memo.id, title: memo.title },
      };
    }
    case 'delete_voice_memo': {
      const memo = await deleteVoiceMemo({
        id: stringArg(args?.id),
        title: stringArg(args?.title),
        matchTitle: stringArg(args?.match_title ?? args?.matchTitle),
      });
      return {
        ok: true,
        summary: `Deleted voice memo "${memo.title}"`,
        result: { id: memo.id, title: memo.title },
      };
    }
    default:
      throw new Error('Unknown local tool');
  }
}

export function localToolFailureMessage(name: string, error: string): string {
  if (name.includes('habit')) return `I couldn't update Habits: ${error}`;
  if (name.includes('expense')) return `I couldn't update Expenses: ${error}`;
  if (name.includes('voice_memo')) return `I couldn't update Voice Memo: ${error}`;
  return `I couldn't update Notes: ${error}`;
}

const LOCAL_TOOL_NAMES = new Set<LocalToolName>([
  'create_note',
  'update_note',
  'create_habit',
  'complete_habit',
  'uncomplete_habit',
  'log_expense_transaction',
  'rename_voice_memo',
  'delete_voice_memo',
]);

function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
