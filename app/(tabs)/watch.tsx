import React, { useCallback, useRef } from 'react';
import { View, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useFocusEffect } from 'expo-router';
import { FeedCard } from '../../components/social/FeedCard';
import { FeedCardSkeleton } from '../../components/ui/Skeleton';
import { useActiveVideoStore } from '../../store/useActiveVideoStore';
import { useInfiniteVideoFeed } from '../../hooks/queries/useFeed';
import { useResponsiveLayout } from '../../lib/responsive';
import { useTheme } from '../../lib/theme';


export default function WatchScreen() {
  const router = useRouter();
  const {
    data: feedData,
    isLoading,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteVideoFeed();
  
  const feed = feedData?.pages.flat() ?? [];
  const listRef = useRef<any>(null);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();

  const setActiveEchoId = useActiveVideoStore(s => s.setActiveEchoId);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item?: any }[] }) => {
    const first = viewableItems?.find((v) => v?.item?.id)?.item;
    if (first) {
      setActiveEchoId(first.id);
    } else {
      setActiveEchoId(null);
    }
  }).current;
  
  useFocusEffect(
    useCallback(() => {
      // Focus: do nothing, viewability config will update it
      return () => {
        // Blur: clear active video so it doesn't block other screens
        setActiveEchoId(null);
      };
    }, [setActiveEchoId])
  );

  const feedMaxWidth = layout.isDesktop ? layout.wideMaxWidth : layout.width;
  const feedContainerStyle = {
    width: '100%' as const,
    maxWidth: feedMaxWidth,
    alignSelf: 'center' as const,
  };

  const ListHeader = (
    <View style={feedContainerStyle}>
      <View style={{ height: insets.top + 16 }} />
    </View>
  );

  if (isLoading && feed.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {ListHeader}
        <View style={feedContainerStyle}>
          <FeedCardSkeleton />
          <FeedCardSkeleton />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlashList
        ref={listRef}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        data={feed}
        style={feedContainerStyle}
        renderItem={({ item, index }) => (
          <FeedCard
            item={item}
            index={index}
            onPress={() => router.push(`/thread/${item.id}`)}
          />
        )}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={
          <View style={{ height: layout.bottomChromePadding + 40, justifyContent: 'center', alignItems: 'center' }} />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            void fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressViewOffset={insets.top + 20}
          />
        }
      />
      
      <View style={{ position: 'absolute', top: insets.top + 6, left: 16, zIndex: 10 }}>
        {/* Placeholder for future header element if needed */}
      </View>
    </View>
  );
}
