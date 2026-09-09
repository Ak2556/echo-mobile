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

  // Which card was on screen when we left. Needed because focus cannot ask the
  // list what is visible, and the list will not volunteer it again — see below.
  const lastActiveIdRef = useRef<string | null>(null);
  // Read inside the focus effect without making the feed a dependency: adding
  // it there would re-run the effect on every refetch, and the cleanup would
  // null the active video mid-scroll.
  const feedRef = useRef(feed);
  feedRef.current = feed;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item?: any }[] }) => {
    const first = viewableItems?.find((v) => v?.item?.id)?.item;
    if (first) {
      lastActiveIdRef.current = first.id;
      setActiveEchoId(first.id);
    } else {
      setActiveEchoId(null);
    }
  }).current;

  useFocusEffect(
    useCallback(() => {
      // Restoring on focus is not redundant with the viewability callback.
      // FlatList reports viewable items only when that set CHANGES, and coming
      // back to this tab changes nothing — the same card is still on screen.
      // So the id cleared on blur stayed null, no card was active, and
      // useVideoMountPolicy released the player. Tap-to-pause and the mute
      // button then toggled state against a player that no longer existed, and
      // both looked dead until the user happened to scroll.
      const remembered = lastActiveIdRef.current;
      // Only if it survived: a refetch while away can drop the card, and
      // activating a stale id would leave nothing playing. In that case the
      // item set really did change, so viewability fires on its own.
      if (remembered && feedRef.current.some(entry => entry.id === remembered)) {
        setActiveEchoId(remembered);
      }
      return () => {
        // Blur: clear active video so it doesn't block other screens.
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
