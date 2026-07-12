import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../lib/theme';
import { warmAvatarColor } from '../../lib/avatarPalette';

/**
 * The one list avatar. Renders the profile photo when there is one, falling
 * back to the initial on the user's (warm-mapped) identity color. Use this
 * everywhere a circle-with-a-letter used to be hand-rolled — photos should
 * appear wherever the person does.
 *
 * `ProfileAvatar` stays the hero variant (halo ring, verified seal) for
 * profile headers; this is the compact everywhere-else one.
 */
export function Avatar({
  name,
  color,
  url,
  size = 44,
  online = false,
  children,
}: {
  name: string;
  color?: string | null;
  url?: string | null;
  size?: number;
  /** show the presence dot */
  online?: boolean;
  /** optional glyph instead of the initial (e.g. group icon) */
  children?: React.ReactNode;
}) {
  const { colors, showAvatars } = useTheme();
  const [imgError, setImgError] = useState(false);
  const bg = warmAvatarColor(color, name);
  const showPhoto = showAvatars && !!url && !imgError;

  return (
    <View style={{ width: size, height: size }}>
      {showPhoto ? (
        <Image
          source={{ uri: url! }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          onError={() => setImgError(true)}
        />
      ) : (
        <View style={{
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center', justifyContent: 'center',
        }}>
          {children ?? (
            <Text
              style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.4 }}
              maxFontSizeMultiplier={1}
            >
              {(name || '?').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
      )}
      {online && (
        <View style={{
          position: 'absolute', bottom: 0, right: 0,
          width: Math.max(11, size * 0.28), height: Math.max(11, size * 0.28),
          borderRadius: size,
          backgroundColor: colors.success,
          borderWidth: 2, borderColor: colors.bg,
        }} />
      )}
    </View>
  );
}
