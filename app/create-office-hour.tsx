import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Check } from 'phosphor-react-native';
import { TextInput } from '../components/ui/TextInput';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { showToast } from '../components/ui/Toast';
import { useTheme } from '../lib/theme';
import { createOfficeHour } from '../lib/supabaseEchoApi';

const DURATIONS = [
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '90 min', value: 90 },
];

// Quick-start offsets in minutes from now
const START_OFFSETS = [
  { label: 'In 1 hour', value: 60 },
  { label: 'Tonight (7pm)', value: -1 }, // computed
  { label: 'Tomorrow 10am', value: -2 }, // computed
];

function computeStartAt(option: typeof START_OFFSETS[number]): Date {
  const now = new Date();
  if (option.value === -1) {
    const d = new Date(now);
    d.setHours(19, 0, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }
  if (option.value === -2) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d;
  }
  return new Date(now.getTime() + option.value * 60000);
}

export default function CreateOfficeHourScreen() {
  const router = useRouter();
  const { colors, radius, fontSizes, animation } = useTheme();
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(60);
  const [startOffset, setStartOffset] = useState(START_OFFSETS[0]);
  const [submitting, setSubmitting] = useState(false);

  const startAt = computeStartAt(startOffset);
  const canSubmit = topic.trim().length >= 3 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const oh = await createOfficeHour({
        topic: topic.trim(),
        description: description.trim() || undefined,
        starts_at: startAt.toISOString(),
        duration_minutes: duration,
      });
      showToast('Office Hours scheduled', '🎙️');
      router.replace(`/office-hours/${oh.id}` as any);
    } catch (e) {
      Alert.alert('Could not schedule', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} style={{ padding: 4 }} scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Schedule</Text>
        <AnimatedPressable
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.lg, backgroundColor: canSubmit ? colors.accent : colors.surfaceHover }}
          scaleValue={0.93}
          haptic="medium"
        >
          {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Check color="#fff" size={15} weight="bold" />}
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small }}>Create</Text>
        </AnimatedPressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Animated.View entering={animation(FadeInDown.duration(220))} style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, fontWeight: '500', marginBottom: 8, marginLeft: 4 }}>Topic</Text>
          <TextInput value={topic} onChangeText={setTopic} placeholder="What's the conversation about?" maxLength={80} />
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(100).duration(220))} style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, fontWeight: '500', marginBottom: 8, marginLeft: 4 }}>Description (optional)</Text>
          <TextInput value={description} onChangeText={setDescription} placeholder="Set expectations for what you'll cover" multiline />
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(200).duration(220))} style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, fontWeight: '500', marginBottom: 8, marginLeft: 4 }}>When</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {START_OFFSETS.map((opt) => {
              const active = startOffset.label === opt.label;
              return (
                <AnimatedPressable
                  key={opt.label}
                  onPress={() => setStartOffset(opt)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99,
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.border,
                    backgroundColor: active ? colors.accent + '22' : 'transparent',
                  }}
                  scaleValue={0.94}
                  haptic="light"
                >
                  <Text style={{ color: active ? colors.accent : colors.textMuted, fontWeight: '600', fontSize: 13 }}>{opt.label}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 6, marginLeft: 4 }}>
            Starts: {startAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </Text>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(300).duration(220))} style={{ marginBottom: 24 }}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, fontWeight: '500', marginBottom: 8, marginLeft: 4 }}>Duration</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {DURATIONS.map(d => {
              const active = duration === d.value;
              return (
                <AnimatedPressable
                  key={d.value}
                  onPress={() => setDuration(d.value)}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 99,
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.border,
                    backgroundColor: active ? colors.accent + '22' : 'transparent',
                  }}
                  scaleValue={0.94}
                  haptic="light"
                >
                  <Text style={{ color: active ? colors.accent : colors.textMuted, fontWeight: '600', fontSize: 13 }}>{d.label}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
