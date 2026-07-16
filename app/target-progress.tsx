import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { ArrowLeft, ChatCircleText, ShareNetwork, Target, UsersThree, SquaresFour } from 'phosphor-react-native';
import { useTheme } from '../lib/theme';
import { useResponsiveLayout } from '../lib/responsive';
import { useAppStore } from '../store/useAppStore';
import { getTargetCategory } from '../lib/targetCategories';
import { getTodayProductivity, type TodayProductivity } from '../lib/localSearch';
import { buildTargetProgressDigest, type TargetProgressDigest } from '../lib/targetProgress';
import { setPendingPublishContext } from '../lib/publishContext';
import { IconBadge } from '../components/ui/IconBadge';

export default function TargetProgressScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();
  const layout = useResponsiveLayout();
  const targetCategory = useAppStore(s => s.targetCategory);
  const targetOutcome = useAppStore(s => s.targetOutcome);
  const category = getTargetCategory(targetCategory);
  const [productivity, setProductivity] = useState<TodayProductivity | null>(null);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      getTodayProductivity()
        .then(next => { if (mounted) setProductivity(next); })
        .catch(() => { if (mounted) setProductivity(null); });
      return () => { mounted = false; };
    }, []),
  );

  const digest: TargetProgressDigest | null = productivity
    ? buildTargetProgressDigest(category, targetOutcome, productivity)
    : null;

  const shareProgress = () => {
    if (!digest) return;
    setPendingPublishContext({
      initialTitle: digest.title,
      initialAuthorNote: 'Progress update from my Echo target system.',
    });
    router.push({
      pathname: '/share',
      params: { prompt: digest.prompt, response: digest.response },
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{
        height: 56,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        paddingHorizontal: layout.gutter,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={[font.bodyBold, { color: colors.text, fontSize: 18 }]}>Progress</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[layout.contentStyle, {
          paddingHorizontal: layout.gutter,
          paddingTop: 18,
          paddingBottom: layout.bottomChromePadding + 24,
          gap: 16,
        }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconBadge color={colors.accent} size={48} radius={16}>
            <Target color="#fff" size={25} weight="bold" />
          </IconBadge>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[font.display, { color: colors.text, fontSize: 27, lineHeight: 32 }]}>
              {category.label}
            </Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 13, lineHeight: 19 }]} numberOfLines={2}>
              {targetOutcome.trim() || category.outcome}
            </Text>
          </View>
        </View>

        {!digest ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <>
            <View style={{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 16 }}>
              <Text style={[font.bodyBold, { color: colors.text, fontSize: 15, marginBottom: 10 }]}>Today&apos;s proof</Text>
              {digest.response.split('\n').slice(1, 6).map(line => (
                <Text key={line} style={[font.body, { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 6 }]}>
                  {line}
                </Text>
              ))}
            </View>

            <View style={{ gap: 10 }}>
              <ActionButton
                icon={<SquaresFour color="#fff" size={18} weight="bold" />}
                label="Open target tools"
                caption="Jump straight to the mini apps for this target."
                onPress={() => router.push('/(tabs)/apps' as Href)}
                filled
              />
              <ActionButton
                icon={<ShareNetwork color={colors.accent} size={18} weight="bold" />}
                label="Share progress"
                caption="Create a public Echo from the current progress digest."
                onPress={shareProgress}
              />
              <ActionButton
                icon={<ChatCircleText color={colors.accent} size={18} weight="bold" />}
                label="Do this with someone"
                caption="Invite a partner from messages and keep each other accountable."
                onPress={() => router.push('/messages' as Href)}
              />
              <ActionButton
                icon={<UsersThree color={colors.accent} size={18} weight="bold" />}
                label="Start a group"
                caption="Use a salon for group tasks, weekly check-ins, and comparison."
                onPress={() => router.push('/salons' as Href)}
              />
            </View>

            <View style={{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 16 }}>
              <Text style={[font.bodyBold, { color: colors.text, fontSize: 15, marginBottom: 12 }]}>Compare progress</Text>
              {digest.comparison.map((row, index) => (
                <View key={row.label} style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  borderBottomWidth: index < digest.comparison.length - 1 ? StyleSheet.hairlineWidth : 0,
                  borderBottomColor: colors.border,
                  gap: 10,
                }}>
                  <Text style={[font.bodySemibold, { color: colors.text, fontSize: 13, flex: 1 }]} numberOfLines={1}>
                    {row.label}
                  </Text>
                  <Metric label="You" value={row.you} />
                  <Metric label="Partner" value={row.partner} />
                  <Metric label="Group" value={row.group} />
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({
  icon,
  label,
  caption,
  onPress,
  filled = false,
}: {
  icon: React.ReactNode;
  label: string;
  caption: string;
  onPress: () => void;
  filled?: boolean;
}) {
  const { colors, radius, font } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        borderRadius: radius.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: filled ? colors.accent : colors.border,
        backgroundColor: filled ? colors.accent : colors.surface,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <IconBadge color={colors.accent} size={34} radius={12} muted={!filled}>
        {icon}
      </IconBadge>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[font.bodyBold, { color: filled ? '#fff' : colors.text, fontSize: 14 }]}>
          {label}
        </Text>
        <Text style={[font.body, { color: filled ? 'rgba(255,255,255,0.78)' : colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 }]}>
          {caption}
        </Text>
      </View>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ minWidth: 58, alignItems: 'flex-end' }}>
      <Text style={[font.bodySemibold, { color: colors.text, fontSize: 12 }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[font.body, { color: colors.textMuted, fontSize: 10 }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
