import React from 'react';
import {
  View, Text, ScrollView, Pressable, Platform, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, CheckCircle, Sparkle } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { useResponsiveLayout } from '../../lib/responsive';
import { miniAppByRoute, type MiniAppCatalogItem } from '../../lib/miniAppCatalog';
import { useMiniAppEmbedded } from '../../lib/miniAppEmbed';
import { MiniAppIcon } from './MiniAppIcon';
import { useI18n } from '../../lib/i18n';

interface MiniAppShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Wrap children in a ScrollView (default true) */
  scrollable?: boolean;
  scrollPadding?: number;
  /** Element placed on the right side of the header */
  headerRight?: React.ReactNode;
  /** Extra padding at the bottom of scrollable content */
  bottomPad?: number;
}

export function MiniAppShell({
  title,
  subtitle,
  children,
  scrollable = true,
  scrollPadding = 20,
  headerRight,
  bottomPad = 32,
}: MiniAppShellProps) {
  const { colors, reduceAnimations } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const layout = useResponsiveLayout();
  const embedded = useMiniAppEmbedded();
  const appMeta = miniAppByRoute(pathname);
  const accent = appMeta?.color ?? colors.accent;

  const useBlur = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';
  // Embedded in the floating panel: the panel owns the header + top inset.
  const HEADER_H = embedded ? 0 : insets.top + (appMeta ? 78 : 62);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/apps');
  };
  const contentStyle = {
    width: '100%' as const,
    maxWidth: layout.isDesktop ? 760 : layout.contentMaxWidth,
    alignSelf: 'center' as const,
    paddingHorizontal: scrollPadding,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Ambient gradient */}
      <LinearGradient
        colors={[`${accent}${colors.isDark ? '20' : '18'}`, colors.bg]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 0.6 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.045)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 180 }}
        pointerEvents="none"
      />

      {/* Content */}
      {scrollable ? (
        <ScrollView
          contentContainerStyle={{
            paddingTop: HEADER_H + 8,
            paddingHorizontal: 0,
            paddingBottom: Math.max(bottomPad, layout.bottomChromePadding),
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={contentStyle}>
            {appMeta && !embedded ? <MiniWorkspaceBrief app={appMeta} /> : null}
            {children}
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: HEADER_H }}>
          <View style={[contentStyle, { flex: 1 }]}>{children}</View>
        </View>
      )}

      {/* Glass header — the floating panel supplies its own, so skip it there. */}
      {!embedded && (
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: HEADER_H,
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        {useBlur && (
          <BlurView intensity={80} tint={tint} style={StyleSheet.absoluteFill} />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.bg, opacity: useBlur ? 0.25 : 0.97 },
          ]}
        />

        <View
          style={{
            paddingTop: insets.top + 4,
            height: HEADER_H,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingBottom: 8,
            width: '100%',
            maxWidth: layout.isDesktop ? 760 : layout.contentMaxWidth,
            alignSelf: 'center',
          }}
        >
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={{
              minWidth: 36,
              height: 36,
              borderRadius: 18,
              paddingHorizontal: 10,
              backgroundColor: colors.isDark
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(0,0,0,0.06)',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
              marginRight: 12,
            }}
          >
            <ArrowLeft color={colors.text} size={18} weight="bold" />
            {!layout.isPhone && (
              <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
                {t('mini.tools')}
              </Text>
            )}
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              {appMeta ? <MiniAppIcon id={appMeta.id} color={appMeta.color} size={34} /> : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontFamily: 'Fraunces_600SemiBold',
                    fontSize: 20,
                    letterSpacing: -0.4,
                    lineHeight: 25,
                  }}
                  numberOfLines={1}
                >
                  {title}
                </Text>
                {subtitle ? (
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 12,
                      marginTop: 1,
                    }}
                    numberOfLines={1}
                  >
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
            {appMeta ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 }}>
                <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: `${appMeta.color}1F`, borderWidth: StyleSheet.hairlineWidth, borderColor: `${appMeta.color}55` }}>
                  <Text style={{ color: appMeta.color, fontSize: 10.5, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, textTransform: 'uppercase' }}>{appMeta.suite}</Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11.5, flex: 1 }} numberOfLines={1}>
                  {t('mini.replaces', { items: appMeta.replaces.slice(0, 2).join(' + ') })}
                </Text>
              </View>
            ) : null}
          </View>

          {headerRight ? (
            <View style={{ marginLeft: 8 }}>{headerRight}</View>
          ) : null}
        </View>

        {/* Bottom border */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.glassBorder,
          }}
        />
      </View>
      )}
    </View>
  );
}

function MiniWorkspaceBrief({ app }: { app: MiniAppCatalogItem }) {
  const { colors, font } = useTheme();
  const { t } = useI18n();
  const chips = [app.suite, t('mini.echoActions'), t('mini.liveContext')];

  return (
    <View
      style={{
        marginBottom: 14,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: `${app.color}3A`,
      }}
    >
      <LinearGradient
        colors={[`${app.color}22`, colors.isDark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.52)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ padding: 12, gap: 11 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${app.color}22` }}>
            <Sparkle color={app.color} size={17} weight="fill" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 14.5, lineHeight: 18 }]} numberOfLines={1}>
              {t('mini.echoWorkspace')}
            </Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 11.6, lineHeight: 15, marginTop: 1 }]} numberOfLines={1}>
              {app.highlights.slice(0, 2).join(' · ')}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 7 }}>
          {chips.map(chip => (
            <View key={chip} style={{ flex: 1, minHeight: 34, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: colors.surfaceHover, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <CheckCircle color={app.color} size={13} weight="fill" />
                <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 10.8, flex: 1 }]} numberOfLines={1}>
                  {chip}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
