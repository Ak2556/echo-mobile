/**
 * lib/expoVideoShim.js
 *
 * Pure-JS mock of expo-video for environments where the native module isn't
 * available (e.g. Expo Go). Metro is configured in metro.config.js to redirect
 * ALL `expo-video` imports here.
 *
 * Behaviour:
 *   - useVideoPlayer  → returns a no-op player that fires statusChange:'error'
 *                       after 100 ms so components fall back to their own error UIs.
 *   - VideoView       → renders a plain black View; the error UI overlays it.
 */

'use strict';

const React = require('react');
const { View } = require('react-native');

function useVideoPlayer(source, setup) {
  const playerRef = React.useRef(null);

  if (!playerRef.current) {
    const listeners = {};

    const player = {
      muted: false,
      loop: false,
      playbackRate: 1,
      timeUpdateEventInterval: 0,
      _currentTime: 0,
      _duration: 0,

      get currentTime() { return this._currentTime; },
      set currentTime(v) { this._currentTime = v; },
      get duration() { return this._duration; },

      play() {},
      pause() {},
      replay() {},

      addListener(event, cb) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
        return {
          remove() {
            if (listeners[event]) {
              listeners[event] = listeners[event].filter(x => x !== cb);
            }
          },
        };
      },

      _emit(event, data) {
        (listeners[event] || []).forEach(cb => cb(data));
      },
    };

    if (typeof setup === 'function') {
      try { setup(player); } catch (_) {}
    }

    playerRef.current = player;
  }

  React.useEffect(() => {
    const player = playerRef.current;
    const t = setTimeout(() => {
      player._emit('statusChange', { status: 'error' });
    }, 100);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return playerRef.current;
}

const VideoView = React.forwardRef(function VideoView(props, ref) {
  React.useImperativeHandle(ref, () => ({
    enterFullscreen: () => Promise.resolve(),
    exitFullscreen: () => Promise.resolve(),
  }));

  return React.createElement(View, {
    style: [{ backgroundColor: '#000' }, props.style],
  });
});

VideoView.displayName = 'VideoView';

module.exports = { useVideoPlayer, VideoView };
