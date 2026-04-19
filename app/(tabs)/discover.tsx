import React, { useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { FeedCard } from '../../components/social/FeedCard';
import { SearchBar } from '../../components/social/SearchBar';
import { useFeed } from '../../hooks/queries/useFeed';
import { FeedItem } from '../../types';

export default function DiscoverScreen() {
  const router = useRouter();
  const { data: feed, isLoading, refetch, isRefetching } = useFeed();
  const [search, setSearch] = useState('');

  const filtered = feed?.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.prompt.toLowerCase().includes(q) ||
      item.response.toLowerCase().includes(q) ||
      item.username.toLowerCase().includes(q)
    );
  });

  const handlePressThread = useCallback((item: FeedItem) => {
    router.push(`/thread/${item.id}`);
  }, [router]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-black">
      <View className="px-4 pt-3 pb-2">
        <Text className="text-white text-2xl font-bold">Discover</Text>
        <Text className="text-zinc-500 text-sm mt-0.5">Explore conversations from the community</Text>
      </View>

      <SearchBar value={search} onChangeText={setSearch} />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#3B82F6" size="large" />
        </View>
      ) : (
        <FlashList
          data={filtered}
          renderItem={({ item, index }) => (
            <FeedCard item={item} index={index} onPress={() => handlePressThread(item)} />
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 20, paddingTop: 4 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#3B82F6"
            />
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center pt-20">
              <Text className="text-zinc-500 text-base">
                {search ? 'No echoes match your search' : 'No echoes yet'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
