import React from 'react';
import {
  View, Text, ScrollView, Pressable, Platform, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { useResponsiveLayout } from '../../lib/responsive';

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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const layout = useResponsiveLayout();

  const useBlur = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';
  const HEADER_H = insets.top + 62;
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
        colors={colors.ambientGradient}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 0.6 }}
        style={StyleSheet.absoluteFill}
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
          <View style={contentStyle}>{children}</View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: HEADER_H }}>
          <View style={[contentStyle, { flex: 1 }]}>{children}</View>
        </View>
      )}

      {/* Glass header */}
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
            accessibilityLabel="Back to previous screen"
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
                Tools
              </Text>
            )}
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.text,
                fontFamily: 'Fraunces_600SemiBold',
                fontSize: 20,
                letterSpacing: -0.4,
                lineHeight: 25,
              }}
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
              >
                {subtitle}
              </Text>
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
    </View>
  );
}
