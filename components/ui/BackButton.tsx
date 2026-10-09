import React from 'react';
import type { Href } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';
import { IconButton } from './IconButton';
import { safeBack } from '../../lib/routing/safeBack';
import { useI18n } from '../../lib/i18n/i18n';

interface BackButtonProps {
  /** Replace the default. Almost nothing should: the default cannot dead-end. */
  onPress?: () => void;
  /** Where to land when there is nothing to go back to (a notification or link opened this screen). */
  fallback?: Href;
  /** `media` sits over a photo or video: white on a dark disc so it reads on any picture. */
  tone?: 'default' | 'media';
  /** Only when the action is not "go back" (for example "Close full screen"), so the screen reader says so. */
  label?: string;
  /** For a wizard whose first step has nothing behind it. */
  disabled?: boolean;
}

/**
 * The one back control. Same arrow, same 44 pt target (Apple's minimum), same place at the left
 * of the header, same behaviour on every screen, so the thumb learns it once.
 *
 * Fourteen screens drew their own arrow at 22, 24 or 28 px in a 32 to 36 pt target, some
 * calling `router.back()` (which does nothing when a link opened the screen) and some `safeBack`.
 * test/oneBackButton.test.ts keeps new screens from drawing another.
 */
export function BackButton({ onPress, fallback, tone = 'default', label, disabled }: BackButtonProps) {
  const { t } = useI18n();
  return (
    <IconButton
      icon={ArrowLeft}
      label={label ?? t('common.back')}
      onPress={onPress ?? (() => safeBack(fallback))}
      disabled={disabled}
      size="lg"
      hitSize={44}
      color={tone === 'media' ? '#fff' : undefined}
      style={tone === 'media' ? { backgroundColor: 'rgba(0,0,0,0.5)' } : undefined}
    />
  );
}
