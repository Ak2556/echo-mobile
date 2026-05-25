import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../lib/theme';
import { features, FeatureFlag } from '../../lib/featureFlags';

interface V2FeatureGuardProps {
  flag: FeatureFlag;
  children: React.ReactNode;
}

/**
 * Gate a screen behind a feature flag. When the flag is off, the screen
 * never renders its real children — it redirects to the home tab.
 *
 * This catches edge cases where a user lands on a v2 surface via a stale
 * push, a saved link, or app-state drift, even though we've hidden the
 * primary entry points in the UI.
 */
export function V2FeatureGuard({ flag, children }: V2FeatureGuardProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const enabled = features[flag];

  useEffect(() => {
    if (!enabled) router.replace('/(tabs)/discover');
  }, [enabled, router]);

  if (!enabled) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 12 }}>Redirecting…</Text>
      </View>
    );
  }

  return <>{children}</>;
}
