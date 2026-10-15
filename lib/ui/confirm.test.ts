import { beforeEach, describe, expect, it } from 'vitest';
import { confirmAction, useConfirmStore } from './confirm';

const ask = () => confirmAction({ title: 'Delete note?', confirmLabel: 'Delete', destructive: true });

describe('confirmAction', () => {
  beforeEach(() => useConfirmStore.setState({ pending: null }));

  it('has nothing pending until asked', () => {
    expect(useConfirmStore.getState().pending).toBeNull();
  });

  it('puts the question up and resolves true on the action', async () => {
    const answer = ask();
    expect(useConfirmStore.getState().pending?.options.title).toBe('Delete note?');
    useConfirmStore.getState().settle(true);
    await expect(answer).resolves.toBe(true);
    expect(useConfirmStore.getState().pending).toBeNull();
  });

  it('resolves false on cancel', async () => {
    const answer = ask();
    useConfirmStore.getState().settle(false);
    await expect(answer).resolves.toBe(false);
  });

  it('answers the first question with false when a second is asked', async () => {
    const first = ask();
    const second = confirmAction({ title: 'Sign out?', confirmLabel: 'Sign out' });
    await expect(first).resolves.toBe(false);
    expect(useConfirmStore.getState().pending?.options.title).toBe('Sign out?');
    useConfirmStore.getState().settle(true);
    await expect(second).resolves.toBe(true);
  });

  it('ignores a settle with nothing pending', () => {
    expect(() => useConfirmStore.getState().settle(true)).not.toThrow();
  });
});
