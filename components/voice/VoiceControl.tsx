import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';
import { Microphone, Stop, X } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { useI18n } from '../../lib/i18n';
import { tap } from '../../lib/haptics';
import { useAuth } from '../../lib/auth';
import { useVoiceCommand } from '../../hooks/useVoiceCommand';

/**
 * Global voice controller — the flagship hands-free entry point.
 *
 * A large, always-reachable mic button (bottom-left, clear of the compose FAB).
 * Tap to speak, tap again to stop; the app transcribes (Hindi/English) and acts.
 * Built to run on the current dev client: recording only, transcription happens
 * server-side. Spoken read-back arrives with the next native build.
 *
 * Render pattern mirrors ComposeFAB: outer View owns visuals, inner Pressable
 * owns press handling (avoids the Release-build Pressable layout-drop quirk).
 */
export function VoiceControl() {
  const { status } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { state, start, stopAndRun, cancel, reset } = useVoiceCommand();

  const pulse = useSharedValue(1);
  const listening = state.phase === 'listening';

  useEffect(() => {
    if (listening) {
      pulse.value = withRepeat(withSequence(withTiming(1.18, { duration: 620 }), withTiming(1, { duration: 620 })), -1, false);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [listening, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  // Auto-dismiss a finished/errored result after a short read.
  useEffect(() => {
    if (state.phase === 'done' || state.phase === 'error') {
      const ms = state.phase === 'done' ? 3200 : 4200;
      const timer = setTimeout(reset, ms);
      return () => clearTimeout(timer);
    }
  }, [state.phase, reset]);

  if (status !== 'ready') return null;

  const active = state.phase !== 'idle';

  const statusLine = (() => {
    switch (state.phase) {
      case 'listening': return t('voice.listening');
      case 'thinking': return t('voice.thinking');
      case 'error':
        if (state.error === 'mic-permission') return t('voice.micDenied');
        if (state.error === 'not-understood') return t('voice.notUnderstood');
        return t('voice.failed');
      default: return '';
    }
  })();

  const onMicPress = () => {
    tap('medium');
    if (state.phase === 'listening') stopAndRun();
    else if (state.phase === 'idle') start();
  };

  return (
    <>
      {/* Backdrop + status panel while a session is active */}
      {active && (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(140)}
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, { zIndex: 60, justifyContent: 'flex-end' }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={state.phase === 'listening' ? stopAndRun : cancel} />
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: insets.bottom + 96,
              padding: 18,
              borderRadius: 22,
              backgroundColor: colors.surface,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              shadowColor: '#000',
              shadowOpacity: colors.isDark ? 0.3 : 0.14,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
              elevation: 6,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {state.phase === 'thinking'
                ? <ActivityIndicator color={colors.accent} />
                : <Microphone color={state.phase === 'error' ? colors.danger : colors.accent} size={22} weight="fill" />}
              <Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' }}>
                {statusLine}
              </Text>
              <Pressable hitSlop={10} onPress={cancel} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                <X color={colors.textMuted} size={20} weight="bold" />
              </Pressable>
            </View>

            {!!state.transcript && (
              <View style={{ gap: 2 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>{t('voice.youSaid')}</Text>
                <Text style={{ color: colors.text, fontSize: 15 }}>{state.transcript}</Text>
              </View>
            )}

            {!!state.reply && state.phase === 'done' && (
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{state.reply}</Text>
            )}

            {state.phase === 'listening' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Stop color={colors.danger} size={16} weight="fill" />
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('voice.tapToStop')}</Text>
              </View>
            )}

            {state.phase === 'idle' && (
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('voice.hint')}</Text>
            )}
          </View>
        </Animated.View>
      )}

      {/* The persistent mic button */}
      <Animated.View
        entering={FadeIn.duration(180)}
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 22, bottom: insets.bottom + 88, zIndex: 61 }}
      >
        <Animated.View style={pulseStyle}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: listening ? colors.danger : colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: colors.isDark ? 0.24 : 0.16,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 5,
            }}
          >
            <Pressable
              onPress={onMicPress}
              accessibilityRole="button"
              accessibilityLabel={listening ? t('voice.tapToStop') : t('voice.openLabel')}
              accessibilityState={{ busy: state.phase === 'thinking' }}
              disabled={state.phase === 'thinking'}
              style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 28 }}
            >
              {listening
                ? <Stop color="#fff" size={24} weight="fill" />
                : <Microphone color="#fff" size={26} weight="fill" />}
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </>
  );
}
