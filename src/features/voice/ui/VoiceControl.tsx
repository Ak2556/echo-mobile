import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Microphone, X } from 'phosphor-react-native';
import { useTheme } from '../../../shared/lib/theme';
import { useI18n } from '../../../shared/lib/i18n';
import { useAuth } from '../../../../lib/auth/index';
import { useVoiceCommand } from '../../../../hooks/useVoiceCommand';
import { useVoiceControl } from '../../../../store/voiceControl';
import { useAppStore } from '../../../../store/useAppStore';
import { BlurView } from 'expo-blur';

export function VoiceControl() {
  const { status } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { state, start, stopAndRun, cancel, reset, runTextCommand } = useVoiceCommand();
  const registerVoice = useVoiceControl(s => s.register);
  const setVoicePhase = useVoiceControl(s => s.setPhase);
  const captions = useAppStore(s => s.voiceCaptions);

  // Only advertise `start` once this component can actually SHOW something.
  // The auth gate below is a render guard placed after the hooks, so this
  // effect used to register regardless of status — meaning a launcher shortcut
  // could fire start() while status was still 'checking', engaging the
  // microphone behind a component rendering null. The user landed on the feed
  // with no panel and no way to tell the mic was live. app/voice.tsx already
  // assumes registration is "gated on auth"; this makes that true.
  useEffect(() => {
    if (status !== 'ready') {
      registerVoice(null);
      return;
    }
    registerVoice(start);
    return () => registerVoice(null);
  }, [registerVoice, start, status]);

  useEffect(() => {
    setVoicePhase(state.phase);
  }, [setVoicePhase, state.phase]);

  useEffect(() => {
    if (state.phase === 'done' || state.phase === 'error') {
      const ms = state.phase === 'done' ? 3200 : 4200;
      const timer = setTimeout(reset, ms);
      return () => clearTimeout(timer);
    }
  }, [state.phase, reset]);

  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.1);

  useEffect(() => {
    if (state.phase === 'listening') {
      pulseScale.value = withRepeat(withTiming(1.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true);
      glowOpacity.value = withRepeat(withTiming(0.6, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      glowOpacity.value = withTiming(0.1, { duration: 300 });
    }
  }, [state.phase, pulseScale, glowOpacity]);

  const animatedMicStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: glowOpacity.value,
    shadowRadius: 24,
    elevation: glowOpacity.value * 12,
  }));

  const animatedRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value * 1.5 }],
    opacity: glowOpacity.value * 0.5,
  }));

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
      {active && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, { zIndex: 60, justifyContent: 'center', alignItems: 'center' }]}
        >
          <BlurView intensity={colors.isDark ? 40 : 20} tint={colors.isDark ? "dark" : "light"} style={StyleSheet.absoluteFill}>
            <Pressable style={StyleSheet.absoluteFill} onPress={state.phase === 'listening' ? stopAndRun : cancel} />
          </BlurView>
          
          <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 24, width: '100%' }}>
            {state.phase === 'listening' && (
               <Animated.View style={[{ position: 'absolute', top: -4, width: 84, height: 84, borderRadius: 42, backgroundColor: colors.accent }, animatedRingStyle]} pointerEvents="none" />
            )}
            
            <Pressable
               onPress={state.phase === 'listening' ? stopAndRun : cancel}
               style={{ zIndex: 10 }}
            >
              <Animated.View style={[{
                 width: 72, height: 72, borderRadius: 36,
                 backgroundColor: state.phase === 'error' ? colors.danger : colors.accent,
                 alignItems: 'center', justifyContent: 'center',
                 borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.4)'
              }, animatedMicStyle]}>
                 {state.phase === 'thinking' ? (
                   <ActivityIndicator color="#fff" />
                 ) : (
                   <Microphone color="#fff" size={30} weight="fill" />
                 )}
              </Animated.View>
            </Pressable>
            
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 22, letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.2)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 } }}>
              {statusLine}
            </Text>

            {state.phase === 'listening' && (
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 8, fontWeight: '500', letterSpacing: -0.2 }}>
                {t('voice.tapToStop')}
              </Text>
            )}

            {captions && !!state.transcript && (
              <View style={{ marginTop: 20, paddingHorizontal: 30, width: '100%' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 6 }}>{t('voice.youSaid')}</Text>
                <Text style={{ color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '600', textAlign: 'center' }}>{state.transcript}</Text>
              </View>
            )}
            
            {!!state.reply && state.phase === 'done' && (
              <Text style={{ color: colors.text, fontSize: 15, marginTop: 16, textAlign: 'center', paddingHorizontal: 20 }}>{state.reply}</Text>
            )}
            
            {state.phase === 'error' && (
              <View style={{ marginTop: 30, width: '80%' }}>
                <TextInput
                  autoFocus
                  placeholder="Type your command (Offline Fallback)"
                  placeholderTextColor={colors.textMuted}
                  style={{ color: colors.text, fontSize: 16, padding: 16, backgroundColor: colors.surfaceHover, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
                  onSubmitEditing={(e) => runTextCommand(e.nativeEvent.text)}
                  returnKeyType="send"
                />
              </View>
            )}
            
            <Pressable onPress={cancel} hitSlop={8}
               style={{ marginTop: 24, padding: 13, borderRadius: 30, backgroundColor: colors.surfaceHover }}>
               <X color={colors.text} size={18} weight="bold" />
            </Pressable>
          </View>
        </Animated.View>
      )}
    </>
  );
}