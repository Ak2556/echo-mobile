import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Warning, ArrowClockwise, CaretDown, CaretUp } from 'phosphor-react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { useTheme } from '../../src/shared/lib/theme';
import { captureException } from '../../lib/monitoring';
import { ttx } from '../../src/shared/lib/i18n';

/**
 * Production error boundary used by Expo Router as the root fallback.
 *
 * Shows a friendly themed screen with a single Retry CTA. The raw error
 * message is hidden behind a "Show details" toggle so we never dump a
 * stack trace at the user in normal use. When we add Sentry, we'll
 * report from here too.
 */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors, radius } = useTheme();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    captureException(error, { tags: { source: 'router_error_boundary' } });
  }, [error]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accent + '14',
            borderWidth: 1,
            borderColor: colors.accent + '30',
            marginBottom: 22,
          }}
        >
          <Warning color={colors.accent} size={32} weight="duotone" />
        </View>

        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 }}>
          {ttx("Something went wrong")}
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 15,
            textAlign: 'center',
            lineHeight: 22,
            marginTop: 8,
            maxWidth: 320,
          }}
        >
          {ttx("Echo hit an unexpected hiccup. Tap retry to reload this screen. Your data is safe.")}
        </Text>

        {/* Wrapper View owns the accent fill; the Pressable stays bare.
            cssInterop drops box/bg props off a touchable's own style, which
            leaves the white label invisible on a light background. */}
        <View style={{ marginTop: 28, borderRadius: radius.full, backgroundColor: colors.accent }}>
          <Pressable
            onPress={retry}
            style={({ pressed }) => ({
              paddingHorizontal: 22,
              paddingVertical: 12,
              borderRadius: radius.full,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <ArrowClockwise color="#fff" size={16} weight="bold" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{ttx("Try again")}</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => setShowDetails(v => !v)}
          style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{ttx("Show details")}</Text>
          {showDetails ? <CaretUp color={colors.textMuted} size={12} /> : <CaretDown color={colors.textMuted} size={12} />}
        </Pressable>

        {showDetails && (
          <ScrollView
            style={{
              marginTop: 12,
              maxHeight: 200,
              maxWidth: 360,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              padding: 12,
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'Menlo' }}>
              {error.message}
              {'\n\n'}
              {error.stack?.split('\n').slice(0, 8).join('\n')}
            </Text>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
