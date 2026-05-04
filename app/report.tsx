import React, { useState } from 'react';
import { View, Text, Alert, TextInput as RNTextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Warning } from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { showToast } from '../components/ui/Toast';
import { submitRemoteReport } from '../lib/supabaseEchoApi';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { useTheme } from '../lib/theme';

const REASONS = [
  'Spam or misleading',
  'Harassment or bullying',
  'Hate speech',
  'Violence or threats',
  'Inappropriate content',
  'Impersonation',
  'Other',
];

export default function ReportScreen() {
  const router = useRouter();
  const { colors, radius, fontSizes } = useTheme();
  const { targetType, targetId, targetName } = useLocalSearchParams<{
    targetType: string; targetId: string; targetName: string;
  }>();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert('Select a reason', 'Please select a reason for your report.');
      return;
    }
    setSubmitting(true);
    try {
      if (isSupabaseRemote() && targetId && targetType) {
        await submitRemoteReport({
          targetType: targetType as 'echo' | 'user' | 'comment',
          targetId,
          reason: selectedReason,
          details: details.trim() || undefined,
        });
      }
      showToast('Report submitted. Thank you!', '✅');
      router.back();
    } catch (e) {
      Alert.alert('Could not submit', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }} scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.title }}>Report</Text>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
        <Animated.View entering={FadeInDown.delay(50).springify()} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Warning color="#F59E0B" size={20} />
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginLeft: 8 }}>
            Report {targetType === 'user' ? `@${targetName}` : 'this content'}
          </Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.small, marginBottom: 24, lineHeight: 20 }}>
            Select the reason that best describes the issue. Your report is confidential.
          </Text>
        </Animated.View>

        {REASONS.map((reason, i) => (
          <Animated.View key={reason} entering={FadeInDown.delay(120 + i * 40).springify()}>
            <AnimatedPressable
              onPress={() => setSelectedReason(reason)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: radius.lg,
                marginBottom: 8,
                borderWidth: 1,
                backgroundColor: selectedReason === reason ? colors.accentMuted : colors.surface,
                borderColor: selectedReason === reason ? colors.accent : colors.border,
              }}
              scaleValue={0.97}
              haptic="light"
            >
              <View style={{
                width: 20, height: 20, borderRadius: 10, borderWidth: 2, marginRight: 12,
                alignItems: 'center', justifyContent: 'center',
                borderColor: selectedReason === reason ? colors.accent : colors.border,
              }}>
                {selectedReason === reason && (
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />
                )}
              </View>
              <Text style={{ color: colors.text, fontSize: fontSizes.body }}>{reason}</Text>
            </AnimatedPressable>
          </Animated.View>
        ))}

        {selectedReason === 'Other' && (
          <Animated.View entering={FadeInDown.springify()} style={{ marginTop: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 12 }}>
            <RNTextInput
              style={{ color: colors.text, fontSize: fontSizes.body }}
              placeholder="Describe the issue..."
              placeholderTextColor={colors.textMuted}
              value={details}
              onChangeText={setDetails}
              multiline
              maxLength={500}
            />
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(400).springify()}>
          <AnimatedPressable
            onPress={() => { void handleSubmit(); }}
            disabled={submitting}
            style={{
              marginTop: 24,
              paddingVertical: 16,
              borderRadius: radius.lg,
              alignItems: 'center',
              backgroundColor: selectedReason && !submitting ? colors.danger : colors.surfaceHover,
            }}
            scaleValue={0.97}
            haptic="heavy"
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.body }}>
              {submitting ? 'Submitting…' : 'Submit Report'}
            </Text>
          </AnimatedPressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
