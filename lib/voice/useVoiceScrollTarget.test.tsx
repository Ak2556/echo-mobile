import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceScrollTarget } from './useVoiceScrollTarget';

const layout = (height: number) => ({ nativeEvent: { layout: { height } } }) as never;
const scrolled = (y: number) => ({ nativeEvent: { contentOffset: { y } } }) as never;

describe('useVoiceScrollTarget', () => {
  it('advances by a screenful rather than jumping to the end', () => {
    // The behaviour it replaces sent the list to offset 100000, which loses a
    // voice user their place entirely and gives them no way to describe where
    // they ended up.
    const scrollToOffset = vi.fn();
    const { result } = renderHook(() => useVoiceScrollTarget());
    (result.current.ref as { current: unknown }).current = { scrollToOffset };

    act(() => result.current.onLayout(layout(800)));
    act(() => result.current.scroll('down'));

    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 680, animated: true });
  });

  it('keeps going from where it left off across repeated commands', () => {
    // onScroll fires asynchronously, so two quick "scroll down"s must advance
    // two pages rather than the same one twice.
    const scrollToOffset = vi.fn();
    const { result } = renderHook(() => useVoiceScrollTarget());
    (result.current.ref as { current: unknown }).current = { scrollToOffset };

    act(() => result.current.onLayout(layout(800)));
    act(() => result.current.scroll('down'));
    act(() => result.current.scroll('down'));

    expect(scrollToOffset).toHaveBeenLastCalledWith({ offset: 1360, animated: true });
  });

  it('never scrolls above the top', () => {
    const scrollToOffset = vi.fn();
    const { result } = renderHook(() => useVoiceScrollTarget());
    (result.current.ref as { current: unknown }).current = { scrollToOffset };

    act(() => result.current.onLayout(layout(800)));
    act(() => result.current.scroll('up'));

    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
  });

  it('follows the real position reported by the list', () => {
    const scrollToOffset = vi.fn();
    const { result } = renderHook(() => useVoiceScrollTarget());
    (result.current.ref as { current: unknown }).current = { scrollToOffset };

    act(() => result.current.onLayout(layout(800)));
    act(() => result.current.onScroll(scrolled(2000)));
    act(() => result.current.scroll('up'));

    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 1320, animated: true });
  });

  it('drives a plain ScrollView, which has no scrollToOffset', () => {
    const scrollTo = vi.fn();
    const { result } = renderHook(() => useVoiceScrollTarget());
    (result.current.ref as { current: unknown }).current = { scrollTo };

    act(() => result.current.onLayout(layout(1000)));
    act(() => result.current.scroll('down'));

    expect(scrollTo).toHaveBeenCalledWith({ y: 850, animated: true });
  });

  it('does nothing when the list is not mounted', () => {
    const { result } = renderHook(() => useVoiceScrollTarget());
    expect(() => act(() => result.current.scroll('down'))).not.toThrow();
  });
});
