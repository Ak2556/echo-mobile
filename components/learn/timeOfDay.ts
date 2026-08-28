/**
 * Reading a time a tutor typed.
 *
 * Availability is stored as a minute of the day (learn_slots.start_minute), so
 * this parser is the only thing between "18:00" and a correct slot. Kept in a
 * plain module rather than beside the component so it can be tested without
 * loading React Native.
 */

/** "18:30", "18.30", "1830" or "18" → minutes since midnight; null if unreadable. */
export function parseTimeOfDay(input: string): number | null {
  const m = /^(\d{1,2})\s*[:.]?\s*(\d{2})?$/.exec(input.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = m[2] === undefined ? 0 : Number(m[2]);
  // Rejected rather than wrapped: 25:00 quietly becoming 1am the next day is
  // how someone advertises availability they never offered.
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Minutes since midnight → "18:00". */
export function formatTimeOfDay(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
