import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SealCheck, CheckCircle, XCircle } from 'phosphor-react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { GlassPanel } from '../components/ui/GlassPanel';
import { useTheme } from '../lib/theme';
import { showToast } from '../components/ui/Toast';
import {
  VerificationQueueItem, decideVerification, listVerificationQueue,
} from '../lib/verificationApi';

function VerificationCard({ item, onDecide }: {
  item: VerificationQueueItem;
  onDecide: (id: string, approve: boolean) => Promise<void>;
}) {
  const { colors, font, fontSizes, radius } = useTheme();
  const [busy, setBusy] = useState(false);

  const confirm = (approve: boolean) => {
    Alert.alert(
      approve ? 'Approve verification' : 'Reject verification',
      approve
        ? 'Grant the verified badge — the selfie matches the profile photo.'
        : 'Reject — the selfie could not be confirmed. The selfie is deleted either way.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: approve ? 'Approve' : 'Reject',
          style: approve ? 'default' : 'destructive',
          onPress: async () => { setBusy(true); try { await onDecide(item.id, approve); } finally { setBusy(false); } },
        },
      ],
    );
  };

  const v = item.ai_verdict;
  return (
    <GlassPanel borderRadius={radius.card} contentStyle={{ padding: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[font.bodySemibold, { color: colors.text, fontSize: fontSizes.small, flex: 1 }]}>
          @{item.profiles?.username ?? 'unknown'}
        </Text>
        <Text style={[font.body, { color: colors.textMuted, fontSize: 11 }]}>
          {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          {item.profiles?.avatar_url ? (
            <Image source={{ uri: item.profiles.avatar_url }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 14, backgroundColor: colors.surfaceHover }} resizeMode="cover" />
          ) : (
            <View style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 14, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>No photo</Text>
            </View>
          )}
          <Text style={[font.body, { color: colors.textMuted, fontSize: 11 }]}>Profile photo</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          {item.selfie_url ? (
            <Image source={{ uri: item.selfie_url }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 14, backgroundColor: colors.surfaceHover }} resizeMode="cover" />
          ) : (
            <View style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 14, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Selfie missing</Text>
            </View>
          )}
          <Text style={[font.body, { color: colors.textMuted, fontSize: 11 }]}>Selfie · {item.pose.toLowerCase()}</Text>
        </View>
      </View>

      {v ? (
        <View style={{ padding: 10, backgroundColor: colors.surfaceHover, borderRadius: 8 }}>
          <Text style={[font.body, { color: colors.textSecondary, fontSize: fontSizes.caption, lineHeight: 18 }]}>
            AI: {v.same_person ? 'same person' : 'match unclear'} · {v.live_selfie ? 'live selfie' : 'liveness unclear'} ·
            {' '}confidence {Math.round((v.confidence ?? 0) * 100)}%{v.reason ? ` — ${v.reason}` : ''}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <AnimatedPressable
          onPress={() => confirm(false)} disabled={busy} scaleValue={0.96} haptic="light"
          style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: '#EF444455', paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: busy ? 0.5 : 1 }}
        >
          <XCircle color="#EF4444" size={16} weight="fill" />
          <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>Reject</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => confirm(true)} disabled={busy} scaleValue={0.96} haptic="medium"
          style={{ flex: 1, borderRadius: 12, backgroundColor: '#10B981', paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: busy ? 0.5 : 1 }}
        >
          <CheckCircle color="#fff" size={16} weight="fill" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Approve</Text>
        </AnimatedPressable>
      </View>
    </GlassPanel>
  );
}

export default function ModVerificationsScreen() {
  const { colors, font, fontSizes } = useTheme();
  const [items, setItems] = useState<VerificationQueueItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await listVerificationQueue());
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load queue', 'Error');
      setItems([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const decide = async (id: string, approve: boolean) => {
    try {
      await decideVerification(id, approve);
      setItems(prev => (prev ?? []).filter(i => i.id !== id));
      showToast(approve ? 'Verified' : 'Rejected', approve ? 'CheckCircle' : 'Removed');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Decision failed', 'Error');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Verification queue"
        right={<SealCheck color={colors.accent} size={20} weight="fill" style={{ marginRight: 8 }} />}
      />

      {items === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} />}
        >
          {items.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 60, gap: 10 }}>
              <SealCheck color={colors.glassBorder} size={44} weight="duotone" />
              <Text style={[font.body, { color: colors.textMuted, fontSize: fontSizes.body }]}>No pending verifications</Text>
            </View>
          ) : items.map((item, i) => (
            <Animated.View key={item.id} entering={FadeInDown.delay(Math.min(i, 6) * 40).duration(220)}>
              <VerificationCard item={item} onDecide={decide} />
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
