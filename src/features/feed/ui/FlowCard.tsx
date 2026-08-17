import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { HeartStraight, ChatCircle, ShareNetwork, BookmarkSimple, Play } from 'phosphor-react-native';
import { FeedItem } from '../../../../types/index';
import { VideoPreview } from './VideoPreview';
import { useResponsiveLayout } from '../../../shared/lib/responsive';
import { useTheme } from '../../../shared/lib/theme';
import { warmAvatarColor } from '../../../../lib/avatarPalette';
import { useToggleRemoteLike } from '../api/useSupabaseSocial';
import { useAppStore } from '../../../../store/useAppStore';

const SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.8,
  shadowRadius: 2,
  elevation: 3,
};

const TEXT_SHADOW = {
  textShadowColor: 'rgba(0, 0, 0, 0.75)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
};

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function ActionButton({ icon: Icon, color = '#fff', weight = 'regular', label, onPress, size = 34 }: any) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center' }}>
      <View style={SHADOW}>
        <Icon size={size} color={color} weight={weight} />
      </View>
      {!!label && (
        <Text style={{ 
          color: '#fff', 
          fontSize: 13, 
          marginTop: 6,
          fontWeight: '600',
          ...TEXT_SHADOW
        }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function FlowCard({ item, index }: { item: FeedItem; index: number }) {
  const { colors, font } = useTheme();
  const layout = useResponsiveLayout();
  const router = useRouter();
  
  const height = layout.height;
  const { mutate: toggleLike } = useToggleRemoteLike();
  const soundEnabled = useAppStore(s => s.soundEnabled);
  const setSoundEnabled = useAppStore(s => s.setSoundEnabled);

  const avatarColor = warmAvatarColor(item.displayName || 'E');
  
  if (item.postType !== 'video' || !item.videoUri) {
    return (
      <View style={{ height, width: '100%', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Unsupported media type</Text>
      </View>
    );
  }

  return (
    <View style={{ height, width: '100%', backgroundColor: colors.bg }}>
      <Pressable onPress={() => setSoundEnabled(!soundEnabled)} style={StyleSheet.absoluteFill}>
        <VideoPreview
          uri={item.videoUri}
          height={height}
          borderRadius={0}
          echoId={item.id}
          viewCount={item.viewCount}
        />
      </Pressable>

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          paddingTop: 60,
          paddingBottom: layout.bottomChromePadding + 20,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          pointerEvents: 'box-none'
        }}
      >
        <View style={{ flex: 1, paddingRight: 20 }}>
          <Pressable onPress={() => router.push(`/user/${item.userId}`)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ 
              width: 44, height: 44, borderRadius: 22, 
              backgroundColor: avatarColor, overflow: 'hidden', 
              marginRight: 12,
              borderWidth: 1.5, borderColor: '#fff',
              ...SHADOW
            }}>
              {item.avatarUrl ? (
                <Image source={item.avatarUrl} style={{ width: '100%', height: '100%' }} />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
                    {item.displayName?.[0]?.toUpperCase() || 'E'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[font.bodySemibold, { color: '#fff', fontSize: 16, ...TEXT_SHADOW }]}>{item.displayName}</Text>
          </Pressable>
          
          {!!item.editorialTitle && (
            <Text style={[font.bodySemibold, { color: '#fff', fontSize: 15, marginBottom: 8, ...TEXT_SHADOW }]} numberOfLines={2}>
              {item.editorialTitle}
            </Text>
          )}
          
          <Text style={[font.bodyMedium, { color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 20, ...TEXT_SHADOW }]} numberOfLines={3}>
            {item.prompt}
          </Text>
        </View>

        <View style={{ alignItems: 'center', gap: 24 }}>
          <ActionButton 
            icon={HeartStraight} 
            color={item.isLiked ? colors.danger : '#fff'} 
            weight={item.isLiked ? 'fill' : 'regular'} 
            label={formatCount(item.likes)}
            onPress={() => toggleLike({ echoId: item.id, like: !item.isLiked })}
          />
          <ActionButton 
            icon={ChatCircle} 
            label={formatCount(item.commentCount)}
            onPress={() => router.push(`/thread/${item.id}`)}
          />
          <ActionButton 
            icon={BookmarkSimple} 
            label="Save"
          />
          <ActionButton 
            icon={ShareNetwork} 
            label="Share"
          />
        </View>
      </LinearGradient>
    </View>
  );
}
