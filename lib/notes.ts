import AsyncStorage from '@react-native-async-storage/async-storage';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';

export const NOTES_KEY = 'mini:notes';

export interface Note {
  id: string;
  title: string;
  body: string;
  color: string;
  updatedAt: string;
}

export const NOTE_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899'];

export async function loadNotes(): Promise<Note[]> {
  // Cloud copy wins when a newer device wrote it (cross-device sync);
  // otherwise fall through to the local collection.
  const remote = await pullMiniAppIfNewer('notes');
  if (remote) {
    await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(remote));
    return remote as Note[];
  }
  try {
    const raw = await AsyncStorage.getItem(NOTES_KEY);
    const parsed = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveNotes(notes: Note[]): Promise<void> {
  const sorted = sortNotes(notes);
  await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(sorted));
  pushMiniApp('notes', sorted);
}

export async function createNote(input: {
  title?: string;
  body?: string;
  color?: string;
}): Promise<Note> {
  const now = new Date().toISOString();
  const note: Note = {
    id: `${Date.now()}`,
    title: input.title?.trim() || titleFromBody(input.body) || 'Untitled',
    body: input.body?.trim() ?? '',
    color: normalizeNoteColor(input.color),
    updatedAt: now,
  };
  const notes = await loadNotes();
  await saveNotes([note, ...notes]);
  return note;
}

export async function updateNote(input: {
  id?: string;
  title?: string;
  matchTitle?: string;
  body?: string;
  color?: string;
  mode?: 'replace' | 'append';
}): Promise<Note> {
  const notes = await loadNotes();
  const match = findNote(notes, input);
  if (!match) {
    throw new Error('No matching note found');
  }

  const nextBody = input.body === undefined
    ? match.body
    : input.mode === 'append' && match.body.trim()
      ? `${match.body.trim()}\n${input.body.trim()}`
      : input.body.trim();

  const updated: Note = {
    ...match,
    title: input.title?.trim() || match.title,
    body: nextBody,
    color: input.color ? normalizeNoteColor(input.color) : match.color,
    updatedAt: new Date().toISOString(),
  };

  await saveNotes(notes.map(note => note.id === match.id ? updated : note));
  return updated;
}

export function formatNoteResult(action: 'create' | 'update', note: Note): string {
  return `${action === 'create' ? 'Created' : 'Updated'} "${note.title}"`;
}

function sortNotes(notes: Note[]): Note[] {
  return notes
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function titleFromBody(body?: string): string {
  const firstLine = body?.trim().split(/\r?\n/)[0]?.trim() ?? '';
  if (!firstLine) return '';
  return firstLine.length > 48 ? `${firstLine.slice(0, 45)}...` : firstLine;
}

function normalizeNoteColor(color?: string): string {
  if (!color) return NOTE_COLORS[0];
  const normalized = color.trim();
  return NOTE_COLORS.includes(normalized) ? normalized : NOTE_COLORS[0];
}

function findNote(notes: Note[], input: { id?: string; matchTitle?: string; title?: string }): Note | undefined {
  if (input.id) {
    return notes.find(note => note.id === input.id);
  }

  const query = (input.matchTitle ?? input.title ?? '').trim().toLowerCase();
  if (!query) return notes[0];

  return notes.find(note => note.title.toLowerCase() === query)
    ?? notes.find(note => note.title.toLowerCase().includes(query))
    ?? notes.find(note => note.body.toLowerCase().includes(query));
}
