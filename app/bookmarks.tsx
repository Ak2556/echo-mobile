import React, { useMemo, useState } from 'react';
import { View, Text, Alert, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { EditMessageModal } from '../components/ai/EditMessageModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, BookmarkSimple, Plus } from 'phosphor-react-native';
import { FeedCard } from '../components/social/FeedCard';
import { FeedCardSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { useFeed } from '../hooks/queries/useFeed';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { useRemoteBookmarks } from '../hooks/queries/useRemoteBookmarks';

export default function BookmarksScreen() {
  const router = useRouter();
  const remote = isSupabaseRemote();
  const { bookmarkedIds, bookmarkCollections, bookmarkCollectionByEchoId, createBookmarkCollection, setBookmarkCollection } = useAppStore();
  const { data: feed } = useFeed();
  const remoteQ = useRemoteBookmarks();
  const { colors } = useTheme();
  const [activeCol, setActiveCol] = useState<string | 'all'>('all');

  const bookmarked = useMemo(() => {
    const allBookmarked = remote
      ? (remoteQ.data ?? [])
      : (feed || []).filter(item => bookmarkedIds.includes(item.id));
    if (activeCol === 'all') return allBookmarked;
    return allBookmarked.filter(item => bookmarkCollectionByEchoId[item.id] === activeCol);
  }, [remote, remoteQ.data, feed, bookmarkedIds, activeCol, bookmarkCollectionByEchoId]);

  const loading = remote && remoteQ.isPending;
  const [namingOpen, setNamingOpen] = useState(false);

  const handleNewCollection = () => setNamingOpen(true);
  const handleNamingSubmit = (name: string) => {
    if (!name.trim()) return;
    const id = createBookmarkCollection(name.trim());
    setActiveCol(id);
    setNamingOpen(false);
  };

  const handleAssignCollection = (echoId: string) => {
    if (bookmarkCollections.length === 0) {
      handleNewCollection();
      return;
    }
    Alert.alert(
      'Move to collection',
      undefined,
      [
        { text: 'No collection', onPress: () => setBookmarkCollection(echoId, null) },
        ...bookmarkCollections.map(c => ({ text: c.name, onPress: () => setBookmarkCollection(echoId, c.id) })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View className="flex-row items-center px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} className="p-1 mr-3" scaleValue={0.88} haptic="light" performanceMode="hot">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Bookmarks</Text>
        <View className="flex-1" />
        <Pressable onPress={handleNewCollection} hitSlop={10}>
          <Plus color={colors.textSecondary} size={20} />
        </Pressable>
      </View>

      {/* Collection chips */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
        {(['all', ...bookmarkCollections.map(c => c.id)] as ('all' | string)[]).map(key => {
          const label = key === 'all' ? 'All' : (bookmarkCollections.find(c => c.id === key)?.name ?? '');
          const active = activeCol === key;
          return (
            <Pressable
              key={key}
              onPress={() => setActiveCol(key)}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                backgroundColor: active ? colors.accent : colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                borderWidth: StyleSheet.hairlineWidth, borderColor: active ? 'transparent' : colors.glassBorder,
              }}
            >
              <Text style={{ color: active ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View className="pt-2">
          <FeedCardSkeleton />
          <FeedCardSkeleton />
          <FeedCardSkeleton />
        </View>
      ) : bookmarked.length === 0 ? (
        <EmptyState
          icon={<BookmarkSimple color="#6366F1" size={32} />}
          title="No bookmarks yet"
          subtitle="Save echoes you want to revisit later by tapping the bookmark icon."
          actionLabel="Explore"
          onAction={() => router.push('/(tabs)/home')}
        />
      ) : (
        <FlashList
          data={bookmarked}
          renderItem={({ item, index }) => (
            <Pressable onLongPress={() => handleAssignCollection(item.id)}>
              <FeedCard item={item} index={index} onPress={() => router.push(`/thread/${item.id}`)} />
            </Pressable>
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          refreshControl={
            remote ? (
              <RefreshControl refreshing={remoteQ.isFetching} onRefresh={() => remoteQ.refetch()} tintColor={colors.accent} />
            ) : undefined
          }
        />
      )}
      <EditMessageModal
        visible={namingOpen}
        initialValue=""
        onCancel={() => setNamingOpen(false)}
        onSubmit={handleNamingSubmit}
        title="New collection"
        subtitle="Group bookmarks by topic, project, or theme."
        submitLabel="Create"
        maxLength={40}
      />
    </SafeAreaView>
  );
}
