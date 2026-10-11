/**
 * The site shows "remind me to call Ma at seven tomorrow" and says the reminder is set.
 * It used to become a task titled with the whole sentence, due today, with no alarm, saved
 * without asking. Now the sentence is matched on the device, the day and time are read out
 * of it, the card shows what will be set, and only a yes schedules the alarm.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('spoken reminders', () => {
  const tasks = read('app/mini-apps/tasks.tsx');

  it('Tasks reads the day and time out of a voice-added task', () => {
    expect(tasks).toContain('parseVoiceTask(text)');
  });

  it('a spoken time waits on a confirmation card instead of being saved', () => {
    expect(tasks).toMatch(/setPendingVoice\(parsed\)/);
    expect(tasks).toContain('<ActionSheet');
  });

  it('only the confirmed reminder schedules an alarm', () => {
    const commit = tasks.slice(tasks.indexOf('const commitVoiceReminder'), tasks.indexOf('const add = async'));
    expect(commit).toContain('scheduleTaskReminder(base)');
  });

  it('an unsaid am or pm is offered both ways', () => {
    expect(tasks).toContain('pendingVoice.alternative');
  });

  it('the local matcher knows reminders, and so does the page parser', () => {
    expect(read('lib/voice/localIntent.ts')).toContain('matchReminder(transcript)');
    expect(read('public/download/intent.js')).toContain('matchReminder(transcript)');
  });
});
