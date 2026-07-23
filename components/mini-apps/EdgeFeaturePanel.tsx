import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ArrowUpRight, ChatCircleText, NotePencil, ShareNetwork, UsersThree, type Icon } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { GlassPanel } from '../ui/GlassPanel';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { showToast } from '../ui/Toast';
import { createNote } from '../../lib/notes';
import { miniAppSnapshotText } from '../../lib/miniAppIntegration';

interface EdgeFeaturePanelProps {
  appId?: string;
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
  appId,
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
  const { colors, font } = useTheme();
  const router = useRouter();
  const snapshot = miniAppSnapshotText({ appName, headline, caption, metrics, shareText });

  const shareProgress = () => {
    Share.share({ message: snapshot }).catch(() => showToast('Could not open share sheet', 'Error'));
  };

  const publish = () => {
    router.push({
      pathname: '/create-post',
      params: {
        prefillTitle: publishTitle ?? `${appName} progress`,
        prefillBody: publishBody ?? snapshot,
      },
    });
  };

  const saveSnapshot = () => {
    void createNote({
      title: `${appName} snapshot`,
      body: snapshot,
      color: accent,
    })
      .then(() => showToast('Saved to Notes', 'Saved'))
      .catch(() => showToast('Could not save note', 'Error'));
  };

  const openTargetProgress = () => router.push('/target-progress' as Href);
  const openEcho = () => router.push('/chat' as Href);

  const secondary: { label: string; a11y: string; Icon: Icon; onPress: () => void }[] = [
    { label: 'Note', a11y: 'Save a snapshot to Notes', Icon: NotePencil, onPress: saveSnapshot },
    { label: 'Share', a11y: 'Share progress', Icon: ShareNetwork, onPress: shareProgress },
    { label: 'Compare', a11y: 'Compare consistency', Icon: UsersThree, onPress: openTargetProgress },
    { label: 'Post', a11y: 'Post progress as an Echo', Icon: ArrowUpRight, onPress: publish },
  ];

  return (
    <GlassPanel
      variant="medium"
      borderRadius={18}
      style={{ borderColor: `${accent}30`, marginBottom: 14 }}
      contentStyle={{ padding: 10, gap: 8 }}
    >
      {/* Primary — Ask Echo. Layout lives on the inner View so it can't drop. */}
      <AnimatedPressable
        onPress={() => {
          if (prompt) showToast('Open Echo Chat and paste the coaching prompt', prompt.slice(0, 48));
          openEcho();
        }}
        haptic="medium"
        accessibilityRole="button"
        accessibilityLabel="Ask Echo to coach you"
      >
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 13,
          backgroundColor: accent,
        }}>
          <ChatCircleText color="#fff" size={17} weight="fill" />
          <Text style={[font.bodyBold, { color: '#fff', fontSize: 14.5, flex: 1 }]} numberOfLines={1}>Ask Echo about {appName}</Text>
          <ArrowUpRight color="#fff" size={15} weight="bold" />
        </View>
      </AnimatedPressable>

      {/* Secondary — one quiet row of compact actions. Flex lives on a plain
          wrapper View (a flex prop on AnimatedPressable would drop). */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {secondary.map(action => (
          <View key={action.label} style={{ flex: 1 }}>
            <AnimatedPressable
              onPress={action.onPress}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel={action.a11y}
            >
              <View style={{
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: colors.surface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.glassBorder,
              }}>
                <action.Icon color={accent} size={15} weight="bold" />
                <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 11 }]} numberOfLines={1}>{action.label}</Text>
              </View>
            </AnimatedPressable>
          </View>
        ))}
      </View>
    </GlassPanel>
  );
}
