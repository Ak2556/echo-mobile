import { Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { echoUrl } from './echoUrl';
import { track } from './analytics';
import { captureException } from './monitoring';

/**
 * Lazy-load expo-sharing so a missing native module (older Release build,
 * Expo Go without dev client) degrades gracefully instead of crashing the
 * entire app at module-evaluation time. Same pattern as lib/monitoring.ts.
 */
type SharingModule = typeof import('expo-sharing') | null;
let sharingModule: SharingModule = null;
let triedSharing = false;

function loadSharing(): SharingModule {
  if (triedSharing) return sharingModule;
  triedSharing = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sharingModule = require('expo-sharing');
  } catch {
    sharingModule = null;
  }
  return sharingModule;
}

/**
 * Capture a hidden ShareableEchoCard ref to PNG and hand it to the system
 * share sheet. The image is the brand-aligned 1080×1350 card; the message
 * carries the canonical echo URL so receivers can tap-through.
 *
 * Failure modes are silenced (logged via monitoring) — image generation
 * isn't worth blocking the share flow over. If the capture fails OR the
 * native ExpoSharing module isn't available, we fall back to a plain
 * URL-only share via React Native's built-in Share.share.
 */
export async function shareEchoAsImage(
  cardRef: RefObject<View | null>,
  echoId: string,
): Promise<void> {
  const url = echoUrl(echoId);

  try {
    if (!cardRef.current) throw new Error('card ref not mounted');
    const uri = await captureRef(cardRef.current, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });

    track('echo_shared', { method: 'image' });

    const Sharing = loadSharing();
    if (Sharing && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share this Echo',
        UTI: 'public.png',
      });
      return;
    }

    // Sharing module unavailable — fall back to plain RN Share with the URL.
    await Share.share({ message: url, url });
  } catch (e) {
    captureException(e, { tags: { source: 'share_echo_as_image' } });
    // Final fallback: just share the URL so the user isn't stranded.
    try {
      await Share.share({ message: url, url });
      track('echo_shared', { method: 'url_fallback' });
    } catch {
      // User dismissed; ignore.
    }
  }
}
