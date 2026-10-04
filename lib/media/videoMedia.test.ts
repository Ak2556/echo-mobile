import { describe, expect, it } from 'vitest';
import { videoSourceForUri } from './videoMedia';

const REMOTE_MP4 = 'https://echo-mobile.at3236129.workers.dev/media/echo-media/u1/1786519246345_video.mp4';

describe('videoSourceForUri', () => {
  it('caches a remote progressive video', () => {
    expect(videoSourceForUri(REMOTE_MP4)).toEqual({ uri: REMOTE_MP4, contentType: 'progressive', useCaching: true });
  });

  it('does not ask to cache HLS, which iOS cannot cache', () => {
    const uri = 'https://cdn.example.com/v/master.m3u8';
    expect(videoSourceForUri(uri)).toEqual({ uri, contentType: 'hls' });
  });

  it('does not cache a local file', () => {
    const uri = 'file:///var/mobile/Containers/Data/tmp/clip.mov';
    expect(videoSourceForUri(uri)).toEqual({ uri, contentType: 'progressive' });
  });

  it('caches a remote URL of unknown kind without guessing its type', () => {
    const uri = 'https://cdn.example.com/stream/abc';
    expect(videoSourceForUri(uri)).toEqual({ uri, useCaching: true });
  });

  it('returns null without a uri', () => {
    expect(videoSourceForUri(undefined)).toBeNull();
    expect(videoSourceForUri('')).toBeNull();
  });
});
