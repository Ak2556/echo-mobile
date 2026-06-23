import { storage } from '../store/persist';
import type { ChatMessage } from '../types';

const PERSONA_KEY = 'echo-persona/profile';
const MAX_SIGNALS = 90;
const MAX_CONTEXT_CHARS = 2800;
const READY_DAYS = 6;
const READY_SIGNALS = 12;

export type PersonaStage = 'off' | 'observing' | 'calibrating' | 'ready';

export interface PersonaSignal {
  id: string;
  text: string;
  createdAt: string;
}

export interface PersonaProfile {
  enabled: boolean;
  startedAt: string | null;
  updatedAt: string | null;
  signals: PersonaSignal[];
  userNote: string;
  traits: string[];
  topics: string[];
  values: string[];
  responseStyle: string[];
}

export interface PersonaStatus {
  stage: PersonaStage;
  readiness: number;
  daysObserved: number;
  signalCount: number;
}

const DEFAULT_PROFILE: PersonaProfile = {
  enabled: true,
  startedAt: null,
  updatedAt: null,
  signals: [],
  userNote: '',
  traits: [],
  topics: [],
  values: [],
  responseStyle: [],
};

function personaKey(ownerId?: string | null): string {
  const clean = ownerId?.trim();
  return clean ? `${PERSONA_KEY}:${clean}` : `${PERSONA_KEY}:local`;
}

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'being', 'could', 'every',
  'from', 'have', 'just', 'like', 'more', 'need', 'really', 'that', 'their',
  'there', 'these', 'thing', 'think', 'this', 'through', 'want', 'when',
  'where', 'with', 'would', 'your',
]);

function parseProfile(raw: string | undefined): PersonaProfile {
  if (!raw) return DEFAULT_PROFILE;
  try {
    const parsed = JSON.parse(raw) as Partial<PersonaProfile>;
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
      traits: Array.isArray(parsed.traits) ? parsed.traits : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      values: Array.isArray(parsed.values) ? parsed.values : [],
      responseStyle: Array.isArray(parsed.responseStyle) ? parsed.responseStyle : [],
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function loadPersonaProfile(ownerId?: string | null): PersonaProfile {
  return parseProfile(storage.getString(personaKey(ownerId)));
}

export function setPersonaEnabled(enabled: boolean, ownerId?: string | null): PersonaProfile {
  const current = loadPersonaProfile(ownerId);
  const now = new Date().toISOString();
  storage.set(personaKey(ownerId), JSON.stringify({
    ...current,
    enabled,
    startedAt: current.startedAt ?? (enabled ? now : null),
    updatedAt: now,
  }));
  return loadPersonaProfile(ownerId);
}

export function setPersonaUserNote(userNote: string, ownerId?: string | null): PersonaProfile {
  const current = loadPersonaProfile(ownerId);
  const next = summarizePersona({
    ...current,
    userNote: userNote.trim().slice(0, 600),
    updatedAt: new Date().toISOString(),
  });
  storage.set(personaKey(ownerId), JSON.stringify(next));
  return next;
}

export function resetPersonaProfile(ownerId?: string | null): PersonaProfile {
  storage.set(personaKey(ownerId), JSON.stringify({ ...DEFAULT_PROFILE }));
  return loadPersonaProfile(ownerId);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function uniquePush(items: string[], value: string, max: number): string[] {
  const clean = normalizeText(value).replace(/[.!?]+$/g, '');
  if (!clean || clean.length < 3) return items;
  const next = [clean, ...items.filter(item => item.toLowerCase() !== clean.toLowerCase())];
  return next.slice(0, max);
}

function extractPhrase(text: string, patterns: RegExp[]): string[] {
  const out: string[] = [];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const phrase = match?.[1]?.trim();
    if (phrase) out.push(phrase.slice(0, 96));
  }
  return out;
}

function extractTopics(signals: PersonaSignal[]): string[] {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    const words = signal.text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 4 && !STOP_WORDS.has(word));
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function inferResponseStyle(signals: PersonaSignal[]): string[] {
  if (!signals.length) return [];
  const avgLength = signals.reduce((sum, signal) => sum + signal.text.length, 0) / signals.length;
  const questionRate = signals.filter(signal => signal.text.includes('?')).length / signals.length;
  const style: string[] = [];

  style.push(avgLength > 220 ? 'Respond with depth and nuance.' : 'Keep replies concise unless the user asks for depth.');
  if (questionRate > 0.35) style.push('Help sharpen questions before answering.');
  if (signals.some(signal => /\b(plan|steps|build|ship|fix|implement)\b/i.test(signal.text))) {
    style.push('Prefer concrete next steps over abstract advice.');
  }
  if (signals.some(signal => /\b(feel|felt|identity|persona|voice|style)\b/i.test(signal.text))) {
    style.push('Pay attention to tone, identity, and personal voice.');
  }
  return style.slice(0, 5);
}

function summarizePersona(profile: PersonaProfile): PersonaProfile {
  const values = [...profile.values];
  const traits = [...profile.traits];

  for (const signal of profile.signals.slice(0, 40)) {
    for (const phrase of extractPhrase(signal.text, [
      /\bi care about\s+([^.!?\n]+)/i,
      /\bi value\s+([^.!?\n]+)/i,
      /\bit matters to me that\s+([^.!?\n]+)/i,
    ])) {
      values.splice(0, values.length, ...uniquePush(values, phrase, 8));
    }
    for (const phrase of extractPhrase(signal.text, [
      /\bi prefer\s+([^.!?\n]+)/i,
      /\bi like\s+([^.!?\n]+)/i,
      /\bmy style is\s+([^.!?\n]+)/i,
      /\bmy voice is\s+([^.!?\n]+)/i,
    ])) {
      traits.splice(0, traits.length, ...uniquePush(traits, phrase, 8));
    }
  }

  return {
    ...profile,
    traits: traits.slice(0, 8),
    topics: extractTopics(profile.signals),
    values: values.slice(0, 8),
    responseStyle: inferResponseStyle(profile.signals),
  };
}

export function recordPersonaSignal(text: string, createdAt = new Date().toISOString(), ownerId?: string | null): PersonaProfile {
  const clean = normalizeText(text);
  const current = loadPersonaProfile(ownerId);
  if (!current.enabled || clean.length < 12) return current;

  const signal: PersonaSignal = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: clean.slice(0, 360),
    createdAt,
  };
  const next = summarizePersona({
    ...current,
    startedAt: current.startedAt ?? createdAt,
    updatedAt: createdAt,
    signals: [signal, ...current.signals].slice(0, MAX_SIGNALS),
  });
  storage.set(personaKey(ownerId), JSON.stringify(next));
  return next;
}

export function syncPersonaFromMessages(messagesBySession: Record<string, ChatMessage[]>, ownerId?: string | null): PersonaProfile {
  const current = loadPersonaProfile(ownerId);
  if (!current.enabled) return current;

  const existing = new Set(current.signals.map(signal => `${signal.createdAt}:${signal.text}`));
  let next = current;
  const userMessages = Object.values(messagesBySession)
    .flat()
    .filter(message => message.role === 'user')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const message of userMessages) {
    const clean = normalizeText(message.content);
    const key = `${message.createdAt}:${clean.slice(0, 360)}`;
    if (existing.has(key)) continue;
    next = {
      ...next,
      startedAt: next.startedAt ?? message.createdAt,
      updatedAt: message.createdAt,
      signals: [{ id: message.id, text: clean.slice(0, 360), createdAt: message.createdAt }, ...next.signals].slice(0, MAX_SIGNALS),
    };
    existing.add(key);
  }

  const summarized = summarizePersona(next);
  storage.set(personaKey(ownerId), JSON.stringify(summarized));
  return summarized;
}

