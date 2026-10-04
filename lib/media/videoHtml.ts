/**
 * The page the WebView fallback plays a video in.
 *
 * expo-video's native player reports `error` straight away for these clips on
 * Android (observed 2026-10-04 on a release build, for every source including a
 * public H.264 test file, so it is not the codec or the URL). The system WebView
 * decodes them, but only when the clip sits inside an <img>-style page: loading
 * the .mp4 itself as the document hit the media server's
 * `Content-Security-Policy: default-src 'none'`, which blocks the player inside
 * a media document and left a broken-media icon (the Echo Thread screen).
 */

/** Escape for use inside a double-quoted HTML attribute. */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface VideoHtmlOptions {
  /** Draw the browser's own play/seek/volume controls. The feed card has its own, so it leaves this off. */
  controls?: boolean;
  loop?: boolean;
}

/**
 * Depends on the uri and the options and nothing else: any other input changes the
 * string, which reloads the WebView and restarts the video from zero.
 * Starts muted, as an unmuted autoplaying element is rejected by Chrome anyway.
 */
export function videoFallbackHtml(uri: string, { controls = false, loop = true }: VideoHtmlOptions = {}): string {
  const src = escapeHtmlAttribute(uri);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
      body { margin: 0; padding: 0; background-color: #09090B; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
      video { width: 100%; height: 100%; object-fit: ${controls ? 'contain' : 'cover'};${controls ? '' : ' pointer-events: none;'} }
    </style>
  </head>
  <body>
    <video src="${src}" autoplay ${loop ? 'loop ' : ''}muted playsinline webkit-playsinline${controls ? ' controls controlsList="nodownload"' : ''}></video>
  </body>
</html>`;
}
