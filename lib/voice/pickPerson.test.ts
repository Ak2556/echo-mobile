import { describe, expect, it } from 'vitest';
import { pickPerson, type PersonHit } from './pickPerson';

const p = (id: string, username: string, display_name: string): PersonHit => ({
  id,
  username,
  display_name,
});

describe('pickPerson — clear winners', () => {
  it('takes an exact handle over everything else', () => {
    const hits = [p('1', 'kavya', 'Kavya Singh'), p('2', 'kav', 'Kav Sharma')];
    const r = pickPerson(hits, 'kav');
    expect(r.kind).toBe('match');
    expect(r.kind === 'match' && r.person.id).toBe('2');
  });

  it('matches an exact display name', () => {
    const hits = [p('1', 'ks99', 'Kav Sharma'), p('2', 'rahul', 'Rahul Verma')];
    const r = pickPerson(hits, 'Kav Sharma');
    expect(r.kind === 'match' && r.person.id).toBe('1');
  });

  it('matches a first name', () => {
    // People say "message Priya", not "message priya_verma_1993".
    const hits = [p('1', 'priya_v', 'Priya Verma'), p('2', 'rahul', 'Rahul Verma')];
    const r = pickPerson(hits, 'Priya');
    expect(r.kind === 'match' && r.person.id).toBe('1');
  });

  it('is case and @ insensitive', () => {
    const hits = [p('1', 'kav', 'Kav Sharma')];
    expect(pickPerson(hits, '@KAV').kind).toBe('match');
  });
});

describe('pickPerson — refusing to guess', () => {
  it('reports ambiguity rather than picking one', () => {
    // The whole point. Two people called Priya, one word spoken: asking is the
    // only safe answer, because a wrong pick messages a stranger.
    const hits = [p('1', 'priya_v', 'Priya Verma'), p('2', 'priya_s', 'Priya Sharma')];
    const r = pickPerson(hits, 'Priya');
    expect(r.kind).toBe('ambiguous');
    expect(r.kind === 'ambiguous' && r.candidates).toHaveLength(2);
  });

  it('returns none when nothing is close', () => {
    const hits = [p('1', 'kav', 'Kav Sharma')];
    expect(pickPerson(hits, 'Bartholomew').kind).toBe('none');
  });

  it('returns none for empty input', () => {
    expect(pickPerson([], 'kav').kind).toBe('none');
    expect(pickPerson([p('1', 'kav', 'Kav')], '').kind).toBe('none');
  });

  it('prefers the stronger match instead of calling it ambiguous', () => {
    // An exact handle beats a first-name match, so this is not a tie.
    const hits = [p('1', 'kav', 'Kav Sharma'), p('2', 'kavi', 'Kav Something')];
    const r = pickPerson(hits, 'kav');
    expect(r.kind).toBe('match');
    expect(r.kind === 'match' && r.person.id).toBe('1');
  });

  it('never returns a match below the coincidence threshold', () => {
    // "a" appears in almost every name; that is not a match.
    const hits = [p('1', 'alexander', 'Alexander Graham')];
    const r = pickPerson(hits, 'zzz');
    expect(r.kind).toBe('none');
  });
});
