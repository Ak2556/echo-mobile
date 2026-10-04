import { describe, expect, it } from 'vitest';
import { escapeHtmlAttribute, videoFallbackHtml } from './videoHtml';

const URL = 'https://echo-mobile.at3236129.workers.dev/media/echo-media/u/1_video.mp4';

describe('videoFallbackHtml', () => {
  it('puts the clip in a <video> element, not in the document itself', () => {
    const html = videoFallbackHtml(URL);
    expect(html).toContain(`<video src="${URL}"`);
    expect(html).toContain('autoplay');
    expect(html).toContain('muted');
  });

  it('cannot be broken out of by a hostile uri', () => {
    const html = videoFallbackHtml('https://x/a.mp4"><script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
    expect(escapeHtmlAttribute('a&b"c<d>')).toBe('a&amp;b&quot;c&lt;d&gt;');
  });

  it('draws browser controls only when asked, and never offers a download', () => {
    expect(videoFallbackHtml(URL)).not.toContain('controls');
    const withControls = videoFallbackHtml(URL, { controls: true, loop: false });
    expect(withControls).toContain(' controls controlsList="nodownload"');
    expect(withControls).not.toContain(' loop ');
  });

  it('is a pure function of the uri and options, so the WebView does not reload', () => {
    expect(videoFallbackHtml(URL)).toBe(videoFallbackHtml(URL));
  });
});
