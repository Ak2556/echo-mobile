import React from 'react';
import { Share, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ArrowUpRight, ChatCircleText, NotePencil, ShareNetwork, UsersThree, type Icon } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { GlassPanel } from '../ui/GlassPanel';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { showToast } from '../ui/Toast';
import { createNote } from '../../lib/notes';
import { miniAppDeepLink, miniAppSnapshotText, relatedMiniApps } from '../../lib/miniAppIntegration';
import { MiniAppIcon } from './MiniAppIcon';

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
  const connectedApps = relatedMiniApps(appId ?? appName, 4);
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
      borderRadius={24}
      elevated
      tintOverride={colors.isDark ? 'rgba(17,17,17,0.84)' : 'rgba(255,255,255,0.92)'}
      style={{ borderColor: `${accent}33`, marginBottom: 14 }}
      contentStyle={{ padding: 18 }}
    >
      {/* Editorial header — warm accent rule + Fraunces headline, matching EmptyState. */}
      <View style={{ width: 24, height: 2, backgroundColor: accent, borderRadius: 1, marginBottom: 12 }} />
      <Text style={[font.display, { color: colors.text, fontSize: 20, lineHeight: 25 }]}>{headline}</Text>
      <Text style={[font.body, { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6 }]}>{caption}</Text>

      {metrics.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          {metrics.slice(0, 3).map(metric => (
            <View key={metric.label} style={{
              flex: 1,
              borderRadius: 14,
              paddingVertical: 12,
              paddingHorizontal: 12,
              backgroundColor: colors.surface,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.glassBorder,
            }}>
              <Text style={[font.display, { color: accent, fontSize: 22 }]} numberOfLines={1}>{metric.value}</Text>
              <Text style={[font.eyebrow, { color: colors.textMuted, fontSize: 10.5, marginTop: 3 }]} numberOfLines={1}>{metric.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Primary — Ask Echo. Layout lives on the inner View so it can't drop. */}
      <AnimatedPressable
        onPress={() => {
          if (prompt) showToast('Open Echo Chat and paste the coaching prompt', prompt.slice(0, 48));
          openEcho();
        }}
        haptic="medium"
        accessibilityRole="button"
        accessibilityLabel="Ask Echo to coach you"
        style={{ marginTop: 16 }}
      >
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 15,
          backgroundColor: accent,
        }}>
          <ChatCircleText color="#fff" size={18} weight="fill" />
          <Text style={[font.bodyBold, { color: '#fff', fontSize: 15, flex: 1 }]}>Ask Echo</Text>
          <ArrowUpRight color="#fff" size={16} weight="bold" />
        </View>
      </AnimatedPressable>

      {/* Secondary — one quiet treatment, four equal cells. Flex lives on a
          plain wrapper View (a flex prop on AnimatedPressable would drop, and
          the cells would collapse to content width). */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        {secondary.map(action => (
          <View key={action.label} style={{ flex: 1 }}>
            <AnimatedPressable
              onPress={action.onPress}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel={action.a11y}
            >
              <View style={{
                alignItems: 'center',
                gap: 6,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: colors.surface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.glassBorder,
              }}>
                <action.Icon color={accent} size={17} weight="bold" />
                <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 11 }]} numberOfLines={1}>{action.label}</Text>
              </View>
            </AnimatedPressable>
          </View>
        ))}
      </View>

      {connectedApps.length > 0 ? (
        <View style={{ marginTop: 18 }}>
          <Text style={[font.eyebrow, { color: colors.textMuted, marginBottom: 10 }]}>Continue in</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {connectedApps.map(app => (
              <AnimatedPressable
                key={app.id}
                onPress={() => router.push(miniAppDeepLink(app))}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={`Open ${app.name}`}
              >
                <View style={{
                  minHeight: 40,
                  maxWidth: 190,
                  borderRadius: 999,
                  paddingLeft: 6,
                  paddingRight: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: colors.surface,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.glassBorder,
                }}>
                  <MiniAppIcon id={app.id} color={app.color} size={30} />
                  <View style={{ minWidth: 0 }}>
                    <Text style={[font.bodySemibold, { color: colors.text, fontSize: 12 }]} numberOfLines={1}>
                      {app.name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10.5 }} numberOfLines={1}>
                      {app.description}
                    </Text>
                  </View>
                </View>
              </AnimatedPressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </GlassPanel>
  );
}
