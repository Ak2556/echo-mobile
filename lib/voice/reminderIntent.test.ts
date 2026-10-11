import { describe, expect, it } from 'vitest';
import { matchReminder } from './reminderIntent';
import { matchLocalIntent } from './localIntent';

describe('matchReminder', () => {
  it.each([
    'remind me to call Ma at seven tomorrow',
    'Remind me to take the tablets at 8 pm.',
    'please remind me that the rent is due tomorrow',
    'set a reminder for the dentist at 5 pm',
    'mujhe kal subah 7 baje doodh lena yaad dilana',
    'कल शाम सात बजे मां को फोन करना याद दिलाना',
    'मुझे आज रात नौ बजे दवाई याद दिलाओ',
  ])('matches "%s"', (phrase) => {
    expect(matchReminder(phrase)).not.toBeNull();
  });

  it.each([
    'remind me',
    'reminder',
    'open reminders',
    'post that I am heading home',
    'go home',
    'yaad dilana',
  ])('does not match "%s"', (phrase) => {
    expect(matchReminder(phrase)).toBeNull();
  });
});

describe('matchLocalIntent: reminders', () => {
  it('sends the whole sentence to Tasks as an add', () => {
    const r = matchLocalIntent('remind me to call Ma at seven tomorrow', 'en');
    expect(r).toMatchObject({ intent: 'open_mini_app', args: { app: 'tasks', action: 'add', value: 'remind me to call Ma at seven tomorrow' } });
  });

  it('does not disturb the commands that already worked', () => {
    expect(matchLocalIntent('go home', 'en')).toMatchObject({ intent: 'navigate' });
    expect(matchLocalIntent('open my notes', 'en')).toMatchObject({ intent: 'open_mini_app' });
  });
});
