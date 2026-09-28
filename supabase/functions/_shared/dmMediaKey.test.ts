import { describe, expect, it } from 'vitest';
import { dmMediaKey } from './dmMediaKey';

const SENDER = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';
const CONV = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('dmMediaKey', () => {
  it('accepts the sender’s own key in every stored form', () => {
    const key = `${SENDER}/${CONV}/1700000000.jpg`;
    expect(dmMediaKey(key, SENDER)).toBe(key);
    expect(dmMediaKey(`/${key}`, SENDER)).toBe(key);
    expect(dmMediaKey(`https://x.supabase.co/storage/v1/object/public/dm-media/${key}`, SENDER)).toBe(key);
    expect(dmMediaKey(`https://x.supabase.co/storage/v1/object/sign/dm-media/${key}?token=t`, SENDER)).toBe(key);
    expect(dmMediaKey(`https://media.example.workers.dev/dm-media/${key}`, SENDER)).toBe(key);
  });

  it('refuses a key in someone else’s folder (a pointer to a victim’s file)', () => {
    expect(dmMediaKey(`${OTHER}/${CONV}/1.jpg`, SENDER)).toBeNull();
    expect(dmMediaKey(`https://x.supabase.co/storage/v1/object/public/dm-media/${OTHER}/1.jpg`, SENDER)).toBeNull();
  });

  it('refuses traversal, bare folders, unknown hosts and junk', () => {
    expect(dmMediaKey(`${SENDER}/../${OTHER}/1.jpg`, SENDER)).toBeNull();
    expect(dmMediaKey(`${SENDER}/`, SENDER)).toBeNull();
    expect(dmMediaKey(`https://evil.example/${SENDER}/1.jpg`, SENDER)).toBeNull();
    expect(dmMediaKey(null, SENDER)).toBeNull();
    expect(dmMediaKey(`${SENDER}/1.jpg`, 'not-a-uuid')).toBeNull();
  });
});
