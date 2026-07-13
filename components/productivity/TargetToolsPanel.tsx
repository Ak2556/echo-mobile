import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ArrowRight, ChartLineUp, SquaresFour, Target } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { useResponsiveLayout } from '../../lib/responsive';
import { useAppStore } from '../../store/useAppStore';
import { getTargetCategory } from '../../lib/targetCategories';
import { miniAppById } from '../../lib/miniAppCatalog';

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
        <Target color={colors.accent} size={18} weight="bold" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 7, alignItems: 'center' }}>
          {apps.map(app => app ? (
            <Pressable
              key={app.id}
              onPress={() => router.push(app.route)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${app.name}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <View style={{ borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surfaceHover, paddingHorizontal: 12, paddingVertical: 7 }}>
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
          style={{ width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHover }}
        >
          <ChartLineUp color={colors.accent} size={16} weight="bold" />
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
        <View style={{
          width: 38,
          height: 38,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${colors.accent}20`,
        }}>
          <Target color={colors.accent} size={21} weight="bold" />
        </View>
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
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceHover,
          }}
        >
          <ChartLineUp color={colors.accent} size={18} weight="bold" />
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
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 12 }]} numberOfLines={1}>
              {app.name}
            </Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 11, marginTop: 2 }]} numberOfLines={1}>
              {app.description}
            </Text>
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
