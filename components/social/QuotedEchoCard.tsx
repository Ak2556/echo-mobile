import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SealCheck } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { FeedItem } from '../../types';

interface QuotedEchoCardProps {
  echo: NonNullable<FeedItem['quotedEcho']>;
  compact?: boolean;
}

export function QuotedEchoCard({ echo, compact }: QuotedEchoCardProps) {
  const router = useRouter();
  const { colors, fontSizes } = useTheme();

  return (
    <Pressable
      onPress={(e) => { e.stopPropagation?.(); router.push(`/thread/${echo.id}`); }}
      style={{
        marginBottom: 10,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
        backgroundColor: colors.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        padding: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {echo.avatarUrl ? (
          <Image source={{ uri: echo.avatarUrl }} style={{ width: 22, height: 22, borderRadius: 11 }} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: echo.avatarColor || colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
              {(echo.displayName || echo.username).charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={{ color: colors.text, fontSize: fontSizes.caption, fontWeight: '700' }}>{echo.displayName || echo.username}</Text>
        {echo.isVerified && <SealCheck color={colors.accent} size={12} weight="fill" />}
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{echo.username}</Text>
      </View>
      <Text numberOfLines={compact ? 2 : 4} style={{ color: colors.textSecondary, fontSize: fontSizes.caption, lineHeight: fontSizes.caption * 1.5 }}>
        {echo.prompt}
      </Text>
      {!compact && echo.response && (
        <Text numberOfLines={2} style={{ color: colors.textMuted, fontSize: fontSizes.caption, lineHeight: fontSizes.caption * 1.5, marginTop: 4 }}>
          → {echo.response}
        </Text>
      )}
    </Pressable>
  );
}
