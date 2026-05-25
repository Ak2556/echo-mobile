import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { EnvelopeSimple, Phone as PhoneIcon } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

/**
 * Login — v1 entry point.
 *
 * Two providers, deliberately stacked vertically with full-width CTAs:
 *   • Primary (filled accent)  — Continue with email (magic link)
 *   • Secondary (outlined)     — Continue with phone (OTP)
 *
 * Forward navigation is owned by AuthListenerProvider; both buttons here
 * just route to their respective entry screens.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingBottom: 24, paddingTop: 32 }}>

          {/* Top: hero */}
          <Animated.View entering={FadeInDown.duration(260)} style={{ alignItems: 'center', marginTop: 64 }}>
            <View style={{
              width: 84, height: 84, borderRadius: 24,
              backgroundColor: colors.accent,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 24,
              shadowColor: colors.accent,
              shadowOpacity: 0.45,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
            }}>
              <Text style={[font.displayBlack, { color: '#fff', fontSize: 44, letterSpacing: -1.5, lineHeight: 50 }]}>e</Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 }}>
              <Text style={[font.displayBlack, { color: colors.text, fontSize: 38, letterSpacing: -1.2 }]}>echo</Text>
              <Text style={[font.displayBlack, { color: colors.accent, fontSize: 38, letterSpacing: -1.2 }]}>.</Text>
            </View>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 15, textAlign: 'center', maxWidth: 260, lineHeight: 22 }]}>
              The social network for{'\n'}thinking out loud.
            </Text>
          </Animated.View>

          {/* Middle: CTAs */}
          <View style={{ gap: 12 }}>
            <Animated.View entering={FadeInDown.delay(80).duration(260)}>
              <PrimaryButton
                icon={<EnvelopeSimple color="#fff" size={20} weight="bold" />}
                label="Continue with email"
                onPress={() => router.push('/auth/email' as any)}
                bg={colors.accent}
                fg="#fff"
                radius={radius.lg}
                font={font.bodyBold}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(140).duration(260)}>
              <SecondaryButton
                icon={<PhoneIcon color={colors.text} size={20} weight="regular" />}
                label="Continue with phone"
                onPress={() => router.push('/auth/phone' as any)}
                fg={colors.text}
                border={colors.border}
                surface={colors.surface}
                radius={radius.lg}
                font={font.bodySemibold}
              />
            </Animated.View>
          </View>

          {/* Bottom: legal */}
          <Animated.View entering={FadeInUp.delay(200).duration(260)} style={{ alignItems: 'center' }}>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 }]}>
              By continuing you agree to our{'\n'}
              <Text style={[font.bodySemibold, { color: colors.textSecondary }]}>Terms</Text>
              {' & '}
              <Text style={[font.bodySemibold, { color: colors.textSecondary }]}>Privacy</Text>
              .
            </Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Reusable buttons (kept colocated; pulled out if a third screen needs them) ──

function PrimaryButton({
  icon, label, onPress, bg, fg, radius, font,
}: {
  icon: React.ReactNode; label: string; onPress: () => void;
  bg: string; fg: string; radius: number; font: object;
}) {
  return (
    <View style={{
      backgroundColor: bg,
      borderRadius: radius,
      shadowColor: bg,
      shadowOpacity: 0.35,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
        style={{
          paddingVertical: 18,
          paddingHorizontal: 20,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 10,
        }}
      >
        {icon}
        <Text style={[font, { color: fg, fontSize: 16, letterSpacing: -0.2 }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

function SecondaryButton({
  icon, label, onPress, fg, border, surface, radius, font,
}: {
  icon: React.ReactNode; label: string; onPress: () => void;
  fg: string; border: string; surface: string; radius: number; font: object;
}) {
  return (
    <View style={{
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: border,
      borderRadius: radius,
      overflow: 'hidden',
    }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        android_ripple={{ color: 'rgba(255,255,255,0.10)' }}
        style={{
          paddingVertical: 18,
          paddingHorizontal: 20,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 10,
        }}
      >
        {icon}
        <Text style={[font, { color: fg, fontSize: 16, letterSpacing: -0.2 }]}>{label}</Text>
      </Pressable>
    </View>
  );
}
