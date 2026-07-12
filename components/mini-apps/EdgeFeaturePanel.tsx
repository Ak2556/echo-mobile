import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ArrowUpRight, ChatCircleText, ShareNetwork, Sparkle, UsersThree } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { GlassPanel } from '../ui/GlassPanel';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { showToast } from '../ui/Toast';

interface EdgeFeaturePanelProps {
  appName: string;
  accent: string;
  headline: string;
  caption: string;
  metrics?: { label: string; value: string }[];
  prompt?: string;
  shareText?: string;
  publishTitle?: string;
  publishBody?: string;
}

export function EdgeFeaturePanel({
  appName,
  accent,
  headline,
  caption,
  metrics = [],
  prompt,
  shareText,
  publishTitle,
  publishBody,
}: EdgeFeaturePanelProps) {
  const { colors } = useTheme();
  const router = useRouter();

  const shareProgress = () => {
    const message = shareText
      ?? `${appName} progress\n${metrics.map(metric => `${metric.label}: ${metric.value}`).join('\n')}`;
    Share.share({ message }).catch(() => showToast('Could not open share sheet', 'Error'));
  };

  const publish = () => {
    router.push({
      pathname: '/create-post',
      params: {
        prefillTitle: publishTitle ?? `${appName} progress`,
        prefillBody: publishBody ?? shareText ?? caption,
      },
    });
  };

  const openTargetProgress = () => router.push('/target-progress' as Href);
  const openEcho = () => router.push('/chat' as Href);

  return (
    <GlassPanel
      variant="medium"
      borderRadius={24}
      elevated
      tintOverride={colors.isDark ? 'rgba(17,17,17,0.84)' : 'rgba(255,255,255,0.92)'}
      style={{ borderColor: `${accent}44`, marginBottom: 14 }}
      contentStyle={{ padding: 16 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: `${accent}22`, alignItems: 'center', justifyContent: 'center' }}>
          <Sparkle color={accent} size={22} weight="fill" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }} numberOfLines={1}>{headline}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 2 }} numberOfLines={2}>{caption}</Text>
        </View>
      </View>

      {metrics.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {metrics.slice(0, 3).map(metric => (
            <View key={metric.label} style={{
              flex: 1,
              minWidth: 88,
              borderRadius: 16,
              padding: 11,
              backgroundColor: colors.surface,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.glassBorder,
            }}>
              <Text style={{ color: accent, fontSize: 17, fontWeight: '900' }} numberOfLines={1}>{metric.value}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '800', marginTop: 2 }} numberOfLines={1}>{metric.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <EdgeAction
          label="Coach"
          icon={<ChatCircleText color="#fff" size={15} weight="bold" />}
          active
          color={accent}
          onPress={() => {
            if (prompt) showToast('Open Echo Chat and paste the coaching prompt', prompt.slice(0, 48));
            openEcho();
          }}
        />
        <EdgeAction label="Share" icon={<ShareNetwork color={colors.textSecondary} size={15} weight="bold" />} onPress={shareProgress} />
        <EdgeAction label="Compare" icon={<UsersThree color={colors.textSecondary} size={15} weight="bold" />} onPress={openTargetProgress} />
        <EdgeAction label="Post" icon={<ArrowUpRight color={colors.textSecondary} size={15} weight="bold" />} onPress={publish} />
      </View>
    </GlassPanel>
  );
}

function EdgeAction({
  label,
  icon,
  onPress,
  active,
  color,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  active?: boolean;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      haptic="light"
      style={{
        minHeight: 38,
        flexGrow: 1,
        flexBasis: '22%',
        borderRadius: 14,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
        backgroundColor: active ? color : colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? color ?? colors.accent : colors.glassBorder,
      }}
    >
      {icon}
      <Text style={{ color: active ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '900' }}>{label}</Text>
    </AnimatedPressable>
  );
}
