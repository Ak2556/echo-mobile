import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VideoProbeOverlay } from '../../components/dev/VideoProbeOverlay';
import { View, Text, Pressable, RefreshControl, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchRemoteEchoById } from '../../lib/supabaseEchoApi';
import { FlowCard } from '../../components/feed/FlowCard';
import { useActiveVideoStore } from '../../store/useActiveVideoStore';
import { useInfiniteVideoFeed, type FlowSort } from '../../hooks/useFeed';
import { useI18n } from '../../lib/i18n/i18n';
import { useResponsiveLayout } from '../../lib/ui/responsive';
import { useTheme } from '../../lib/ui/theme';
import { ON_MEDIA } from '../../lib/ui/fixedColors';

// Trending | New, centred over the video like the rest of Flow's chrome. Layout
// sits on inner Views: box props on a Pressable drop out in release builds.
// White over video; theme colours while loading or empty, when the screen
// behind them is the theme background (white in light mode).
function FlowSortTabs({ sort, onChange, top, overVideo }: { sort: FlowSort; onChange: (s: FlowSort) => void; top: number; overVideo: boolean }) {
  const { t } = useI18n();
  const { font, colors } = useTheme();
  const on = overVideo ? ON_MEDIA : colors.text;
  const off = overVideo ? 'rgba(255,255,255,0.6)' : colors.textMuted;
  const tabs: { key: FlowSort; label: string }[] = [
    { key: 'trending', label: t('home.trending') },
    { key: 'new', label: t('common.new') },
  ];
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top, left: 0, right: 0, alignItems: 'center', zIndex: 5 }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {tabs.map(tab => {
          const active = sort === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              hitSlop={8}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
            >
              <View style={{ paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' }}>
                <Text
                  style={[font.bodySemibold, {
                    color: active ? on : off,
                    fontSize: 16,
                    textShadowColor: overVideo ? 'rgba(0,0,0,0.5)' : 'transparent',
                    textShadowRadius: 6,
                    textShadowOffset: { width: 0, height: 1 },
                  }]}
                >
                  {tab.label}
                </Text>
                <View style={{ marginTop: 4, width: 18, height: 2.5, borderRadius: 2, backgroundColor: active ? on : 'transparent' }} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function WatchScreen() {
  const router = useRouter();
  const [sort, setSort] = useState<FlowSort>('trending');
  const {
    data: feedData,
    isLoading,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteVideoFeed(sort);
  
  // A tap on a friend's "just posted" notification lands here with that video's
  // id (lib/notifications/tapTarget.ts): it plays first, and the feed follows.
  const { echoId } = useLocalSearchParams<{ echoId?: string }>();
  const pinnedId = typeof echoId === 'string' && echoId ? echoId : undefined;
  const { data: pinnedItem } = useQuery({
    queryKey: ['echo', pinnedId],
    queryFn: () => fetchRemoteEchoById(pinnedId!),
    enabled: !!pinnedId,
    staleTime: 60_000,
  });
  const baseFeed = feedData?.pages.flat() ?? [];
  const feed = pinnedItem && pinnedItem.postType === 'video'
    ? [pinnedItem, ...baseFeed.filter(entry => entry.id !== pinnedItem.id)]
    : baseFeed;
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

  // Back to the top when a different video is asked for, so it is the one on screen.
  useEffect(() => {
    if (pinnedItem?.id) listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [pinnedItem?.id]);

  // The id is for one arrival. Leaving the tab drops it, or Flow would put the
  // same video first every time the person came back.
  const pinnedIdRef = useRef(pinnedId);
  pinnedIdRef.current = pinnedId;
  useFocusEffect(
    useCallback(() => () => {
      if (pinnedIdRef.current) router.setParams({ echoId: undefined });
    }, [router]),
  );

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

  const feedMaxWidth = layout.isDesktop ? layout.wideMaxWidth : layout.contentMaxWidth;
  const feedContainerStyle = {
    width: '100%' as const,
    maxWidth: feedMaxWidth,
    alignSelf: 'center' as const,
  };

  const changeSort = (next: FlowSort) => {
    if (next === sort) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      return;
    }
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    setSort(next);
  };
  // Level with the mute button on each card (FlowCard: insets.top + 12, 40pt).
  const sortTabs = <FlowSortTabs sort={sort} onChange={changeSort} top={insets.top + 12} overVideo={feed.length > 0} />;

  if (isLoading && feed.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>{sortTabs}</View>
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
      {sortTabs}
      <VideoProbeOverlay />
    </View>
  );
}
