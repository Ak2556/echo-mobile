import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ArrowRight, ChartLineUp, SquaresFour, Target } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { useResponsiveLayout } from '../../lib/responsive';
import { useAppStore } from '../../store/useAppStore';
import { getTargetCategory } from '../../lib/targetCategories';
import { miniAppById } from '../../lib/miniAppCatalog';
import { MiniAppIcon } from '../mini-apps/MiniAppIcon';
import { IconBadge } from '../ui/IconBadge';

export function TargetToolsPanel({ compact = false, dense = false }: { compact?: boolean; dense?: boolean }) {
  const router = useRouter();
  const { colors, radius, font } = useTheme();
  const layout = useResponsiveLayout();
  const targetCategory = useAppStore(s => s.targetCategory);
  const targetOutcome = useAppStore(s => s.targetOutcome);
  const targetMiniApps = useAppStore(s => s.targetMiniApps);
  const category = getTargetCategory(targetCategory);
  const apps = useMemo(() => {
    const ids = targetMiniApps.length ? targetMiniApps : category.apps;
    return ids.map(id => miniAppById(id)).filter(Boolean).slice(0, dense ? 4 : compact ? 3 : 5);
  }, [category.apps, compact, dense, targetMiniApps]);

  // Dense: a single slim row of the target's tools + a progress button. The
  // target label/outcome already live in the Home hero, so this variant keeps
  // only what the hero doesn't — direct access to the specific mini-apps.
  if (dense) {
    return (
      <View style={{
        marginHorizontal: layout.gutter,
        marginTop: 4,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: radius.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingLeft: 12,
        paddingRight: 8,
        paddingVertical: 8,
      }}>
        <IconBadge color={colors.accent} size={30} radius={11} muted>
          <Target color={colors.accent} size={16} weight="bold" />
        </IconBadge>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 7, alignItems: 'center' }}>
          {apps.map(app => app ? (
            <Pressable
              key={app.id}
              onPress={() => router.push(app.route)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${app.name}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <View style={{ borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surfaceHover, paddingLeft: 6, paddingRight: 12, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <MiniAppIcon id={app.id} color={app.color} size={26} />
                <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 12.5 }]} numberOfLines={1}>
                  {app.name}
                </Text>
              </View>
            </Pressable>
          ) : null)}
        </ScrollView>
        <Pressable
          onPress={() => router.push('/target-progress' as Href)}
          accessibilityRole="button"
          accessibilityLabel="Open progress"
          hitSlop={6}
        >
          <IconBadge color={colors.accent} size={32} radius={11} muted>
            <ChartLineUp color={colors.accent} size={16} weight="bold" />
          </IconBadge>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{
      marginHorizontal: layout.gutter,
      marginTop: compact ? 10 : 14,
      marginBottom: compact ? 10 : 16,
      borderRadius: radius.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: compact ? 12 : 14,
      gap: 12,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconBadge color={colors.accent} size={40} radius={14}>
          <Target color="#fff" size={21} weight="bold" />
        </IconBadge>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]} numberOfLines={1}>
            {category.label}
          </Text>
          <Text style={[font.body, { color: colors.textMuted, fontSize: 12, lineHeight: 17 }]} numberOfLines={compact ? 1 : 2}>
            {targetOutcome.trim() || category.outcome}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/target-progress' as Href)}
          accessibilityRole="button"
          accessibilityLabel="Open progress"
        >
          <IconBadge color={colors.accent} size={34} radius={12} muted>
            <ChartLineUp color={colors.accent} size={18} weight="bold" />
          </IconBadge>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {apps.map(app => app ? (
          <Pressable
            key={app.id}
            onPress={() => router.push(app.route)}
            accessibilityRole="button"
            style={{
              minWidth: compact ? 112 : 128,
              borderRadius: radius.lg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              backgroundColor: colors.surfaceHover,
              paddingHorizontal: 11,
              paddingVertical: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MiniAppIcon id={app.id} color={app.color} size={30} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[font.bodyBold, { color: colors.text, fontSize: 12 }]} numberOfLines={1}>
                  {app.name}
                </Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 11, marginTop: 2 }]} numberOfLines={1}>
                  {app.description}
                </Text>
              </View>
            </View>
          </Pressable>
        ) : null)}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => router.push('/(tabs)/apps' as Href)}
          style={{
            flex: 1,
            minHeight: 42,
            borderRadius: radius.lg,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
          }}
        >
          <SquaresFour color="#fff" size={16} weight="bold" />
          <Text style={[font.bodyBold, { color: '#fff', fontSize: 13 }]}>Tools</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/target-progress' as Href)}
          style={{
            flex: 1,
            minHeight: 42,
            borderRadius: radius.lg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
          }}
        >
          <Text style={[font.bodyBold, { color: colors.textSecondary, fontSize: 13 }]}>Share or compare</Text>
          <ArrowRight color={colors.textSecondary} size={15} weight="bold" />
        </Pressable>
      </View>
    </View>
  );
}
