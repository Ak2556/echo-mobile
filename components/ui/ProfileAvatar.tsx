import React from 'react';
import { View, Text } from 'react-native';
import { SealCheck } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

interface ProfileAvatarProps {
  displayName: string;
  avatarColor: string;
  size?: number;
  showGlow?: boolean;
  isVerified?: boolean;
}

export function ProfileAvatar({
  displayName,
  avatarColor,
  size = 74,
  showGlow = true,
  isVerified = false,
}: ProfileAvatarProps) {
  const { colors } = useTheme();
  const glowSize = size + 20;
  const ringSize = size + 8;
  const initial = (displayName || '?').charAt(0).toUpperCase();

  return (
    <View style={{ width: glowSize, height: glowSize, alignItems: 'center', justifyContent: 'center' }}>
      {showGlow && (
        <View
          style={{
            position: 'absolute',
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
            backgroundColor: avatarColor + '28',
          }}
        />
      )}
      <View
        style={{
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: 2.5,
          borderColor: avatarColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: avatarColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: size * 0.43, fontWeight: '700' }}>
            {initial}
          </Text>
        </View>
      </View>
      {isVerified && (
        <View style={{ position: 'absolute', bottom: 2, right: 2 }}>
          <SealCheck size={18} weight="fill" color={colors.accent} />
        </View>
      )}
    </View>
  );
}
