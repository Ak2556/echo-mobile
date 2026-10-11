import React from 'react';
import { Text, View } from 'react-native';
import type { Icon } from 'phosphor-react-native';
import { IconButton } from './IconButton';
import { useTheme } from '../../lib/ui/theme';
import { ON_MEDIA, ON_STATUS } from '../../lib/ui/fixedColors';

interface HeaderActionButtonProps {
  icon: Icon;
  /** What it does. Read aloud by screen readers. */
  label: string;
  onPress: () => void;
  /** `default`: grey chip. `accent`: the glyph takes the accent colour and fills.
   *  `media`: white glyph on a dark disc, for headers laid over a photo. */
  tone?: 'default' | 'accent' | 'media';
  disabled?: boolean;
  /** An unread count drawn on the corner; nothing is drawn for 0. */
  badge?: number;
}

/**
 * Every secondary header button: settings, share, export, copy, messages,
 * notifications. It is a 40 pt circle, the same size as the header "+", so the right
 * edge of a header reads as one row of equal controls instead of bare glyphs beside a
 * filled circle. Over a photo (`media`) it is 44 pt to match the back button there.
 */
export function HeaderActionButton({ icon, label, onPress, tone = 'default', disabled, badge = 0 }: HeaderActionButtonProps) {
  const { colors } = useTheme();

  const button = tone === 'media' ? (
    <IconButton
      icon={icon}
      label={label}
      onPress={onPress}
      disabled={disabled}
      size="lg"
      hitSize={44}
      color={ON_MEDIA}
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    />
  ) : (
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

  if (badge <= 0) return button;

  return (
    <View>
      {button}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -2,
          right: -2,
          minWidth: 18,
          height: 18,
          paddingHorizontal: 4,
          borderRadius: 9,
          backgroundColor: colors.danger,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: colors.bg,
        }}
      >
        <Text style={{ color: ON_STATUS, fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
          {badge > 99 ? '99+' : badge}
        </Text>
      </View>
    </View>
  );
}
