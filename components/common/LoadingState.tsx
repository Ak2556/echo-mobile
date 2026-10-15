import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTheme } from '../../lib/ui/theme';
import { ttx } from '../../lib/i18n/i18n';

interface LoadingStateProps {
  /** Read aloud to a screen reader. */
  label?: string;
  size?: 'small' | 'large';
  /** Fills a whole screen: draws the page background behind the spinner. */
  screen?: boolean;
  /** A line under the spinner, for a wait that is worth explaining. */
  message?: string;
}

/**
 * The one "this screen is loading" state: a single accent spinner, centred in the space it
 * will fill. For a list that has a shape (rows, cards), use that list's skeleton instead.
 */
export function LoadingState({ label, size = 'small', screen = false, message }: LoadingStateProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, screen ? { backgroundColor: colors.bg } : null]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? ttx('Loading')}
    >
      <ActivityIndicator color={colors.accent} size={size} />
      {message ? <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 12 }}>{message}</Text> : null}
    </View>
  );
}
