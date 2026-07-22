import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ChartLineUp, Flame, Heart, Sparkle } from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useTheme } from '../lib/theme';
import { fetchOrComputeYearWrap, type YearWrap } from '../lib/supabaseEchoApi';
import { V2FeatureGuard } from '../components/common/V2FeatureGuard';

/**
 * Year in Echo — Spotify-Wrapped-style recap of your year.
 * Lazy-computed on first open by aggregating the viewer's own echoes
 * from this calendar year.
 */

function YearInEchoScreenInner() {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const [wrap, setWrap] = useState<YearWrap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const w = await fetchOrComputeYearWrap();
        setWrap(w);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const year = new Date().getFullYear();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={`Year in Echo ${year}`} />

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 12 }}>Computing your year…</Text>
        </View>
      ) : !wrap || wrap.total_echoes === 0 ? (
        <View style={{ flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center' }}>
          <Sparkle color={colors.textMuted} size={48} />
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
            Your year is just getting started
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            {"Post a few echoes and come back. We'll roll up your stats, top topics, and most-loved echo."}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {/* Hero gradient card */}
          <Animated.View entering={FadeInUp.duration(220)} style={{ marginBottom: 16 }}>
            <LinearGradient
              colors={['#A855F7', '#3B82F6', '#06B6D4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 24, borderRadius: 24, alignItems: 'center' }}
            >
              <Sparkle color="#fff" size={32} weight="fill" />
              <Text style={{ color: '#fff', fontSize: 38, fontWeight: '800', marginTop: 8 }}>{wrap.total_echoes}</Text>
              <Text style={{ color: '#fff', fontSize: 14, opacity: 0.9, marginTop: 4, fontWeight: '600' }}>echoes posted in {year}</Text>
            </LinearGradient>
          </Animated.View>

          {/* Stat grid */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <Animated.View entering={FadeInUp.delay(100).duration(220)} style={{ flex: 1 }}>
              <StatCard
                icon={<Heart color="#EF4444" size={20} weight="fill" />}
                value={wrap.total_likes_received}
                label="hearts"
              />
            </Animated.View>
            <Animated.View entering={FadeInUp.delay(150).duration(220)} style={{ flex: 1 }}>
              <StatCard
                icon={<ChartLineUp color="#10B981" size={20} weight="fill" />}
                value={wrap.total_reactions}
                label="reactions"
              />
            </Animated.View>
            <Animated.View entering={FadeInUp.delay(200).duration(220)} style={{ flex: 1 }}>
              <StatCard
                icon={<Flame color="#F59E0B" size={20} weight="fill" />}
                value={wrap.longest_streak}
                label="longest streak"
              />
            </Animated.View>
          </View>

          {/* Top topics */}
          {wrap.top_topics.length > 0 && (
            <Animated.View entering={FadeInUp.delay(250).duration(220)} style={{ marginBottom: 16 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 10, marginLeft: 4 }}>
                Top Topics
              </Text>
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {wrap.top_topics.map((tag, i) => (
                    <View
                      key={tag}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 99,
                        backgroundColor: colors.accent + (i === 0 ? '44' : i === 1 ? '33' : '22'),
                        borderWidth: 1,
                        borderColor: colors.accent + '55',
                      }}
                    >
                      <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>
          )}

          {/* Top echo */}
          {wrap.top_echo_prompt && (
            <Animated.View entering={FadeInUp.delay(300).duration(220)}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 10, marginLeft: 4 }}>
                Most-loved echo
              </Text>
              <AnimatedPressable
                onPress={() => wrap.top_echo_id && router.push(`/thread/${wrap.top_echo_id}`)}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radius.lg,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: colors.accent + '55',
                  borderLeftWidth: 4,
                  borderLeftColor: colors.accent,
                }}
                scaleValue={0.98}
                haptic="light"
              >
                <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>
                  YOUR HIT OF THE YEAR
                </Text>
                <Text style={{ color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '600' }}>
                  {wrap.top_echo_prompt}
                </Text>
              </AnimatedPressable>
            </Animated.View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: 14,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
      }}
    >
      {icon}
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 4 }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

export default function YearInEchoScreen() { return <V2FeatureGuard flag="yearInEcho"><YearInEchoScreenInner /></V2FeatureGuard>; }
