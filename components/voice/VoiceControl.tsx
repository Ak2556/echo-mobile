import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Microphone, Stop, X } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { useVoiceCommand } from '../../hooks/useVoiceCommand';
import { useVoiceControl } from '../../store/voiceControl';
import { useAppStore } from '../../store/useAppStore';

/**
 * Global voice controller — the flagship hands-free entry point.
 *
 * There is no dedicated mic button any more: the user long-presses the floating
 * mini-app bubble to start a session (see FloatingMiniApp). This component owns
 * the recorder/hook and renders only the status panel — it registers `start`
 * and mirrors the live phase into the voice-control store so the bubble can
 * trigger and reflect a session.
 *
 * Built to run on the current dev client: recording only, transcription happens
 * server-side. Spoken read-back arrives with the next native build.
 */
export function VoiceControl() {
  const { status } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { state, start, stopAndRun, cancel, reset, runTextCommand } = useVoiceCommand();
  const registerVoice = useVoiceControl(s => s.register);
  const setVoicePhase = useVoiceControl(s => s.setPhase);
  const captions = useAppStore(s => s.voiceCaptions);

  // Expose `start` to any surface (the floating bubble) and mirror the phase so
  // the bubble can tint itself while listening.
  useEffect(() => {
    registerVoice(start);
    return () => registerVoice(null);
  }, [registerVoice, start]);

  useEffect(() => {
    setVoicePhase(state.phase);
  }, [setVoicePhase, state.phase]);

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

            {captions && !!state.transcript && (
              <View
                style={{
                  gap: 3,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: colors.surfaceHover,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>{t('voice.youSaid')}</Text>
                <Text style={{ color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: '600' }}>{state.transcript}</Text>
              </View>
            )}

            {!!state.reply && state.phase === 'done' && (
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{state.reply}</Text>
            )}

            {state.phase === 'error' && (
              <TextInput
                autoFocus
                placeholder="Type your command (Offline Fallback)"
                placeholderTextColor={colors.textMuted}
                style={{ color: colors.text, fontSize: 16, padding: 12, backgroundColor: colors.surfaceHover, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}
                onSubmitEditing={(e) => runTextCommand(e.nativeEvent.text)}
                returnKeyType="send"
              />
            )}

            {state.phase === 'listening' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Stop color={colors.danger} size={16} weight="fill" />
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('voice.tapToStop')}</Text>
              </View>
            )}

            {(state.phase === 'idle' || state.phase === 'listening') && !state.transcript && (
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('voice.hint')}</Text>
            )}
          </View>
        </Animated.View>
      )}
    </>
  );
}
