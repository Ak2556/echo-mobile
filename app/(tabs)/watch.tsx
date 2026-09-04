import React, { useCallback, useRef } from 'react';
import { VideoProbeOverlay } from '../../components/dev/VideoProbeOverlay';
import { View, RefreshControl, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { FlowCard } from '../../src/features/feed/ui/FlowCard';
import { useActiveVideoStore } from '../../store/useActiveVideoStore';
import { useInfiniteVideoFeed } from '../../src/features/feed/api/useFeed';
import { useResponsiveLayout } from '../../src/shared/lib/responsive';
import { useTheme } from '../../src/shared/lib/theme';


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

  if (isLoading && feed.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }} />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        ref={listRef}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        data={feed}
        style={{ width: '100%', height: '100%' }}
        pagingEnabled
        snapToInterval={layout.height}
        snapToAlignment="start"
        decelerationRate="fast"
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews={false}
        renderItem={({ item, index }) => (
          <FlowCard
            item={item}
            index={index}
          />
        )}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
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
      <VideoProbeOverlay />
    </View>
  );
}
