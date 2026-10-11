import { describe, expect, it } from 'vitest';
import { parseVoiceTask } from './voiceTask';

// Sunday 11 October 2026, 10:00 local.
const now = new Date(2026, 9, 11, 10, 0, 0);

describe('parseVoiceTask: a time and a day', () => {
  it('"call Ma at seven tomorrow" is tomorrow at seven, with the other reading offered', () => {
    const t = parseVoiceTask('remind me to call Ma at seven tomorrow', now);
    expect(t.title).toBe('Call Ma');
    expect(t.due).toBe('2026-10-12');
    expect(t.alarmTime).toEqual({ hour: 7, minute: 0 });
    expect(t.alternative).toEqual({ hour: 19, minute: 0 });
    expect(t.hadDay).toBe(true);
  });

  it('takes an explicit pm without offering an alternative', () => {
    const t = parseVoiceTask('take the tablets at 8 pm', now);
    expect(t.title).toBe('Take the tablets');
    expect(t.alarmTime).toEqual({ hour: 20, minute: 0 });
    expect(t.alternative).toBeNull();
    expect(t.due).toBe('2026-10-11');
  });

  it('reads minutes', () => {
    expect(parseVoiceTask('meeting at 9:30 am', now).alarmTime).toEqual({ hour: 9, minute: 30 });
    expect(parseVoiceTask('standup at seven thirty', now).alarmTime).toMatchObject({ minute: 30 });
  });

  it('reads 24-hour times', () => {
    const t = parseVoiceTask('train at 19:15', now);
    expect(t.alarmTime).toEqual({ hour: 19, minute: 15 });
    expect(t.alternative).toBeNull();
  });

  it('uses the part of the day when it is said', () => {
    expect(parseVoiceTask('gym at 6 in the morning', now).alarmTime).toEqual({ hour: 6, minute: 0 });
    expect(parseVoiceTask('call Papa tomorrow evening at 7', now).alarmTime).toEqual({ hour: 19, minute: 0 });
  });

  it('for today, picks the next one still ahead', () => {
    // 10:00 now: "at 9" has passed as am, so it is 9 pm today.
    const t = parseVoiceTask('submit the form at 9', now);
    expect(t.alarmTime).toEqual({ hour: 21, minute: 0 });
    expect(t.due).toBe('2026-10-11');
  });

  it('rolls a time that has already passed to tomorrow when no day was named', () => {
    const t = parseVoiceTask('water the plants at 8 am', now);
    expect(t.alarmTime).toEqual({ hour: 8, minute: 0 });
    expect(t.due).toBe('2026-10-12');
  });
});

describe('parseVoiceTask: Hindi and Hinglish', () => {
  it('romanised: "kal subah 7 baje doodh lena"', () => {
    const t = parseVoiceTask('kal subah 7 baje doodh lena', now);
    expect(t.title).toBe('Doodh lena');
    expect(t.due).toBe('2026-10-12');
    expect(t.alarmTime).toEqual({ hour: 7, minute: 0 });
  });

  it('Devanagari: "कल शाम सात बजे मां को फोन करना"', () => {
    const t = parseVoiceTask('कल शाम सात बजे मां को फोन करना', now);
    expect(t.title).toBe('मां को फोन करना');
    expect(t.due).toBe('2026-10-12');
    expect(t.alarmTime).toEqual({ hour: 19, minute: 0 });
  });

  it('reads Devanagari digits', () => {
    expect(parseVoiceTask('आज रात ९ बजे दवाई', now).alarmTime).toEqual({ hour: 21, minute: 0 });
  });

  it('strips the Hindi reminder wording', () => {
    const t = parseVoiceTask('मुझे कल सुबह आठ बजे जिम जाना याद दिलाना', now);
    expect(t.title).toBe('जिम जाना');
    expect(t.alarmTime).toEqual({ hour: 8, minute: 0 });
  });
});

describe('parseVoiceTask: no time', () => {
  it('a plain task is due today with no alarm', () => {
    const t = parseVoiceTask('buy milk', now);
    expect(t.title).toBe('Buy milk');
    expect(t.due).toBe('2026-10-11');
    expect(t.alarmTime).toBeNull();
  });

  it('a day without a time is due that day with no alarm', () => {
    const t = parseVoiceTask('pay rent tomorrow', now);
    expect(t.title).toBe('Pay rent');
    expect(t.due).toBe('2026-10-12');
    expect(t.alarmTime).toBeNull();
  });

  it('day after tomorrow', () => {
    expect(parseVoiceTask('renew the passport day after tomorrow', now).due).toBe('2026-10-13');
  });

  it('keeps the whole sentence if stripping leaves nothing', () => {
    expect(parseVoiceTask('tomorrow', now).title).toBe('tomorrow');
  });
});
