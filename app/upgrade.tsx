import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Sparkle, Check } from 'phosphor-react-native';
import { useTheme } from '../lib/theme';
import { PLANS } from '../constants/subscriptions';
import { EmptyState } from '../components/common/EmptyState';
import { showToast } from '../components/ui/Toast';

/**
 * Echo Pro upgrade screen.
 *
 * v1 ships as a paywall placeholder — there's no IAP integration yet, so
 * tapping "Upgrade to Pro" just confirms the request and routes back.
 * When Apple IAP / RevenueCat lands, replace `handleUpgrade` with the
 * real purchase call.
 *
 * The screen is reached from the ProGate component, which is shown when a
 * free user hits a limit (e.g. 30 AI requests in an hour).
 */
export default function UpgradeScreen() {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const pro = PLANS.pro;

  const handleUpgrade = () => {
    // TODO(payments): kick off the IAP flow here.
    showToast('Pro is coming soon — we\'ll email you the moment it launches.', '✨');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{ padding: 4, marginRight: 12 }}
        >
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18, flex: 1 }}>
          Upgrade to Pro
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }}>
        <EmptyState
          icon={<Sparkle color={colors.accent} size={28} weight="fill" />}
          title={pro.name}
          subtitle="More AI, unlimited saved chats, and early access to new features."
        />

        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.card,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            padding: 20,
            gap: 14,
          }}
        >
          {[
            `${pro.aiRequestsPerDay} AI requests per day`,
            'Unlimited saved chats',
            'Early access to new features',
            'Priority support',
          ].map((feature) => (
            <View key={feature} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Check color={colors.accent} size={18} weight="bold" />
              <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{feature}</Text>
            </View>
          ))}
        </View>

        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ color: colors.text, fontSize: 32, fontWeight: '800' }}>
            ${pro.price.toFixed(2)}
            <Text style={{ color: colors.textMuted, fontSize: 16, fontWeight: '500' }}>/month</Text>
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Cancel anytime in Settings.</Text>
        </View>

        <Pressable
          onPress={handleUpgrade}
          accessibilityRole="button"
          accessibilityLabel={`Upgrade to ${pro.name}`}
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.accentMuted : colors.accent,
            borderRadius: radius.lg,
            paddingVertical: 16,
            alignItems: 'center',
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Upgrade to Pro</Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Maybe later"
          style={{ alignItems: 'center', paddingVertical: 12 }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>
            Maybe later
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
