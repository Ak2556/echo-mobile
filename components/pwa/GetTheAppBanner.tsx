import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { persistGet, persistSet } from '../../store/persist';
import { WORKER_URL } from '../../lib/workerUrl';

/**
 * "Get the app" on the web, the way Instagram and Facebook do it.
 *
 * Echo runs perfectly well in a browser, so this is an offer rather than a
 * wall — the point is that the website is usable and the app is available,
 * not that one blocks the other.
 *
 * What it offers depends on what the visitor can actually do:
 *
 *   Android   the APK, because Echo is not on Play yet and a direct download
 *             is the only route that exists.
 *   Chromium  installing the PWA, once the browser says it is installable.
 *   iOS/other nothing. Safari has no programmatic install and Echo has no iOS
 *             build to link to, so a button here would go nowhere.
 *
 * Dismissal sticks, because being asked twice is how a banner becomes an
 * annoyance.
 */

const DISMISS_KEY = 'web:getTheApp:dismissed';
const APK_URL = `${WORKER_URL}/media/echo-media/downloads/echo-latest.apk`;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Offer = 'apk' | 'install' | null;

export function GetTheAppBanner() {
  const { colors, font, radius } = useTheme();
  const [dismissed, setDismissed] = useState(true);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    // Already installed and running standalone — offering an install is noise.
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    setIsAndroid(/android/i.test(window.navigator.userAgent));
    setDismissed(persistGet<boolean>(DISMISS_KEY, false));

    const onAvailable = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onAvailable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onAvailable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try { persistSet(DISMISS_KEY, true); } catch { /* a failed write only costs a re-show */ }
  }, []);

  const act = useCallback(async () => {
    if (isAndroid) {
      void Linking.openURL(APK_URL);
      dismiss();
      return;
    }
    if (!deferred) return;
    setDeferred(null);
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch { /* dismissed */ }
  }, [isAndroid, deferred, dismiss]);

  const offer: Offer = isAndroid ? 'apk' : deferred ? 'install' : null;
  if (Platform.OS !== 'web' || dismissed || !offer) return null;

  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 10, paddingHorizontal: 16,
        backgroundColor: colors.surface,
        borderBottomWidth: 1, borderBottomColor: colors.border ?? 'transparent',
      }}
    >
      <Text style={[font.body, { color: colors.text, fontSize: 13, flex: 1 }]} numberOfLines={2}>
        {offer === 'apk'
          ? 'Echo works better in the app — voice, notifications and offline.'
          : 'Install Echo for a faster, full-screen experience.'}
      </Text>

      <Pressable onPress={act} accessibilityRole="button">
        <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.card, backgroundColor: colors.accent }}>
          <Text style={[font.bodyBold, { color: colors.bg, fontSize: 13 }]}>
            {offer === 'apk' ? 'Get the app' : 'Install'}
          </Text>
        </View>
      </Pressable>

      <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Text style={[font.body, { color: colors.textMuted, fontSize: 18, paddingHorizontal: 4 }]}>×</Text>
      </Pressable>
    </View>
  );
}