export function getPersonaStatus(profile = loadPersonaProfile(), now = new Date()): PersonaStatus {
  if (!profile.enabled) {
    return { stage: 'off', readiness: 0, daysObserved: 0, signalCount: profile.signals.length };
  }
  const started = profile.startedAt ? new Date(profile.startedAt) : now;
  const daysObserved = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 86400000));
  const signalCount = profile.signals.length;
  const readiness = Math.min(100, Math.round((daysObserved / READY_DAYS) * 55 + (signalCount / READY_SIGNALS) * 45));
  const stage: PersonaStage =
    daysObserved >= READY_DAYS && signalCount >= READY_SIGNALS
      ? 'ready'
      : daysObserved >= 3 || signalCount >= 6
        ? 'calibrating'
        : 'observing';

  return { stage, readiness, daysObserved, signalCount };
}

export function buildPersonaPromptContext(profile = loadPersonaProfile()): string | undefined {
  if (!profile.enabled) return undefined;
  const status = getPersonaStatus(profile);
  const lines = [
    `Persona learning status: ${status.stage}; ${status.daysObserved} day(s), ${status.signalCount} signal(s), ${status.readiness}% calibrated.`,
    profile.userNote ? `User-authored persona note: ${profile.userNote}` : '',
    profile.traits.length ? `Observed voice/preferences: ${profile.traits.join('; ')}` : '',
    profile.values.length ? `Observed values: ${profile.values.join('; ')}` : '',
    profile.topics.length ? `Recurring topics: ${profile.topics.join(', ')}` : '',
    profile.responseStyle.length ? `Preferred response style: ${profile.responseStyle.join(' ')}` : '',
  ].filter(Boolean);

  if (lines.length <= 1) return lines[0];
  return lines.join('\n').slice(0, MAX_CONTEXT_CHARS);
}
