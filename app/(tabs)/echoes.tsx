import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, useWindowDimensions, ViewToken, Pressable,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Sparkle, Plus } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useFeed } from '../../hooks/queries/useFeed';
import { EchoCard } from '../../components/social/EchoCard';
import { FeedItem } from '../../types';

function TextEchoCard({ item }: { item: FeedItem }) {
  const { height: SCREEN_H } = useWindowDimensions();
  return (
    <View style={{ width: '100%', height: SCREEN_H, backgroundColor: '#0a0a0f', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 100 }}>
      <Text
        style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}
      >
        @{item.username}
      </Text>
      <Text
        style={{ color: '#fff', fontSize: 26, fontWeight: '800', lineHeight: 34, marginBottom: 16 }}
        numberOfLines={6}
      >
        {item.editorialTitle || item.prompt}
      </Text>
      {!!(item.authorNote || item.response) && (
        <Text
          style={{ color: 'rgba(255,255,255,0.65)', fontSize: 16, lineHeight: 26 }}
          numberOfLines={5}
        >
          {item.authorNote || item.response}
        </Text>
      )}
      {item.hashtags?.length > 0 && (
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 20 }} numberOfLines={1}>
          {item.hashtags.slice(0, 4).map(t => `#${t}`).join('  ')}
        </Text>
      )}
    </View>
  );
}

export default function EchoesScreen() {
  const { height: SCREEN_H } = useWindowDimensions();
  const router = useRouter();
  const { data: feed, isLoading } = useFeed();
  const [activeIdx, setActiveIdx] = useState(0);

  const echoFeed = feed ?? [];

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIdx(viewableItems[0].index);
      }
    }
  );

  const renderItem = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => {
      const isVideo = item.postType === 'video' && !!item.videoUri;
      return isVideo
        ? <EchoCard item={item} isActive={index === activeIdx} />
        : <TextEchoCard item={item} />;
    },
    [activeIdx]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({ length: SCREEN_H, offset: SCREEN_H * index, index }),
    [SCREEN_H]
  );

  // Loading skeleton
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <Sparkle color="rgba(255,255,255,0.4)" size={48} weight="thin" />
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, marginTop: 14 }}>Loading Echoes…</Text>
      </View>
    );
  }

  // Empty state
  if (echoFeed.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 }}>
        <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: '#6366F120', borderWidth: 1, borderColor: '#6366F140', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkle color="#6366F1" size={36} weight="duotone" />
        </View>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' }}>No Echoes Yet</Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
          Publish your first Echo from a chat conversation.
        </Text>
        <Pressable
          onPress={() => router.push('/create-post' as any)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: '#6366F1', marginTop: 8 }}
        >
          <Plus color="#fff" size={18} weight="bold" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Create Echo</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Floating header */}
      <Animated.View
        entering={FadeIn.duration(80)}
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Sparkle color="#fff" size={20} weight="fill" />
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>
            Echoes
          </Text>
        </View>
      </Animated.View>

      {/* Create button — top right */}
      <Pressable
        onPress={() => router.push('/create-post' as any)}
        style={{
          position: 'absolute', top: 52, right: 16, zIndex: 11,
          backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 8,
        }}
      >
        <Plus color="#fff" size={20} weight="bold" />
      </Pressable>

      <FlatList
        data={echoFeed}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        viewabilityConfig={viewabilityConfig.current}
        onViewableItemsChanged={onViewableItemsChanged.current}
        getItemLayout={getItemLayout}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
}
