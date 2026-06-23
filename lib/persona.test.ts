import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildPersonaPromptContext,
  getPersonaStatus,
  loadPersonaProfile,
  recordPersonaSignal,
  resetPersonaProfile,
  setPersonaEnabled,
  setPersonaUserNote,
} from './persona';

describe('persona learning', () => {
  beforeEach(() => {
    resetPersonaProfile();
  });

  it('records user signals and builds a prompt context', () => {
    recordPersonaSignal('I prefer direct language and concrete next steps.');
    recordPersonaSignal('I care about privacy and practical product quality.');

    const context = buildPersonaPromptContext();

    expect(context).toContain('Persona learning status');
    expect(context).toContain('direct language and concrete next steps');
    expect(context).toContain('privacy and practical product quality');
  });

  it('does not build prompt context while disabled', () => {
    setPersonaEnabled(false);
    recordPersonaSignal('I prefer concise answers.');

    expect(buildPersonaPromptContext()).toBeUndefined();
  });

  it('marks persona ready after the learning window and enough signals', () => {
    const started = new Date('2026-06-01T00:00:00.000Z');
    for (let i = 0; i < 12; i += 1) {
      recordPersonaSignal(`I prefer practical detail number ${i}.`, new Date(started.getTime() + i * 1000).toISOString());
    }

    const status = getPersonaStatus(undefined, new Date('2026-06-08T00:00:00.000Z'));

    expect(status.stage).toBe('ready');
    expect(status.readiness).toBe(100);
  });

  it('includes direct user-authored persona notes', () => {
    setPersonaUserNote('Write in my voice: calm, precise, and low-drama.');

    expect(buildPersonaPromptContext()).toContain('calm, precise, and low-drama');
  });

  it('keeps persona profiles isolated per user', () => {
    resetPersonaProfile('user-a');
    resetPersonaProfile('user-b');

    recordPersonaSignal('I prefer investor-style product arguments.', new Date().toISOString(), 'user-a');
    recordPersonaSignal('I prefer poetic and reflective language.', new Date().toISOString(), 'user-b');

    const userA = buildPersonaPromptContext(undefined);
    const scopedA = buildPersonaPromptContext(loadPersonaProfile('user-a'));
    const scopedB = buildPersonaPromptContext(loadPersonaProfile('user-b'));

    expect(userA).not.toContain('investor-style');
    expect(scopedA).toContain('investor-style product arguments');
    expect(scopedA).not.toContain('poetic and reflective language');
    expect(scopedB).toContain('poetic and reflective language');
    expect(scopedB).not.toContain('investor-style product arguments');
  });
});
