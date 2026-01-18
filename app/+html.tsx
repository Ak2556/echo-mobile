import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Default <head> for the static web export. Per-route OG tags can override
// these via a child route's `+html.tsx` or via the og-redirect edge function.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>Echo — AI conversations become content</title>
        <meta name="description" content="Chat with AI. Publish your best exchanges. Follow people doing the same." />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Echo" />
        <meta property="og:description" content="A social platform where AI conversations become content." />
        <meta property="og:image" content="https://echo.app/og-default.png" />
        <meta property="og:site_name" content="Echo" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Echo" />
        <meta name="twitter:description" content="A social platform where AI conversations become content." />
        <meta name="twitter:image" content="https://echo.app/og-default.png" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
