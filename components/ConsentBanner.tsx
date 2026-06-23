import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useTheme } from '../lib/theme';
import {
  getAnalyticsConsentAsync,
  setAnalyticsConsentAsync,
} from '../lib/consent';
import { initAnalytics, track } from '../lib/analytics';

/**
 * GDPR-style analytics consent banner shown on first launch.
 *
 * Non-blocking: it's a bottom card the user can act on at their own pace.
 * Until the user accepts, PostHog is never initialised, so no events
 * are sent. On accept we call initAnalytics() and emit consent_accepted
 * (which becomes the first tracked event). On decline we just persist
 * the choice and never call initAnalytics() for this install.
 */
export function ConsentBanner() {
  const { colors, radius, font } = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getAnalyticsConsentAsync().then(status => {
      if (!mounted) return;
      if (status === 'accepted') initAnalytics();
      setVisible(status === 'unknown');
    });
    return () => { mounted = false; };
  }, []);

  if (!visible) return null;

  const handleAccept = () => {
    setVisible(false);
    void setAnalyticsConsentAsync('accepted').then(() => {
      initAnalytics();
      track('consent_accepted');
    });
  };

  const handleDecline = () => {
    setVisible(false);
    void setAnalyticsConsentAsync('declined');
  };

  return (
    <SafeAreaView
      edges={['bottom']}
      pointerEvents="box-none"
      style={styles.wrapper}
    >
      <Animated.View
        entering={FadeInDown.duration(220)}
        exiting={FadeOut.duration(140)}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.card,
          },
        ]}
        accessibilityRole="alert"
        accessibilityLabel="Analytics consent prompt"
      >
        <Text
          style={[
            font.bodySemibold,
            { color: colors.text, fontSize: 15, marginBottom: 6 },
          ]}
        >
          Help us improve Echo
        </Text>
        <Text
          style={[
            font.body,
            { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 14 },
          ]}
        >
          We use anonymous analytics to understand what works in Echo. You can
          change this any time in Settings.
        </Text>

        <View style={styles.row}>
          <Pressable
            onPress={handleDecline}
            accessibilityRole="button"
            accessibilityLabel="Decline analytics"
            accessibilityHint="Echo will not collect any usage analytics"
            style={({ pressed }) => [
              styles.btn,
              {
                borderColor: colors.border,
                borderWidth: StyleSheet.hairlineWidth,
                backgroundColor: pressed ? colors.surfaceHover : 'transparent',
              },
            ]}
          >
            <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 14 }]}>
              No thanks
            </Text>
          </Pressable>

          <Pressable
            onPress={handleAccept}
            accessibilityRole="button"
            accessibilityLabel="Accept analytics"
            accessibilityHint="Echo will collect anonymous usage analytics"
            style={({ pressed }) => [
              styles.btn,
              {
                backgroundColor: pressed ? colors.accentMuted : colors.accent,
              },
            ]}
          >
            <Text style={[font.bodySemibold, { color: '#fff', fontSize: 14 }]}>
              Accept
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
});
