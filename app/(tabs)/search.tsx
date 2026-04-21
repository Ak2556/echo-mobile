import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { TrendUp, Hash } from 'phosphor-react-native';
import { SearchBar } from '../../components/social/SearchBar';
import { UserRow } from '../../components/social/UserRow';
import { FeedCard } from '../../components/social/FeedCard';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useFeed } from '../../hooks/queries/useFeed';

const TRENDING_TAGS = ['#AI', '#ReactNative', '#MachineLearning', '#WebDev', '#Design', '#Python', '#Crypto', '#DevOps'];

const CATEGORIES = [
  { label: 'Technology', color: '#3B82F6', icon: '\u{1F4BB}' },
  { label: 'Science', color: '#10B981', icon: '\u{1F52C}' },
  { label: 'Design', color: '#F59E0B', icon: '\u{1F3A8}' },
  { label: 'Business', color: '#8B5CF6', icon: '\u{1F4CA}' },
  { label: 'Health', color: '#EF4444', icon: '\u{1F3E5}' },
  { label: 'Education', color: '#06B6D4', icon: '\u{1F4DA}' },
];

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'top' | 'users' | 'tags'>('top');
  const { searchUsers } = useAppStore();
  const { data: feed } = useFeed();

  const isSearching = query.trim().length > 0;
  const matchedUsers = isSearching ? searchUsers(query) : [];
  const matchedEchoes = isSearching
    ? (feed || []).filter(item => {
        const q = query.toLowerCase();
        return item.prompt.toLowerCase().includes(q) ||
               item.response.toLowerCase().includes(q) ||
               item.username.toLowerCase().includes(q) ||
               item.hashtags?.some(h => h.toLowerCase().includes(q));
      })
    : [];

  const trendingEchoes = (feed || [])
    .sort((a, b) => (b.likes + b.repostCount + b.commentCount) - (a.likes + a.repostCount + a.commentCount))
    .slice(0, 5);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-black">
      <View className="px-4 pt-3 pb-1">
        <Text className="text-white text-2xl font-bold mb-3">Explore</Text>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search users, echoes, hashtags..." />
      </View>

      {isSearching ? (
        <Animated.View entering={FadeIn.duration(200)} className="flex-1">
          {/* Search tabs */}
          <View className="flex-row px-4 mb-3 gap-2">
            {(['top', 'users', 'tags'] as const).map(tab => (
              <AnimatedPressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-full ${activeTab === tab ? 'bg-white' : 'bg-zinc-900'}`}
                scaleValue={0.93}
                haptic="light"
              >
                <Text className={`text-sm font-semibold capitalize ${activeTab === tab ? 'text-black' : 'text-zinc-400'}`}>{tab}</Text>
              </AnimatedPressable>
            ))}
          </View>

          {activeTab === 'users' ? (
            <FlashList
              data={matchedUsers}
              renderItem={({ item }) => (
                <UserRow user={item} onPress={() => router.push(`/user/${item.id}`)} />
              )}
              keyExtractor={item => item.id}
              ListEmptyComponent={
                <View className="items-center pt-20">
                  <Text className="text-zinc-500">No users found</Text>
                </View>
              }
            />
          ) : (
            <FlashList
              data={matchedEchoes}
              renderItem={({ item, index }) => (
                <FeedCard item={item} index={index} onPress={() => router.push(`/thread/${item.id}`)} />
              )}
              keyExtractor={item => item.id}
              ListEmptyComponent={
                <View className="items-center pt-20">
                  <Text className="text-zinc-500">No echoes found</Text>
                </View>
              }
            />
          )}
        </Animated.View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Categories */}
          <Animated.View entering={FadeInDown.delay(100).springify()} className="px-4 mb-5">
            <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">Categories</Text>
            <View className="flex-row flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <AnimatedPressable
                  key={cat.label}
                  onPress={() => setQuery(cat.label)}
                  className="bg-zinc-900 rounded-xl px-4 py-3 flex-row items-center border border-zinc-800"
                  scaleValue={0.94}
                  haptic="light"
                >
                  <Text className="text-lg mr-2">{cat.icon}</Text>
                  <Text className="text-white font-medium text-sm">{cat.label}</Text>
                </AnimatedPressable>
              ))}
            </View>
          </Animated.View>

          {/* Trending Hashtags */}
          <Animated.View entering={FadeInDown.delay(200).springify()} className="px-4 mb-5">
            <View className="flex-row items-center mb-3">
              <Hash color="#3B82F6" size={16} />
              <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider ml-1">Trending Tags</Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {TRENDING_TAGS.map(tag => (
                <AnimatedPressable
                  key={tag}
                  onPress={() => setQuery(tag.slice(1))}
                  className="bg-zinc-900 rounded-full px-4 py-2 border border-zinc-800"
                  scaleValue={0.93}
                  haptic="light"
                >
                  <Text className="text-blue-400 font-medium text-sm">{tag}</Text>
                </AnimatedPressable>
              ))}
            </View>
          </Animated.View>

          {/* Trending Echoes */}
          <Animated.View entering={FadeInDown.delay(300).springify()} className="mb-6">
            <View className="flex-row items-center px-4 mb-3">
              <TrendUp color="#EF4444" size={16} />
              <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider ml-1">Trending Echoes</Text>
            </View>
            {trendingEchoes.map((item, index) => (
              <AnimatedPressable
                key={item.id}
                onPress={() => router.push(`/thread/${item.id}`)}
                className="flex-row items-center px-4 py-3 border-b border-zinc-900"
                scaleValue={0.98}
                haptic="light"
              >
                <Text className="text-zinc-600 font-bold text-lg w-8">{index + 1}</Text>
                <View className="flex-1">
                  <Text className="text-white font-medium text-sm" numberOfLines={1}>{item.prompt}</Text>
                  <Text className="text-zinc-500 text-xs mt-0.5">{item.username} \u00B7 {item.likes} likes</Text>
                </View>
              </AnimatedPressable>
            ))}
          </Animated.View>

          {/* Suggested Users */}
          <Animated.View entering={FadeInDown.delay(400).springify()} className="px-4 mb-8">
            <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">Suggested for You</Text>
            {useAppStore.getState().users.slice(0, 4).map(user => (
              <UserRow key={user.id} user={user} onPress={() => router.push(`/user/${user.id}`)} showFollowButton />
            ))}
          </Animated.View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
