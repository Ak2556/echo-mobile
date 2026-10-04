import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
  },
}));

import { clearMemory, forgetPreference, loadMemory, rememberPreference, updatePreference } from './aiMemory';

describe('aiMemory', () => {
  beforeEach(() => store.clear());

  it('adds, edits and deletes a memory', async () => {
    const added = await rememberPreference({ key: 'Currency', value: 'INR' });
    expect(await loadMemory()).toHaveLength(1);

    await updatePreference({ id: added.id, key: 'Currency', value: 'USD' });
    const [edited] = await loadMemory();
    expect(edited).toMatchObject({ id: added.id, value: 'USD', createdAt: added.createdAt });

    await forgetPreference({ id: added.id });
    expect(await loadMemory()).toEqual([]);
  });

  it('remembering an existing key overwrites instead of duplicating', async () => {
    await rememberPreference({ key: 'Tone', value: 'formal' });
    await rememberPreference({ key: 'tone', value: 'casual' });
    const items = await loadMemory();
    expect(items).toHaveLength(1);
    expect(items[0].value).toBe('casual');
  });

  it('rejects blank keys and values, and unknown ids', async () => {
    await expect(rememberPreference({ key: ' ', value: 'x' })).rejects.toThrow();
    const m = await rememberPreference({ key: 'a', value: 'b' });
    await expect(updatePreference({ id: m.id, key: 'a', value: '' })).rejects.toThrow();
    await expect(forgetPreference({ id: 'nope' })).rejects.toThrow('No matching memory');
  });

  it('clearMemory reports how many it removed', async () => {
    await rememberPreference({ key: 'a', value: '1' });
    await rememberPreference({ key: 'b', value: '2' });
    expect(await clearMemory()).toBe(2);
    expect(await loadMemory()).toEqual([]);
  });
});
