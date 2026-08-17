import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { SpeakerHigh, Pause, Play, X } from 'phosphor-react-native';
import { useTheme } from '../../../shared/lib/theme';
import { tap } from '../../../shared/lib/haptics';
import { pauseSpeaking, resumeSpeaking, stopSpeaking, useTtsStore } from '../../../../lib/tts';
import { ttx } from '../../../shared/lib/i18n';

/**
 * Global "now reading" control — appears whenever anything is being read aloud
 * (a post, an AI reply, the feed, the daily question…) so the user can pause,
 * resume, or stop from anywhere in the app. Mounted once in the root layout.
 */
export function NowReadingBar() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const speakingId = useTtsStore((s) => s.speakingId);
  const paused = useTtsStore((s) => s.paused);

  if (!speakingId) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOutDown.duration(160)}
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 150, alignItems: 'center', zIndex: 55 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingLeft: 16,
          paddingRight: 12,
          paddingVertical: 9,
          borderRadius: 22,
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          shadowColor: '#000',
          shadowOpacity: colors.isDark ? 0.3 : 0.14,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        <SpeakerHigh color={colors.accent} size={18} weight="fill" />
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>
          {paused ? 'Paused' : 'Reading aloud…'}
        </Text>
        <Pressable
          onPress={() => { tap('light'); if (paused) { resumeSpeaking(); } else { pauseSpeaking(); } }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={paused ? 'Resume reading' : 'Pause reading'}
          style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHover }}
        >
          {paused ? <Play color={colors.text} size={16} weight="fill" /> : <Pause color={colors.text} size={16} weight="fill" />}
        </Pressable>
        <Pressable
          onPress={() => { tap('light'); stopSpeaking(); }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={ttx("Stop reading")}
          style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHover }}
        >
          <X color={colors.textMuted} size={16} weight="bold" />
        </Pressable>
      </View>
    </Animated.View>
  );
}
