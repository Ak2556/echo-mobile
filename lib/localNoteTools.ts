import { createNote, formatNoteResult, updateNote } from './notes';

export type LocalNoteToolName = 'create_note' | 'update_note';

export interface LocalNoteToolResult {
  ok: true;
  summary: string;
  result: {
    id: string;
    title: string;
    updatedAt: string;
  };
}

export function isLocalNoteTool(name: string): name is LocalNoteToolName {
  return name === 'create_note' || name === 'update_note';
}

export async function executeLocalNoteTool(
  name: LocalNoteToolName,
  args: any,
): Promise<LocalNoteToolResult> {
  if (name === 'create_note') {
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

function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
