import { describe, expect, it } from 'vitest';
import { resolveTier, demote } from './tier.js';

const capable = {
  reducedMotion: false, hasWebGL: true, saveData: false,
  effectiveType: '4g', deviceMemory: 8, hardwareConcurrency: 8,
};

describe('tier resolution', () => {
  it('gives a capable device the full scene', () => {
    expect(resolveTier(capable)).toBe('full');
  });

  it('always posters when reduced motion is requested', () => {
    expect(resolveTier({ ...capable, reducedMotion: true })).toBe('poster');
  });

  it('reduced motion beats a forced tier — accessibility is not overridable', () => {
    expect(resolveTier({ ...capable, reducedMotion: true, forced: 'full' })).toBe('poster');
  });

  it('posters without a WebGL context', () => {
    expect(resolveTier({ ...capable, hasWebGL: false })).toBe('poster');
  });

  it('posters when the visitor asked to save data', () => {
    expect(resolveTier({ ...capable, saveData: true })).toBe('poster');
  });

  it.each(['2g', 'slow-2g'])('posters on %s', t => {
    expect(resolveTier({ ...capable, effectiveType: t })).toBe('poster');
  });

  it('reduces on low memory', () => {
    expect(resolveTier({ ...capable, deviceMemory: 4 })).toBe('reduced');
  });

  it('reduces on few cores', () => {
    expect(resolveTier({ ...capable, hardwareConcurrency: 4 })).toBe('reduced');
  });

  it('treats missing hints as capable rather than assuming the worst', () => {
    // Safari reports neither deviceMemory nor effectiveType. Defaulting those
    // to "weak" would poster every iPhone, which are the fastest devices here.
    expect(resolveTier({ reducedMotion: false, hasWebGL: true, saveData: false })).toBe('full');
  });

  it('honours a forced tier otherwise, for screenshots and debugging', () => {
    expect(resolveTier({ ...capable, forced: 'poster' })).toBe('poster');
    expect(resolveTier({ ...capable, forced: 'reduced' })).toBe('reduced');
  });

  it('ignores a forced tier that is not a real tier', () => {
    expect(resolveTier({ ...capable, forced: 'ultra' })).toBe('full');
  });

  it('demotes one step at a time and stops at poster', () => {
    expect(demote('full')).toBe('reduced');
    expect(demote('reduced')).toBe('poster');
    expect(demote('poster')).toBe('poster');
  });

  it('treats an unknown tier as poster rather than crashing', () => {
    expect(demote('nonsense')).toBe('poster');
  });
});
