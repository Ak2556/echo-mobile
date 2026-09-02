import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore, showToast } from './Toast';

describe('showToast', () => {
  beforeEach(() => useToastStore.getState().hide());

  it('keeps the existing two-argument call working', () => {
    showToast('Saved', 'done');
    const s = useToastStore.getState();
    expect(s.message).toBe('Saved');
    expect(s.icon).toBe('done');
    expect(s.action).toBeNull();
  });

  it('stores an action when one is given', () => {
    let ran = false;
    showToast('Logged ₹80 to Expenses', '', { label: 'Undo', onPress: () => { ran = true; } });
    const s = useToastStore.getState();
    expect(s.action?.label).toBe('Undo');
    s.action?.onPress();
    expect(ran).toBe(true);
  });

  it('clears the action on hide, so it cannot leak into the next toast', () => {
    showToast('One', '', { label: 'Undo', onPress: () => {} });
    useToastStore.getState().hide();
    showToast('Two');
    expect(useToastStore.getState().action).toBeNull();
  });
});
