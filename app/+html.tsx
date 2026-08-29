import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * The HTML document every web page is rendered into.
 *
 * This is expo-router's equivalent of a Next.js root layout's Metadata API —
 * there is no `metadata.manifest` here, because this is Expo, not Next. The
 * manifest link and theme colour have to live in the document head, and this
 * file is the only place on web that exists.
 *
 * Native builds never load this; it is web-only by convention.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover so a standalone install paints under the notch,
            the way the native app does. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* What makes the install prompt possible at all. */}
        <link rel="manifest" href="/manifest.json" />

        {/* Colour of the browser chrome around the app. Taken from the splash
            background in app.json (#0C0B09) so the web install matches what
            the native app opens to, rather than a colour invented here. */}
        <meta name="theme-color" content="#0C0B09" />

        {/* Safari ignores the manifest for Add to Home Screen and reads these
            instead. Without them an iOS install opens in a browser tab with a
            screenshot for an icon. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Echo" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />

        {/* Keeps body scroll from fighting React Native Web's scroll views. */}
        <ScrollViewStyleReset />

        {/* The document background, so there is no white flash before React
            mounts — most visible on a cold standalone launch. */}
        <style dangerouslySetInnerHTML={{ __html: `html,body{background-color:#0C0B09;}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
