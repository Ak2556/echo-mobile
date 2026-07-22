import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Sparkle, Check, Crown } from 'phosphor-react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useTheme } from '../lib/theme';
import { PLANS } from '../constants/subscriptions';
import { EmptyState } from '../components/common/EmptyState';
import { showToast } from '../components/ui/Toast';

/**
 * Echo tier upgrade screen.
 *
 * Echo Pro upgrade screen. App Store purchases are not connected in this
 * build, so the CTA records interest instead of starting a purchase.
 *
 * The screen is reached from the ProGate component, which is shown when a
 * free user hits a tier limit.
 */
export default function UpgradeScreen() {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const visiblePlans = [PLANS.plus, PLANS.pro, PLANS.founder];

  const handleUpgrade = () => {
    showToast('We\'ll let you know when paid tiers open.', 'Update');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <ScreenHeader title="Echo Tiers" />

      <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }}>
        <EmptyState
          icon={<Sparkle color={colors.accent} size={28} weight="fill" />}
          title="Echo Tiers"
          subtitle="Every person gets a unique Echo. Higher tiers add more capacity, deeper persona memory, and exclusive access."
        />

        <View style={{ gap: 12 }}>
          {visiblePlans.map((plan) => (
            <View
              key={plan.id}
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.card,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: plan.exclusive ? colors.accent : colors.border,
                padding: 18,
                gap: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {plan.exclusive ? (
                  <Crown color={colors.accent} size={20} weight="fill" />
                ) : (
                  <Sparkle color={colors.accent} size={20} weight="fill" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 19, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.4 }}>{plan.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{plan.tagline}</Text>
                </View>
                <Text style={{ color: colors.text, fontSize: 17, fontFamily: 'Fraunces_600SemiBold' }}>
                  {plan.price === 0 ? 'Invite' : `$${plan.price.toFixed(2)}`}
                </Text>
              </View>
              {[
                `${plan.aiRequestsPerHour} AI requests per hour`,
                plan.maxSavedChats === -1 ? 'Unlimited saved chats' : `${plan.maxSavedChats} saved chats`,
                plan.personaDepth === 'replica' ? 'Replica persona mode' : plan.personaDepth === 'deep' ? 'Deep persona learning' : 'Personal persona learning',
                plan.exclusive ? 'Exclusive manual approval' : 'Standard access',
              ].map((feature) => (
                <View key={feature} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Check color={colors.accent} size={17} weight="bold" />
                  <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{feature}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ color: colors.text, fontSize: 34, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.6 }}>
            From ${PLANS.plus.price.toFixed(2)}
            <Text style={{ color: colors.textMuted, fontSize: 16, fontFamily: 'Inter_500Medium' }}>/month</Text>
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Founder access is invite-only.</Text>
        </View>

        <Pressable
          onPress={handleUpgrade}
          accessibilityRole="button"
          accessibilityLabel="Request tier access"
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.accentMuted : colors.accent,
            borderRadius: radius.lg,
            paddingVertical: 16,
            alignItems: 'center',
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Request access</Text>
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
