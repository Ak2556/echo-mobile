import React from 'react';
import { Share, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ArrowUpRight, ChatCircleText, NotePencil, ShareNetwork, Sparkle, UsersThree, type Icon } from 'phosphor-react-native';
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
  const { colors } = useTheme();
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

      <View style={{
        marginTop: 14,
        gap: 8,
      }}>
        <EdgeAction
          label="Coach"
          IconComponent={ChatCircleText}
          active
          primary
          color={accent}
          onPress={() => {
            if (prompt) showToast('Open Echo Chat and paste the coaching prompt', prompt.slice(0, 48));
            openEcho();
          }}
        />
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <EdgeAction label="Note" IconComponent={NotePencil} color="#A78BFA" onPress={saveSnapshot} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <EdgeAction label="Share" IconComponent={ShareNetwork} color="#22C55E" onPress={shareProgress} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <EdgeAction label="Compare" IconComponent={UsersThree} color="#F59E0B" onPress={openTargetProgress} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <EdgeAction label="Post" IconComponent={ArrowUpRight} color="#38BDF8" onPress={publish} />
            </View>
          </View>
        </View>
      </View>

      {connectedApps.length > 0 ? (
        <View style={{ marginTop: 14 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8 }}>
            Continue in
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {connectedApps.map(app => (
              <AnimatedPressable
                key={app.id}
                onPress={() => router.push(miniAppDeepLink(app))}
                haptic="light"
                style={{
                  minHeight: 40,
                  maxWidth: 170,
                  borderRadius: 999,
                  paddingLeft: 6,
                  paddingRight: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: colors.surface,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.glassBorder,
                }}
              >
                <MiniAppIcon id={app.id} color={app.color} size={30} />
                <View style={{ minWidth: 0 }}>
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: '900' }} numberOfLines={1}>
                    {app.name}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '700' }} numberOfLines={1}>
                    {app.description}
                  </Text>
                </View>
              </AnimatedPressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </GlassPanel>
  );
}

function EdgeAction({
  label,
  IconComponent,
  onPress,
  active,
  primary,
  color,
}: {
  label: string;
  IconComponent: Icon;
  onPress: () => void;
  active?: boolean;
  primary?: boolean;
  color?: string;
}) {
  const { colors } = useTheme();
  const tint = color ?? colors.accent;
  const buttonBg = colors.isDark ? 'rgba(255,255,255,0.105)' : 'rgba(255,255,255,0.95)';
  return (
    <AnimatedPressable
      onPress={onPress}
      haptic="light"
      style={{
        minHeight: primary ? 52 : 50,
        width: '100%',
        borderRadius: 15,
        paddingHorizontal: 14,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        overflow: 'hidden',
        backgroundColor: active ? tint : buttonBg,
        borderWidth: 1,
        borderColor: active ? tint : colors.isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)',
        shadowColor: active ? tint : '#000',
        shadowOpacity: active ? 0.2 : colors.isDark ? 0.14 : 0.06,
        shadowRadius: active ? 12 : 7,
        shadowOffset: { width: 0, height: 3 },
      }}
    >
      <View style={{
        width: 26,
        height: 26,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? 'rgba(255,255,255,0.18)' : `${tint}18`,
      }}>
        <IconComponent color={active ? '#fff' : tint} size={15} weight="bold" />
      </View>
      <Text style={{ color: active ? '#fff' : colors.text, fontSize: 14, fontWeight: '900', textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
        {label}
      </Text>
      {primary ? (
        <View style={{ marginLeft: 'auto', width: 26, height: 26, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowUpRight color="#fff" size={14} weight="bold" />
        </View>
      ) : null}
    </AnimatedPressable>
  );
}
