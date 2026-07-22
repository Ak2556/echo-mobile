import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Brain, ChatTeardropDots, Check, Clock, ShieldCheck, Trash } from 'phosphor-react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { GlassPanel } from '../components/ui/GlassPanel';
import { showToast } from '../components/ui/Toast';
import {
  getPersonaStatus,
  loadPersonaProfile,
  PersonaProfile,
  PersonaStatus,
  resetPersonaProfile,
  setPersonaEnabled,
  setPersonaUserNote,
} from '../lib/persona';
import { useTheme } from '../lib/theme';
import { useResponsiveLayout } from '../lib/responsive';
import { useAppStore } from '../store/useAppStore';
import { track } from '../lib/analytics';

function stageLabel(stage: PersonaStatus['stage']): string {
  switch (stage) {
    case 'ready': return 'Ready';
    case 'calibrating': return 'Calibrating';
    case 'observing': return 'Learning';
    default: return 'Paused';
  }
}

function SummaryList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  const theme = useTheme();
  const { colors, fontSizes } = theme;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontSize: fontSizes.body, fontWeight: '700' }}>{title}</Text>
      {items.length ? items.map(item => (
        <View key={item} style={styles.bulletRow}>
          <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption, lineHeight: 19, flex: 1 }}>{item}</Text>
        </View>
      )) : (
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, lineHeight: 19 }}>{empty}</Text>
      )}
    </View>
  );
}

