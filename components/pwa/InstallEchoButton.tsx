import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useTheme } from '../../src/shared/lib/theme';

/**
 * The event Chromium fires when a site becomes installable. It is not in the
 * DOM lib types, so it is described here rather than cast away.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

/**
 * "Install Echo" — our own button rather than waiting for the browser's.
 *
 * Chromium only shows its built-in install affordance once it decides the user
 * is engaged enough, and on desktop it hides in a menu. Capturing
 * `beforeinstallprompt` lets Echo ask at a moment that makes sense instead.
 *
 * The event can only be fired once and only from a user gesture, which is why
 * it is stored rather than acted on immediately.
 *
 * Renders nothing at all when installing is not possible: already installed,
 * an unsupported browser, or Safari, which has no programmatic install and
 * offers Add to Home Screen through its own share menu.
 */
export function InstallEchoButton() {
  const { colors, font, radius } = useTheme();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const onAvailable = (event: Event) => {
      // Suppress the browser's own mini-infobar so there is one prompt, ours.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    // Once installed the event never fires again; clear so the button vanishes.
    const onInstalled = () => setDeferred(null);

    window.addEventListener('beforeinstallprompt', onAvailable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onAvailable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    // Consume it first: the event is single-use, and a second prompt() throws.
    setDeferred(null);
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      // Dismissed or already handled; nothing to recover.
    }
  }, [deferred]);

  if (!deferred) return null;

  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable onPress={install} accessibilityRole="button" accessibilityLabel="Install Echo">
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: radius.card,
            backgroundColor: colors.accent,
          }}
        >
          <Text style={[font.bodyBold, { color: colors.bg, fontSize: 14 }]}>Install Echo</Text>
        </View>
      </Pressable>
    </View>
  );
}
