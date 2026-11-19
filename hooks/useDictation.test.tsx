import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// A fake recogniser: start/stop are spies, and emit() plays the native events
// back through whichever listeners the hook registered.
const listeners = new Map<string, Set<(e: any) => void>>();
const fake = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
  requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
  isRecognitionAvailable: vi.fn(() => true),
}));

vi.mock('../lib/voice/speechRecognition', async () => {
  const react = await import('react');
  let owner: string | null = null;
  return {
    SpeechRecognition: fake,
    canRecognise: () => fake.isRecognitionAvailable(),
    claimSpeech: (o: string) => { owner = o; },
    speechOwnedBy: (o: string) => owner === o,
    useSpeechEvent: (event: string, handler: (e: any) => void) => {
      const ref = react.useRef(handler);
      ref.current = handler;
      react.useEffect(() => {
        const fn = (e: any) => ref.current(e);
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(fn);
        return () => { listeners.get(event)!.delete(fn); };
      }, [event]);
    },
  };
});

const toast = vi.fn();
vi.mock('../components/ui/Toast', () => ({ showToast: (m: string) => toast(m) }));
vi.mock('../lib/mini-apps/tts', () => ({ stopSpeaking: vi.fn() }));
vi.mock('../lib/i18n/i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock('../store/useAppStore', () => ({ useAppStore: (sel: (s: any) => any) => sel({ appLanguage: 'hi' }) }));

import { useDictation } from './useDictation';
import { claimSpeech } from '../lib/voice/speechRecognition';

function emit(event: string, payload?: any) {
  act(() => { listeners.get(event)?.forEach(fn => fn(payload)); });
}

function setup() {
  const onInterim = vi.fn();
  const onFinal = vi.fn();
  const hook = renderHook(() => useDictation({ onInterim, onFinal }));
  return { ...hook, onInterim, onFinal };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.isRecognitionAvailable.mockReturnValue(true);
  fake.requestPermissionsAsync.mockResolvedValue({ granted: true });
});

describe('useDictation', () => {
  it('is unavailable when the phone has no recogniser, so no button is offered', () => {
    fake.isRecognitionAvailable.mockReturnValue(false);
    const { result } = setup();
    expect(result.current.available).toBe(false);
  });

  it('listens in the app language as a regioned tag', async () => {
    const { result } = setup();
    await act(async () => { result.current.toggle(); });
    expect(result.current.listening).toBe(true);
    expect(fake.start).toHaveBeenCalledWith(expect.objectContaining({ lang: 'hi-IN', interimResults: true }));
  });

  it('previews interim words and commits only the final ones', async () => {
    const { result, onInterim, onFinal } = setup();
    await act(async () => { result.current.toggle(); });
    emit('result', { isFinal: false, results: [{ transcript: 'मैं खुद से' }] });
    expect(onInterim).toHaveBeenLastCalledWith('मैं खुद से');
    expect(onFinal).not.toHaveBeenCalled();
    emit('result', { isFinal: true, results: [{ transcript: 'मैं खुद से कहूँगा' }] });
    expect(onFinal).toHaveBeenCalledWith('मैं खुद से कहूँगा');
    expect(onInterim).toHaveBeenLastCalledWith('');
    emit('end');
    expect(result.current.listening).toBe(false);
  });

  it('a second tap stops the recogniser instead of starting another', async () => {
    const { result } = setup();
    await act(async () => { result.current.toggle(); });
    await act(async () => { result.current.toggle(); });
    expect(fake.stop).toHaveBeenCalledTimes(1);
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('ignores words once a voice command has taken the recogniser', async () => {
    const { result, onFinal } = setup();
    await act(async () => { result.current.toggle(); });
    claimSpeech('voice');
    emit('result', { isFinal: true, results: [{ transcript: 'open my notes' }] });
    expect(onFinal).not.toHaveBeenCalled();
    expect(result.current.listening).toBe(false);
  });

  it('says so when the microphone is refused', async () => {
    fake.requestPermissionsAsync.mockResolvedValue({ granted: false });
    const { result } = setup();
    await act(async () => { result.current.toggle(); });
    expect(fake.start).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('voice.micDenied');
  });

  it('stays quiet when nothing was said', async () => {
    const { result } = setup();
    await act(async () => { result.current.toggle(); });
    emit('error', { error: 'no-speech' });
    expect(toast).not.toHaveBeenCalled();
    expect(result.current.listening).toBe(false);
  });

  it('closes the microphone when the screen goes away mid-sentence', async () => {
    const { result, unmount } = setup();
    await act(async () => { result.current.toggle(); });
    unmount();
    expect(fake.abort).toHaveBeenCalledTimes(1);
  });

  it('does not touch events it did not start', () => {
    const { onFinal, onInterim } = setup();
    emit('result', { isFinal: true, results: [{ transcript: 'a voice command' }] });
    expect(onFinal).not.toHaveBeenCalled();
    expect(onInterim).not.toHaveBeenCalled();
  });
});
