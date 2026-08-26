import React, { useState } from 'react';
import { Text, KeyboardAvoidingView, Platform } from 'react-native';
import { ResponsiveScreen } from '../../components/ui/ResponsiveScreen';
import { useLocalSearchParams } from 'expo-router';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { CommentsPanel } from '../../src/features/feed/ui/CommentsPanel';
import { useTheme } from '../../src/shared/lib/theme';
import { ttx } from '../../src/shared/lib/i18n';

/**
 * Full-screen comments — reached from a notification, a deep link, or the
 * feed. Flow opens the same list in a sheet over the video instead; both
 * render CommentsPanel, so the threading, mentions and composer stay in one
 * place.
 */
export default function CommentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [count, setCount] = useState<number | null>(null);

  return (
    <ResponsiveScreen edges={['top', 'bottom']}>
      <ScreenHeader
        title={ttx("Comments")}
        right={
          count === null ? undefined : (
            <Text style={{ color: colors.textMuted, fontSize: 14, marginRight: 10 }}>{count}</Text>
          )
        }
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <CommentsPanel echoId={id} onCountChange={setCount} />
      </KeyboardAvoidingView>
    </ResponsiveScreen>
  );
}