export default function PersonaScreen() {
  const router = useRouter();
  const theme = useTheme();
  const layout = useResponsiveLayout();
  const { colors, radius, fontSizes, animation } = theme;
  const personaLearningEnabled = useAppStore(s => s.personaLearningEnabled);
  const setPersonaLearningEnabled = useAppStore(s => s.setPersonaLearningEnabled);
  const accountUserId = useAppStore(s => s.userId);
  const [profile, setProfile] = useState<PersonaProfile>(() => loadPersonaProfile(accountUserId));
  const [note, setNote] = useState(profile.userNote);

  const refresh = useCallback(() => {
    const next = loadPersonaProfile(accountUserId);
    setProfile(next);
    setNote(next.userNote);
    setPersonaLearningEnabled(next.enabled);
  }, [accountUserId, setPersonaLearningEnabled]);

  useFocusEffect(useCallback(() => {
    refresh();
  }, [refresh]));

  const status = getPersonaStatus(profile);
  const progress = Math.max(0, Math.min(100, status.readiness));

  const togglePersona = (enabled: boolean) => {
    setPersonaLearningEnabled(enabled);
    const next = setPersonaEnabled(enabled, accountUserId);
    setProfile(next);
    track(enabled ? 'persona_learning_started' : 'persona_learning_disabled');
  };

  const saveNote = () => {
    const next = setPersonaUserNote(note, accountUserId);
    setProfile(next);
    track('persona_note_updated');
    showToast('Persona note saved');
  };

  const reset = () => {
    Alert.alert('Reset persona?', 'This clears the learned persona on this device and starts learning again from future chats.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          const next = resetPersonaProfile(accountUserId);
          setProfile(next);
          setNote('');
          setPersonaLearningEnabled(true);
          track('persona_snapshot_reset');
          showToast('Persona reset');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Personal Persona"
        subtitle="Echo learns how you think, write, and decide."
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[layout.contentStyle, { paddingHorizontal: layout.gutter, paddingBottom: 40, gap: 16 }]}
      >
        <Animated.View entering={animation(FadeInDown.delay(40).duration(220))}>
          <GlassPanel borderRadius={radius.card} contentStyle={{ padding: 18, gap: 16 }}>
            <View style={styles.heroRow}>
              <View style={[styles.heroIcon, { backgroundColor: colors.accentMuted, borderRadius: radius.lg }]}>
                <Brain color={colors.accent} size={28} weight="fill" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{stageLabel(status.stage)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 4, lineHeight: 19 }}>
                  Persona becomes reliable after about 6 days and enough real conversations.
                </Text>
              </View>
              <Switch
                value={personaLearningEnabled && profile.enabled}
                onValueChange={togglePersona}
                trackColor={{ false: colors.surfaceHover, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>

            <View>
              <View style={styles.progressMeta}>
                <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption, fontWeight: '700' }}>
                  {progress}% calibrated
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>
                  {status.daysObserved}d · {status.signalCount} signals
                </Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: colors.surfaceHover }]}>
                <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.accent }]} />
              </View>
            </View>
          </GlassPanel>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(80).duration(220))}>
          <GlassPanel borderRadius={radius.card} contentStyle={{ padding: 16, gap: 14 }}>
            <View style={styles.row}>
              <Clock color={colors.accent} size={20} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: fontSizes.body, fontWeight: '700' }}>First-week learning</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 3, lineHeight: 19 }}>
                  Echo uses your own chats to learn recurring topics, voice, values, and answer style.
                </Text>
              </View>
            </View>
            <View style={styles.row}>
              <ShieldCheck color={colors.accent} size={20} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: fontSizes.body, fontWeight: '700' }}>Private by default</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 3, lineHeight: 19 }}>
                  The persona summary is used only to personalize Echo replies when you message Echo.
                </Text>
              </View>
            </View>
          </GlassPanel>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(120).duration(220))}>
          <GlassPanel borderRadius={radius.card} contentStyle={{ padding: 16, gap: 16 }}>
            <SummaryList title="Voice and preferences" items={profile.traits} empty="Chat naturally with Echo and this will fill in." />
            <SummaryList title="Values" items={profile.values} empty="Say what matters to you and Echo will preserve it here." />
            <SummaryList title="Recurring topics" items={profile.topics} empty="Topics appear as Echo sees repeated patterns." />
            <SummaryList title="Response style" items={profile.responseStyle} empty="Echo will infer whether you prefer concise, deep, tactical, or reflective replies." />
          </GlassPanel>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(160).duration(220))}>
          <GlassPanel borderRadius={radius.card} contentStyle={{ padding: 16, gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: fontSizes.body, fontWeight: '700' }}>Direct note</Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, lineHeight: 19 }}>
              Add anything Echo should always remember about your voice or judgment.
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Example: I like clear tradeoffs, direct language, and practical next steps."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={600}
              style={[
                styles.input,
                {
                  borderColor: colors.glassBorder,
                  backgroundColor: colors.inputBg,
                  color: colors.text,
                  borderRadius: radius.md,
                },
              ]}
            />
            <AnimatedPressable
              onPress={saveNote}
              style={[styles.primaryButton, { backgroundColor: colors.accent, borderRadius: radius.md }]}
              accessibilityRole="button"
              accessibilityLabel="Save persona note"
            >
              <Check color="#fff" size={18} weight="bold" />
              <Text style={{ color: '#fff', fontSize: fontSizes.body, fontWeight: '800' }}>Save note</Text>
            </AnimatedPressable>
          </GlassPanel>
        </Animated.View>

        <View style={styles.actions}>
          <AnimatedPressable
            onPress={() => router.push('/(tabs)/chat')}
            style={[styles.secondaryButton, { borderColor: colors.glassBorder, backgroundColor: colors.surfaceHover, borderRadius: radius.md }]}
          >
            <ChatTeardropDots color={colors.text} size={18} />
            <Text style={{ color: colors.text, fontSize: fontSizes.body, fontWeight: '700' }}>Chat with Echo</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={reset}
            style={[styles.secondaryButton, { borderColor: colors.dangerMuted, backgroundColor: colors.dangerMuted, borderRadius: radius.md }]}
          >
            <Trash color={colors.danger} size={18} />
            <Text style={{ color: colors.danger, fontSize: fontSizes.body, fontWeight: '700' }}>Reset persona</Text>
          </AnimatedPressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  iconButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  heroRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  heroIcon: {
    alignItems: 'center',
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressTrack: {
    borderRadius: 999,
    height: 8,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 999,
    height: '100%',
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  bulletRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
  },
  dot: {
    borderRadius: 999,
    height: 6,
    marginTop: 7,
    width: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    minHeight: 108,
    paddingHorizontal: 12,
    paddingVertical: 11,
    textAlignVertical: 'top',
  },
  primaryButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
  },
  actions: {
    gap: 10,
    paddingBottom: 10,
  },
  secondaryButton: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 46,
  },
});
