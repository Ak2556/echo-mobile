import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Clock, Scales, CheckCircle, XCircle, Warning, SealCheck } from 'phosphor-react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { GlassPanel } from '../components/ui/GlassPanel';
import { useTheme } from '../lib/theme';
import { fetchPendingAppeals, resolveAppeal, type PendingAppeal } from '../lib/supabaseEchoApi';

function slaColor(daysRemaining: number): string {
  if (daysRemaining <= 2) return '#EF4444';
  if (daysRemaining <= 5) return '#F59E0B';
  return '#10B981';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

function AppealCard({
  appeal,
  onResolve,
}: {
  appeal: PendingAppeal;
  onResolve: (id: string, resolution: 'upheld' | 'overturned', note: string) => Promise<void>;
}) {
  const { colors, font, fontSizes, radius } = useTheme();
  const [note, setNote] = useState('');
  const [resolving, setResolving] = useState(false);

  const handleResolve = async (resolution: 'upheld' | 'overturned') => {
    setResolving(true);
    try {
      await onResolve(appeal.id, resolution, note);
    } finally {
      setResolving(false);
    }
  };

  const confirmResolve = (resolution: 'upheld' | 'overturned') => {
    const label = resolution === 'upheld' ? 'Uphold appeal' : 'Overturn (dismiss)';
    Alert.alert(
      label,
      resolution === 'upheld'
        ? 'Mark this appeal as upheld — original moderation action stands.'
        : 'Overturn the moderation decision — content will be restored.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: label, style: resolution === 'upheld' ? 'default' : 'destructive', onPress: () => handleResolve(resolution) },
      ],
    );
  };

  return (
    <GlassPanel borderRadius={radius.card} contentStyle={{ padding: 14, gap: 10 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[font.bodySemibold, { color: colors.text, fontSize: fontSizes.small }]}>
          @{appeal.appellantUsername}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Clock size={12} color={slaColor(appeal.daysRemaining)} weight="bold" />
          <Text style={[font.bodySemibold, { color: slaColor(appeal.daysRemaining), fontSize: 11 }]}>
            {appeal.daysRemaining}d left (SLA)
          </Text>
        </View>
      </View>

      <Text style={[font.body, { color: colors.textMuted, fontSize: fontSizes.caption }]}>
        Submitted {timeAgo(appeal.createdAt)} · {appeal.reportTargetType} report
      </Text>

      {/* Report reason */}
      <View style={{ padding: 10, backgroundColor: colors.surfaceHover, borderRadius: 8, gap: 2 }}>
        <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: fontSizes.caption }]}>Original report</Text>
        <Text style={[font.body, { color: colors.textSecondary, fontSize: fontSizes.caption, lineHeight: 18 }]}>
          {appeal.reportReason}
        </Text>
      </View>

      {/* Appeal reason */}
      <View style={{ padding: 10, backgroundColor: colors.accentMuted, borderRadius: 8, gap: 2 }}>
        <Text style={[font.bodySemibold, { color: colors.accent, fontSize: fontSizes.caption }]}>{"User's appeal"}</Text>
        <Text style={[font.body, { color: colors.textSecondary, fontSize: fontSizes.caption, lineHeight: 18 }]}>
          {appeal.appealReason}
        </Text>
      </View>

      {/* Moderator note */}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Moderator note (optional, visible to user)"
        placeholderTextColor={colors.textMuted}
        multiline
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 10,
          color: colors.text,
          fontSize: fontSizes.caption,
          fontFamily: 'Inter_400Regular',
          minHeight: 60,
          textAlignVertical: 'top',
        }}
      />

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <AnimatedPressable
          onPress={() => confirmResolve('overturned')}
          disabled={resolving}
          scaleValue={0.95}
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            paddingVertical: 10, borderRadius: 8, backgroundColor: '#10B98120',
          }}
        >
          <CheckCircle size={15} color="#10B981" weight="bold" />
          <Text style={[font.bodySemibold, { color: '#10B981', fontSize: fontSizes.caption }]}>Overturn</Text>
        </AnimatedPressable>

        <AnimatedPressable
          onPress={() => confirmResolve('upheld')}
          disabled={resolving}
          scaleValue={0.95}
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            paddingVertical: 10, borderRadius: 8, backgroundColor: '#EF444420',
          }}
        >
          <XCircle size={15} color="#EF4444" weight="bold" />
          <Text style={[font.bodySemibold, { color: '#EF4444', fontSize: fontSizes.caption }]}>Uphold</Text>
        </AnimatedPressable>
      </View>

      {resolving && <ActivityIndicator color={colors.accent} size="small" />}
    </GlassPanel>
  );
}

export default function ModAppealsScreen() {
  const router = useRouter();
  const { colors, font, fontSizes } = useTheme();
  const [appeals, setAppeals] = useState<PendingAppeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchPendingAppeals()
      .then(setAppeals)
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load appeals'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleResolve = useCallback(async (
    id: string,
    resolution: 'upheld' | 'overturned',
    note: string,
  ) => {
    await resolveAppeal(id, resolution, note);
    setAppeals(prev => prev.filter(a => a.id !== id));
  }, []);

  const overdueCnt = appeals.filter(a => a.daysRemaining === 0).length;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Appeals Queue"
        subtitle="DSA Art. 20 · 14-day SLA"
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 }}>
            <AnimatedPressable
              onPress={() => router.push('/mod-verifications' as any)}
              scaleValue={0.9} haptic="light"
              style={{ padding: 6 }}
              accessibilityLabel="Verification queue"
            >
              <SealCheck color={colors.accent} size={20} weight="fill" />
            </AnimatedPressable>
            {!loading && (
              <View style={{
                paddingHorizontal: 10, paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: appeals.length > 0 ? colors.accentMuted : colors.surfaceHover,
              }}>
                <Text style={[font.bodySemibold, { color: appeals.length > 0 ? colors.accent : colors.textMuted, fontSize: fontSizes.caption }]}>
                  {appeals.length} pending
                </Text>
              </View>
            )}
          </View>
        }
      />

      {/* Overdue banner */}
      {overdueCnt > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, padding: 12, borderRadius: 10, backgroundColor: '#EF444420' }}>
          <Warning size={16} color="#EF4444" weight="bold" />
          <Text style={[font.bodySemibold, { color: '#EF4444', fontSize: fontSizes.caption }]}>
            {overdueCnt} appeal{overdueCnt > 1 ? 's' : ''} past the 14-day SLA
          </Text>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={[font.body, { color: colors.textMuted, textAlign: 'center' }]}>{error}</Text>
        </View>
      ) : appeals.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
          <Scales color={colors.border} size={40} weight="duotone" />
          <Text style={[font.bodyBold, { color: colors.text, fontSize: fontSizes.title }]}>All clear</Text>
          <Text style={[font.body, { color: colors.textMuted, textAlign: 'center', fontSize: fontSizes.small }]}>
            No pending appeals. The queue is empty.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {appeals.map((appeal, i) => (
            <Animated.View key={appeal.id} entering={FadeInDown.delay(i * 40).duration(220)}>
              <AppealCard appeal={appeal} onResolve={handleResolve} />
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
