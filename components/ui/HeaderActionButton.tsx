import React from 'react';
import type { Icon } from 'phosphor-react-native';
import { IconButton } from './IconButton';
import { useTheme } from '../../lib/ui/theme';

interface HeaderActionButtonProps {
  icon: Icon;
  /** What it does. Read aloud by screen readers. */
  label: string;
  onPress: () => void;
  /** `default`: grey chip. `accent`: the glyph takes the accent colour and fills.
   *  `media`: white glyph on a dark disc, for headers laid over a photo. */
  tone?: 'default' | 'accent' | 'media';
  disabled?: boolean;
}

/**
 * Every secondary header button: settings, share, export, copy. It is a 40 pt
 * circle, the same size as the header "+", so the right edge of a header reads as
 * one row of equal controls instead of 34, 36, 38 and 42 pt squares. Over a photo
 * (`media`) it is 44 pt to match the back button drawn there.
 */
export function HeaderActionButton({ icon, label, onPress, tone = 'default', disabled }: HeaderActionButtonProps) {
  const { colors } = useTheme();
  if (tone === 'media') {
    return (
      <IconButton
        icon={icon}
        label={label}
        onPress={onPress}
        disabled={disabled}
        size="lg"
        hitSize={44}
        color="#fff"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      />
    );
  }
  return (
    <IconButton
      icon={icon}
      label={label}
      onPress={onPress}
      disabled={disabled}
      variant="surface"
      role={tone === 'accent' ? 'active' : 'resting'}
      color={tone === 'accent' ? colors.accent : undefined}
      size="md"
      hitSize={40}
    />
  );
}
