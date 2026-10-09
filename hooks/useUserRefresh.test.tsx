import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUserRefresh } from './useUserRefresh';

describe('useUserRefresh', () => {
  it('is false until the user pulls', () => {
    const { result } = renderHook(() => useUserRefresh(() => Promise.resolve()));
    expect(result.current.refreshing).toBe(false);
  });

  it('is true only while the pulled refetch is in flight', async () => {
    let release!: () => void;
    const refetch = () => new Promise<void>(r => { release = r; });
    const { result } = renderHook(() => useUserRefresh(refetch));
    act(() => { result.current.onRefresh(); });
    expect(result.current.refreshing).toBe(true);
    await act(async () => { await Promise.resolve(); release(); await Promise.resolve(); });
    expect(result.current.refreshing).toBe(false);
  });

  it('clears even when the refetch rejects', async () => {
    const { result } = renderHook(() => useUserRefresh(() => Promise.reject(new Error('x'))));
    await act(async () => { result.current.onRefresh(); await new Promise(r => setTimeout(r, 0)); });
    expect(result.current.refreshing).toBe(false);
  });
});
