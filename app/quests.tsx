import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ArrowLeft, CheckCircle, Lightning, Trophy } from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { useTheme } from '../lib/theme';
import { fetchActiveQuests, type Quest } from '../lib/supabaseEchoApi';
import { V2FeatureGuard } from '../components/common/V2FeatureGuard';

function QuestsScreenInner() {
  const router = useRouter();
  const { colors, radius, fontSizes } = useTheme();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchActiveQuests();
        setQuests(list);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const dailyQuests = useMemo(() => quests.filter(q => q.recurrence === 'daily'), [quests]);
  const weeklyQuests = useMemo(() => quests.filter(q => q.recurrence === 'weekly'), [quests]);
  const otherQuests = useMemo(() => quests.filter(q => q.recurrence !== 'daily' && q.recurrence !== 'weekly'), [quests]);

  const totalCompleted = quests.filter(q => q.completed_at).length;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} style={{ padding: 4 }} scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Quests</Text>
        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{totalCompleted}/{quests.length} ✓</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {dailyQuests.length > 0 && (
            <Section title="Today" icon={<Lightning color={colors.accent} size={16} weight="fill" />} quests={dailyQuests} />
          )}
          {weeklyQuests.length > 0 && (
            <Section title="This Week" icon={<Trophy color="#EAB308" size={16} weight="fill" />} quests={weeklyQuests} />
          )}
          {otherQuests.length > 0 && (
            <Section title="Other" icon={<Trophy color={colors.textMuted} size={16} />} quests={otherQuests} />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Section({ title, icon, quests }: { title: string; icon: React.ReactNode; quests: Quest[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, marginLeft: 4 }}>
        {icon}
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{title}</Text>
      </View>
      {quests.map((q, i) => (
        <Animated.View key={q.id} entering={FadeInUp.delay(i * 30).duration(220)}>
          <QuestRow quest={q} />
        </Animated.View>
      ))}
    </View>
  );
}

function QuestRow({ quest }: { quest: Quest }) {
  const { colors, radius, fontSizes } = useTheme();
  const progress = Math.min(quest.progress ?? 0, quest.goal_value);
  const pct = (progress / quest.goal_value) * 100;
  const completed = !!quest.completed_at;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: completed ? colors.accent + '66' : colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ marginTop: 2 }}>
          {completed
            ? <CheckCircle color={colors.accent} size={20} weight="fill" />
            : <View style={{ width: 20, height: 20, borderRadius: 99, borderWidth: 2, borderColor: colors.border }} />
          }
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{quest.title}</Text>
            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>+{quest.reward_xp} XP</Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 8 }}>
            {quest.description}
          </Text>
          {/* Progress bar */}
          <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2 }}>
            <View
              style={{
                height: 4,
                borderRadius: 2,
                width: `${pct}%`,
                backgroundColor: completed ? colors.accent : '#10B981',
              }}
            />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
            {progress}/{quest.goal_value} {completed ? '· completed' : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function QuestsScreen() { return <V2FeatureGuard flag="quests"><QuestsScreenInner /></V2FeatureGuard>; }
