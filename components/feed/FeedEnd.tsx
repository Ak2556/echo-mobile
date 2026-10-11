import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../ui/Button';
import { useTheme } from '../../lib/ui/theme';
import { ttx } from '../../lib/i18n/i18n';

/**
 * The bottom of the feed. It says so, and offers the one thing worth doing next: today's
 * question. Nothing is hiding below it and nothing loads under it.
 */
export function FeedEnd() {
  const router = useRouter();
  const { colors, font, fontSizes } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 36, paddingBottom: 24, gap: 10 }}>
      <View style={{ width: 28, height: 3, borderRadius: 2, backgroundColor: colors.accent, opacity: 0.7 }} />
      <Text style={[font.displayBlack, { color: colors.text, fontSize: 24, textAlign: 'center', letterSpacing: -0.3 }]}>
        {ttx("You're all caught up")}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, textAlign: 'center', lineHeight: 22, maxWidth: 320 }}>
        {ttx('That is everything for now. There is nothing hiding below.')}
      </Text>
      <Button
        label={ttx("Today's question")}
        variant="secondary"
        onPress={() => router.push('/daily-question' as never)}
        style={{ alignSelf: 'center', marginTop: 8 }}
      />
    </View>
  );
}
