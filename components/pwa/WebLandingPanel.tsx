import React from 'react';
import { Image, Platform, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../../src/shared/lib/theme';

/**
 * What downloadecho.com says about itself before you sign in.
 *
 * On a phone the auth screen is the whole first impression and that is fine —
 * you arrived because you already know what Echo is. On a desktop browser it
 * was a logo and two buttons on a field of black, which tells a first-time
 * visitor nothing. Every comparable site answers "what is this" beside the
 * sign-in rather than behind it.
 *
 * Web and wide only. On native, and on a narrow browser window, this renders
 * nothing and the existing screen is untouched.
 */

const POINTS: { title: string; body: string }[] = [
  {
    title: 'Speak, don’t type',
    body: 'Hold the mic and Echo posts it, answers it, or does it — in 26 languages, including Hinglish.',
  },
  {
    title: 'A feed that ends',
    body: 'One daily question everyone answers, and a feed built to finish rather than to scroll.',
  },
  {
    title: 'Tools that live inside',
    body: 'Habits, money, tasks, fitness and study — asked for out loud, not opened one by one.',
  },
];

export function WebLandingPanel() {
  const { colors, font, radius } = useTheme();
  const { width } = useWindowDimensions();

  // 1000 rather than the shared isWide (900): below this the two columns crowd
  // each other and the screenshot has nowhere to go.
  if (Platform.OS !== 'web' || width < 1000) return null;

  return (
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, justifyContent: 'center', maxWidth: 640 }}>
      <Text
        style={[font.display, {
          color: colors.text,
          fontSize: 46,
          lineHeight: 52,
          letterSpacing: -1,
        }]}
      >
        Say it once.{'\n'}Echo does the rest.
      </Text>

      <Text
        style={[font.body, {
          color: colors.textSecondary,
          fontSize: 17,
          lineHeight: 26,
          marginTop: 16,
          maxWidth: 460,
        }]}
      >
        A voice-first social network with an assistant that listens, acts and
        translates — built for the people whose first language isn’t English.
      </Text>

      <View style={{ flexDirection: 'row', gap: 28, marginTop: 40, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 22 }}>
          {POINTS.map(point => (
            <View key={point.title} style={{ gap: 4 }}>
              <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>
                {point.title}
              </Text>
              <Text style={[font.body, { color: colors.textMuted, fontSize: 14, lineHeight: 21 }]}>
                {point.body}
              </Text>
            </View>
          ))}
        </View>

        {/* A real screenshot of the app, not a mockup frame. */}
        <Image
          source={{ uri: '/shots/feed.png' }}
          accessibilityLabel="Echo's feed on a phone"
          resizeMode="contain"
          style={{
            width: 176,
            height: 382,
            borderRadius: radius.card,
            backgroundColor: colors.surface,
          }}
        />
      </View>
    </View>
  );
}
