import { describe, expect, it } from 'vitest';
import { parseSendMessage } from './parseMessage';

describe('parseSendMessage — the ways people actually say it', () => {
  it('splits "send a message to X saying Y"', () => {
    expect(parseSendMessage("send a message to Kav saying I'm running late")).toEqual({
      recipient: 'Kav',
      text: "I'm running late",
    });
  });

  it('splits "message X Y" without a separator word', () => {
    expect(parseSendMessage('message Kav I will be there at six')).toEqual({
      recipient: 'Kav',
      text: 'I will be there at six',
    });
  });

  it('handles tell and ask', () => {
    expect(parseSendMessage('tell Priya that the meeting moved')).toEqual({
      recipient: 'Priya',
      text: 'the meeting moved',
    });
    expect(parseSendMessage('ask Rahul if he is coming tonight')).toEqual({
      recipient: 'Rahul',
      text: 'he is coming tonight',
    });
  });

  it('handles romanised and Devanagari Hindi', () => {
    expect(parseSendMessage('Kav ko bolo main late hoon')).toEqual({
      recipient: 'Kav',
      text: 'main late hoon',
    });
    expect(parseSendMessage('कव को बोलो मैं लेट हूँ')).toEqual({
      recipient: 'कव',
      text: 'मैं लेट हूँ',
    });
  });

  it('strips leading politeness and an @ on the name', () => {
    expect(parseSendMessage('please message @kav saying hello')).toEqual({
      recipient: 'kav',
      text: 'hello',
    });
  });

  it('drops trailing punctuation the recogniser adds', () => {
    expect(parseSendMessage('tell Kav that I am on my way.')).toEqual({
      recipient: 'Kav',
      text: 'I am on my way',
    });
  });

  it('accepts a two-word name', () => {
    expect(parseSendMessage('message Akash Thakur saying congratulations')).toEqual({
      recipient: 'Akash Thakur',
      text: 'congratulations',
    });
  });
});

describe('parseSendMessage — recipient without a body', () => {
  it('returns the name and an empty body', () => {
    expect(parseSendMessage('message Kav')).toEqual({ recipient: 'Kav', text: '' });
    expect(parseSendMessage('open a chat with Priya')).toEqual({ recipient: 'Priya', text: '' });
  });
});

describe('parseSendMessage — refusing to guess', () => {
  it('returns null when nothing looks like a message', () => {
    expect(parseSendMessage('go home')).toBeNull();
    expect(parseSendMessage('open notes')).toBeNull();
    expect(parseSendMessage('')).toBeNull();
    expect(parseSendMessage('   ')).toBeNull();
  });

  it('rejects a capture too long to be a name', () => {
    // If the split lands wrong the "name" swallows half the sentence. Better to
    // hand the whole thing to the model than message an imaginary person.
    expect(
      parseSendMessage('tell everyone at the office tomorrow morning that we are moving the deadline'),
    ).toBeNull();
  });

  it('refuses pronouns and self-reference as recipients', () => {
    for (const p of ['message me hello', 'tell them that it is done', 'message someone hi']) {
      expect(parseSendMessage(p), p).toBeNull();
    }
  });
});
