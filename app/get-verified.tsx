import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, SealCheck, ShieldCheck, Timer, XCircle } from 'phosphor-react-native';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { showToast } from '../components/ui/Toast';
import {
  VerificationState, getVerificationState, randomPose, submitVerification,
} from '../lib/verificationApi';

type Phase = 'loading' | 'intro' | 'preview' | 'submitting' | 'approved' | 'pending' | 'rejected';

export default function GetVerifiedScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const [phase, setPhase] = useState<Phase>('loading');
  const [pose, setPose] = useState(randomPose());
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string | null>(null);

  useEffect(() => {
    getVerificationState()
      .then((s: VerificationState) => {
        if (s.is_verified) setPhase('approved');
        else if (s.request?.status === 'pending') setPhase('pending');
        else {
          if (s.request?.status === 'rejected') setRejectReason(s.request.reject_reason);
          setPhase('intro');
        }
      })
      .catch(() => setPhase('intro'));
  }, []);

  const takeSelfie = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { showToast('Camera access is needed to verify', 'Camera'); return; }
      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        quality: 0.7,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setSelfieUri(result.assets[0].uri);
      setPhase('preview');
    } catch {
      showToast('Could not open the camera', 'Error');
    }
  };

  const submit = async () => {
    if (!selfieUri) return;
    setPhase('submitting');
    try {
      const res = await submitVerification(selfieUri, pose);
      if (res.status === 'approved') setPhase('approved');
      else if (res.status === 'rejected') { setRejectReason(res.reason ?? null); setPhase('rejected'); }
      else setPhase('pending');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      showToast(msg === 'no_avatar' ? 'Add a profile photo first' : msg, 'Error');
      setPhase('intro');
    }
  };

  const retry = () => {
    setSelfieUri(null);
    setRejectReason(null);
    setPose(randomPose());
    setPhase('intro');
  };

  const Center = ({ children }: { children: React.ReactNode }) => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{
        paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={12} fadeOnPress>
          <ArrowLeft color={colors.text} size={22} />
        </AnimatedPressable>
        <Text style={{ flex: 1, color: colors.text, fontSize: 21, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.4 }}>
          Get verified
        </Text>
      </View>

      {phase === 'loading' && <Center><ActivityIndicator color={colors.accent} /></Center>}

      {phase === 'approved' && (
        <Center>
          <SealCheck color={colors.accent} size={72} weight="fill" />
          <Text style={{ color: colors.text, fontSize: 24, fontFamily: 'Fraunces_600SemiBold' }}>You’re verified</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center' }}>
            The badge now shows next to your name across Echo.
          </Text>
        </Center>
      )}

      {phase === 'pending' && (
        <Center>
          <Timer color={colors.accent} size={64} weight="fill" />
          <Text style={{ color: colors.text, fontSize: 22, fontFamily: 'Fraunces_600SemiBold' }}>In review</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center' }}>
            A reviewer is taking a look at your selfie. This usually takes less than a day.
          </Text>
        </Center>
      )}

      {phase === 'submitting' && (
        <Center>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Checking your selfie…</Text>
        </Center>
      )}

      {phase === 'rejected' && (
        <Center>
          <XCircle color="#EF4444" size={64} weight="fill" />
          <Text style={{ color: colors.text, fontSize: 22, fontFamily: 'Fraunces_600SemiBold' }}>Not this time</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center' }}>
            {rejectReason ?? 'The selfie couldn’t be confirmed.'}
          </Text>
          <AnimatedPressable onPress={retry} scaleValue={0.96} haptic="medium" style={{ backgroundColor: colors.accent, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Try again</Text>
          </AnimatedPressable>
        </Center>
      )}

      {phase === 'preview' && selfieUri && (
        <ScrollView contentContainerStyle={{ padding: 24, gap: 18, alignItems: 'center' }}>
          <Image source={{ uri: selfieUri }} style={{ width: 240, height: 320, borderRadius: 24, backgroundColor: colors.surface }} resizeMode="cover" />
          <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center' }}>
            Pose: {pose.toLowerCase()}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <AnimatedPressable onPress={takeSelfie} scaleValue={0.96} haptic="light" style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 22, paddingVertical: 14 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>Retake</Text>
            </AnimatedPressable>
            <AnimatedPressable onPress={submit} scaleValue={0.96} haptic="medium" style={{ backgroundColor: colors.accent, borderRadius: 16, paddingHorizontal: 26, paddingVertical: 14 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Submit</Text>
            </AnimatedPressable>
          </View>
        </ScrollView>
      )}

      {phase === 'intro' && (
        <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <SealCheck color={colors.accent} size={56} weight="fill" />
          </View>
          <Text style={{ color: colors.text, fontSize: 17, lineHeight: 25, fontFamily: 'Fraunces_500Medium', textAlign: 'center' }}>
            Prove you’re the real person behind your profile and get the verified badge.
          </Text>

          {rejectReason ? (
            <View style={{ backgroundColor: '#EF444414', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#EF444433' }}>
              <Text style={{ color: '#EF4444', fontSize: 13.5, lineHeight: 19 }}>Last attempt: {rejectReason}</Text>
            </View>
          ) : null}

          <View style={{ gap: 14 }}>
            {[
              { icon: <Camera color={colors.accent} size={20} weight="fill" />, text: 'Take a live selfie — we’ll ask for a quick pose so it can’t be a saved photo.' },
              { icon: <SealCheck color={colors.accent} size={20} weight="fill" />, text: 'It’s compared with your profile photo. A clear match verifies you instantly; otherwise a human reviews it.' },
              { icon: <ShieldCheck color={colors.accent} size={20} weight="fill" />, text: 'Your selfie is used only for this check and deleted as soon as a decision is made. It is never shown on your profile.' },
            ].map((row, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View style={{ marginTop: 1 }}>{row.icon}</View>
                <Text style={{ color: colors.textSecondary, fontSize: 14.5, lineHeight: 21, flex: 1 }}>{row.text}</Text>
              </View>
            ))}
          </View>

          {!profile?.avatar_url ? (
            <View style={{ backgroundColor: '#F59E0B14', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F59E0B33' }}>
              <Text style={{ color: '#F59E0B', fontSize: 13.5, lineHeight: 19 }}>
                You need a profile photo with your face first — add one in Edit profile, then come back.
              </Text>
            </View>
          ) : (
            <>
              <View style={{ backgroundColor: colors.accent + '12', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.accent + '33' }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>YOUR POSE</Text>
                <Text style={{ color: colors.text, fontSize: 17, fontFamily: 'Fraunces_600SemiBold' }}>{pose}</Text>
              </View>
              <AnimatedPressable onPress={takeSelfie} scaleValue={0.96} haptic="medium" style={{ backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                <Camera color="#fff" size={18} weight="fill" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Take the selfie</Text>
              </AnimatedPressable>
            </>
          )}

          {!profile?.avatar_url && (
            <Pressable onPress={() => router.push('/edit-profile')}>
              <Text style={{ color: colors.accent, fontSize: 14.5, fontWeight: '700', textAlign: 'center', paddingVertical: 6 }}>
                Go to Edit profile
              </Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}
