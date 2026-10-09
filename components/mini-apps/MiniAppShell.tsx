import React from 'react';
import { View, Text, ScrollView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { BackButton } from '../ui/BackButton';
import { useTheme, GLASS_INTENSITY } from '../../lib/ui/theme';
import { useResponsiveLayout } from '../../lib/ui/responsive';
import { miniAppByRoute } from '../../lib/mini-apps/miniAppCatalog';
import { useMiniAppEmbedded } from '../../lib/mini-apps/miniAppEmbed';
import { MiniAppIcon } from './MiniAppIcon';

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
  const { colors, glass, reduceAnimations, font } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const layout = useResponsiveLayout();
  const embedded = useMiniAppEmbedded();
  const appMeta = miniAppByRoute(pathname);
  const accent = appMeta?.color ?? colors.accent;

  const useBlur = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';
  // Embedded in the floating panel: the panel owns the header + top inset.
  const HEADER_H = embedded ? 0 : insets.top + 70;
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
          <BlurView intensity={glass?.heavy ?? GLASS_INTENSITY.heavy} tint={tint} style={StyleSheet.absoluteFill} />
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
          <BackButton fallback="/(tabs)/apps" />

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              {appMeta ? <MiniAppIcon id={appMeta.id} color={appMeta.color} size={42} /> : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    color: colors.text,
                    ...font.displayBlack,
                    fontSize: 28,
                    letterSpacing: -0.5,
                    lineHeight: 33,
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
            backgroundColor: 'transparent',
          }}
        />
      </View>
      )}
    </View>
  );
}

