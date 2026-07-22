import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ArrowLeft, X } from 'phosphor-react-native';
import { IconButton } from './IconButton';
import { useTheme } from '../../lib/theme';
import { safeBack } from '../../lib/safeBack';

interface ScreenHeaderProps {
  title?: string;
  /** Left affordance: back arrow (detail screens), close X (modals), or none. */
  leading?: 'back' | 'close' | 'none';
  /** Override the default back/close action (safeBack). */
  onLeading?: () => void;
  /** Optional right-side content (a single action — keep it to one). */
  right?: React.ReactNode;
  /** Hairline bottom border. Default true. */
  border?: boolean;
}

/**
 * The one screen header for detail/modal screens — a consistent back/close
 * button (via the shared IconButton), a left-aligned title, and one optional
 * right action. Replaces the ~8 hand-rolled header rows scattered across the
 * app so back/title styling is identical everywhere.
 *
 * Renders just the row: the parent still owns its SafeAreaView(edges top).
 */
export function ScreenHeader({ title, leading = 'back', onLeading, right, border = true }: ScreenHeaderProps) {
  const { colors } = useTheme();
  const handleLeading = onLeading ?? (() => safeBack());

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 8,
        minHeight: 52,
        borderBottomWidth: border ? StyleSheet.hairlineWidth : 0,
        borderBottomColor: colors.border,
      }}
    >
      {leading !== 'none' ? (
        <IconButton
          icon={leading === 'close' ? X : ArrowLeft}
          label={leading === 'close' ? 'Close' : 'Back'}
          onPress={handleLeading}
          size="lg"
        />
      ) : (
        <View style={{ width: 8 }} />
      )}

      {title ? (
        <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '700', marginLeft: 2 }}>
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      {right ?? null}
    </View>
  );
}
