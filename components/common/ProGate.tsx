import React from 'react';
import { useRouter } from 'expo-router';
import { Sparkle } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { EmptyState } from './EmptyState';

interface ProGateProps {
  /** Shown as the EmptyState title. */
  title?: string;
  /** Shown as the EmptyState subtitle. */
  subtitle?: string;
  /** Label for the CTA. Defaults to "See Echo Pro". */
  ctaLabel?: string;
}

/**
 * Friendly paywall card for free users who hit a limit (e.g. AI rate
 * limit). Tapping the CTA routes to `/upgrade`. Designed to be rendered
 * inline inside whatever screen surfaced the limit — same visual language
 * as the existing EmptyState used for empty feeds / no-search-results.
 */
export function ProGate({
  title = 'You\'ve hit the free limit',
  subtitle = 'Echo Pro raises your AI request ceiling and unlocks unlimited saved chats.',
  ctaLabel = 'See Echo Pro',
}: ProGateProps) {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <EmptyState
      icon={<Sparkle color={colors.accent} size={26} weight="fill" />}
      title={title}
      subtitle={subtitle}
      actionLabel={ctaLabel}
      onAction={() => router.push('/upgrade' as never)}
    />
  );
}
