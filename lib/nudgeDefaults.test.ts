import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
// vi.mock is hoisted above imports, so the slice still sees the mocked persist.
import { createSettingsSlice } from '../store/slices/settingsSlice';

vi.mock('../store/persist', () => ({
  persistGet: <T,>(_key: string, def: T): T => def,
  persistSet: () => {},
  storage: { getString: () => undefined, set: () => {}, delete: () => {} },
}));


const src = (p: string) => readFileSync(p, 'utf8');

// 2026-09-30: personalized nudges reached 1 of 48 accounts while opt-in. The
// owner chose on-by-default with a one-tap off switch.
describe('personalized nudges are on by default', () => {
  it('for someone who has not chosen', () => {
    expect(createSettingsSlice(() => {}, () => ({})).personalizedNotifications).toBe(true);
  });

  it('in the database, for new and existing accounts', () => {
    const m = src('supabase/migrations/20260930130000_personalized_notifications_default_on.sql');
    expect(m).toMatch(/alter column personalized_notifications set default true/);
    expect(m).toMatch(/set personalized_notifications = true/);
  });

  it('the privacy policy says so and says how to turn it off', () => {
    const p = src('constants/legal/privacyPolicy.ts');
    expect(p).toMatch(/\*\*Notification timing\*\*[^\n]*on by default[^\n]*Settings → Privacy → Personalized Notifications/);
    expect(p).toMatch(/PRIVACY_VERSION = '3\.3'/);
  });

  it('the first nudge a person receives says where the switch is', () => {
    const f = src('supabase/functions/personalized-fanout/index.ts');
    expect(f).toMatch(/withFirstNudgeNotice\(/);
    expect(f).toMatch(/Turn these off anytime in Settings → Privacy\./);
  });
});

// Nudges go to people who did nothing to trigger them, so a line may invite but
// must not report an event that may not have happened.
describe('nudge copy is truthful', () => {
  const fabricated = /stalking|waiting for your reply|left them on read|therapy|selling exactly|clout|poking around|getting visitors|have gossip|unread limbo|New listings dropped|restocked|just got listed|Fresh finds just appeared|typing bubble gave up|Everyone’s answering but you/i;

  it('server fan-out copy', () => {
    // Only the copy table: the comment above it quotes the old lines as examples.
    const f = src('supabase/functions/personalized-fanout/index.ts');
    const table = f.slice(f.indexOf('const SURFACE_COPY'), f.indexOf('/** A user claimed'));
    expect(table.length).toBeGreaterThan(200);
    expect(table).not.toMatch(fabricated);
  });

  it('on-device copy', () => {
    expect(src('lib/nudgeContent.ts')).not.toMatch(fabricated);
  });
});
