import { localDayKey } from '../core/localDate';

/**
 * Turns a spoken task into a title, a day and, when one was said, a time.
 *
 * "remind me to call Ma at seven tomorrow" used to become a task whose title was the
 * whole sentence, due today, with no alarm. This pulls the time and day out of the words
 * so the task can carry a real reminder.
 *
 * English, romanised Hindi and Devanagari. A time said without am or pm is a guess, so the
 * result carries the other reading too and the confirmation card offers it.
 */

export interface AlarmTime { hour: number; minute: number }

export interface VoiceTask {
  title: string;
  /** Local day, "YYYY-MM-DD". */
  due: string;
  /** Set only when a time of day was spoken. */
  alarmTime: AlarmTime | null;
  /** The other am/pm reading when the speaker did not say which. */
  alternative: AlarmTime | null;
  /** A day was named ("tomorrow", "kal"). */
  hadDay: boolean;
}

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

const HOUR_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, cheh: 6, saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12,
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'छः': 6, 'छे': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10, 'ग्यारह': 11, 'बारह': 12,
};
const WORD = Object.keys(HOUR_WORDS).sort((a, b) => b.length - a.length).join('|');

const TOMORROW = /(?:^|\s)(?:day after tomorrow|parso|परसों|tomorrow|tmrw|kal|कल)(?=\s|$)/i;
const DAY_AFTER = /(?:^|\s)(?:day after tomorrow|parso|परसों)(?=\s|$)/i;
const TODAY = /(?:^|\s)(?:today|tonight|aaj|आज)(?=\s|$)/i;
const MORNING = /(?:^|\s)(?:morning|subah|सुबह)(?=\s|$)/i;
const AFTERNOON = /(?:^|\s)(?:afternoon|dopahar|दोपहर)(?=\s|$)/i;
const EVENING = /(?:^|\s)(?:evening|tonight|night|shaam|शाम|raat|रात)(?=\s|$)/i;

function ascii(text: string): string {
  return text.replace(/[०-९]/g, d => String(DEVANAGARI_DIGITS.indexOf(d)));
}

function hourFrom(token: string): number | null {
  const t = token.toLowerCase();
  if (/^\d{1,2}$/.test(t)) return parseInt(t, 10);
  return HOUR_WORDS[t] ?? null;
}

interface TimeHit { hour: number; minute: number; meridiem: 'am' | 'pm' | null; match: string }

function findTime(text: string): TimeHit | null {
  // 7 pm, 7:30 pm, 7.30pm
  let m = text.match(/(?:^|\s)(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\s|$|[.,])/i);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 1 && h <= 12) return { hour: h, minute: m[2] ? parseInt(m[2], 10) : 0, meridiem: /^a/i.test(m[3]) ? 'am' : 'pm', match: m[0] };
  }
  // at 7, at 19:30, at 7:30
  m = text.match(/(?:^|\s)at\s+(\d{1,2})(?::(\d{2}))?(?=\s|$|[.,])/i);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 0 && h <= 23) return { hour: h, minute: m[2] ? parseInt(m[2], 10) : 0, meridiem: null, match: m[0] };
  }
  // at seven, at seven thirty
  m = text.match(new RegExp('(?:^|\\s)at\\s+(' + WORD + ')(?:\\s+(thirty|fifteen|forty[ -]five))?(?=\\s|$|[.,])', 'i'));
  if (m) {
    const h = hourFrom(m[1]);
    if (h) return { hour: h, minute: m[2] ? (/thirty/i.test(m[2]) ? 30 : /fifteen/i.test(m[2]) ? 15 : 45) : 0, meridiem: null, match: m[0] };
  }
  // 7 baje, सात बजे, saat baje
  m = text.match(new RegExp('(?:^|\\s)(\\d{1,2}|' + WORD + ')\\s*(?:baje|bje|बजे)(?=\\s|$|[.,])', 'i'));
  if (m) {
    const h = hourFrom(m[1]);
    if (h) return { hour: h, minute: 0, meridiem: null, match: m[0] };
  }
  return null;
}

function to24(hour: number, meridiem: 'am' | 'pm'): number {
  if (meridiem === 'am') return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12;
}

function cleanTitle(text: string): string {
  let t = text.replace(/\s+/g, ' ').trim()
    .replace(/^(?:please\s+)?(?:remind me|set (?:a )?reminder)(?:\s+(?:to|that|for|about))?\s+/i, '')
    .replace(/^(?:mujhe|मुझे)\s+/i, '')
    .replace(/\s+(?:yaad\s+dila(?:na|o|do|dena)|याद\s+दिला(?:ना|ओ|दो|देना))\s*$/i, '')
    .replace(/^(?:to|that)\s+/i, '');
  t = t.replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '');
  t = t.replace(/\s+(?:at|on|by|for|को)$/i, '').trim();
  return t;
}

export function parseVoiceTask(raw: string, now: Date = new Date()): VoiceTask {
  const original = raw.trim();
  let text = ' ' + ascii(original) + ' ';

  const dayOffset = DAY_AFTER.test(text) ? 2 : TOMORROW.test(text) ? 1 : 0;
  const hadDay = dayOffset > 0 || TODAY.test(text);

  const hit = findTime(text);
  let alarm: AlarmTime | null = null;
  let alternative: AlarmTime | null = null;

  if (hit) {
    let hour: number;
    if (hit.hour >= 13 || hit.hour === 0) {
      hour = hit.hour;
    } else if (hit.meridiem) {
      hour = to24(hit.hour, hit.meridiem);
    } else if (MORNING.test(text)) {
      hour = to24(hit.hour, 'am');
    } else if (EVENING.test(text) || AFTERNOON.test(text)) {
      hour = to24(hit.hour, 'pm');
    } else if (hit.hour === 12) {
      hour = 12;
    } else {
      // Said without am or pm. For today, the next one that is still ahead; otherwise a
      // sensible default (1 to 5 reads as afternoon, 6 to 11 as morning). The other reading
      // is offered either way.
      const am = to24(hit.hour, 'am');
      const pm = to24(hit.hour, 'pm');
      const at = (h: number) => { const d = new Date(now); d.setHours(h, hit.minute, 0, 0); return d.getTime() > now.getTime(); };
      if (dayOffset === 0) hour = at(am) ? am : pm;
      else hour = hit.hour <= 5 ? pm : am;
      const other = hour === am ? pm : am;
      alternative = { hour: other, minute: hit.minute };
    }
    alarm = { hour, minute: hit.minute };
    text = text.replace(hit.match, ' ');
  }

  let due = new Date(now);
  due.setDate(due.getDate() + dayOffset);
  // A time already past today, with no day named, means the next one.
  if (alarm && dayOffset === 0 && !hadDay) {
    const t = new Date(now);
    t.setHours(alarm.hour, alarm.minute, 0, 0);
    if (t.getTime() <= now.getTime()) due.setDate(due.getDate() + 1);
  }

  for (const re of [DAY_AFTER, TOMORROW, TODAY, MORNING, AFTERNOON, EVENING]) text = text.replace(re, ' ');
  const title = cleanTitle(text);
  const finalTitle = title ? title.charAt(0).toUpperCase() + title.slice(1) : original;

  return { title: finalTitle, due: localDayKey(due), alarmTime: alarm, alternative, hadDay };
}
