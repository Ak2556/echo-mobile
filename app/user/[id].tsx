import React, { useState } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft, BadgeCheck, MoreHorizontal, Mail,
  UserX, Flag, Share2,
} from 'lucide-react-native';
import { FeedCard } from '../../components/social/FeedCard';
import { useAppStore } from '../../store/useAppStore';
import { useFeed } from '../../hooks/queries/useFeed';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useRemoteProfileBundle } from '../../hooks/queries/useRemoteProfile';
import { useToggleRemoteFollow } from '../../hooks/queries/useSupabaseSocial';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const remote = isSupabaseRemote();
  const remoteBundle = useRemoteProfileBundle(remote ? id : undefined);
  const followMut = useToggleRemoteFollow();

  const {
    getUser, isFollowing, toggleFollow, isBlocked, toggleBlock, getOrCreateConversation,
  } = useAppStore();
  const { data: feed } = useFeed();
  const [showMenu, setShowMenu] = useState(false);

  if (remote) {
    if (remoteBundle.isPending) {
      return (
        <SafeAreaView className="flex-1 bg-black items-center justify-center">
          <ActivityIndicator color="#3B82F6" size="large" />
        </SafeAreaView>
      );
    }
    if (!remoteBundle.data) {
      return (
        <SafeAreaView className="flex-1 bg-black items-center justify-center">
          <Text className="text-zinc-400">User not found</Text>
          <Pressable onPress={() => router.back()} className="mt-4">
            <Text className="text-blue-400">Go Back</Text>
          </Pressable>
        </SafeAreaView>
      );
    }

    const { user, echoes, isFollowing: following, isSelf } = remoteBundle.data;
    const blocked = isBlocked(user.id);

    const handleMessage = () => {
      const convId = getOrCreateConversation(user);
      router.push(`/messages/${convId}`);
    };

    const handleBlock = () => {
      Alert.alert(
        blocked ? 'Unblock User' : 'Block User',
        blocked ? `Unblock @${user.username}?` : `Block @${user.username}? They won't be able to see your content.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: blocked ? 'Unblock' : 'Block', style: 'destructive', onPress: () => toggleBlock(user.id) },
        ]
      );
    };

    const handleReport = () => {
      router.push({ pathname: '/report', params: { targetType: 'user', targetId: user.id, targetName: user.username } });
    };

    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-black">
        <FlashList
          data={echoes}
          renderItem={({ item, index }) => (
            <FeedCard item={item} index={index} onPress={() => router.push(`/thread/${item.id}`)} />
          )}
          keyExtractor={item => item.id}
          ListHeaderComponent={(
            <View>
              <View className="flex-row items-center justify-between px-4 py-2">
                <Pressable onPress={() => router.back()} className="p-1">
                  <ArrowLeft color="#fff" size={24} />
                </Pressable>
                <Pressable onPress={() => setShowMenu(!showMenu)} className="p-1">
                  <MoreHorizontal color="#fff" size={24} />
                </Pressable>
              </View>

              {showMenu && (
                <View className="absolute top-12 right-4 bg-zinc-900 rounded-xl border border-zinc-800 z-50 overflow-hidden">
                  <Pressable onPress={() => { setShowMenu(false); handleReport(); }} className="flex-row items-center px-4 py-3 gap-3">
                    <Flag color="#F59E0B" size={16} />
                    <Text className="text-white text-sm">Report</Text>
                  </Pressable>
                  <View className="border-b border-zinc-800" />
                  <Pressable onPress={() => { setShowMenu(false); handleBlock(); }} className="flex-row items-center px-4 py-3 gap-3">
                    <UserX color="#EF4444" size={16} />
                    <Text className="text-red-400 text-sm">{blocked ? 'Unblock' : 'Block'}</Text>
                  </Pressable>
                </View>
              )}

              <Animated.View entering={FadeInDown.delay(100).springify()} className="items-center px-4 pt-2 pb-4">
                <View
                  className="w-20 h-20 rounded-full items-center justify-center mb-3"
                  style={{ backgroundColor: user.avatarColor }}
                >
                  <Text className="text-white text-3xl font-bold">
                    {user.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5 mb-1">
                  <Text className="text-white text-xl font-bold">{user.displayName}</Text>
                  {user.isVerified && <BadgeCheck color="#3B82F6" size={20} fill="#3B82F6" />}
                </View>
                <Text className="text-zinc-500 text-sm mb-2">@{user.username}</Text>
                {user.bio ? <Text className="text-zinc-300 text-center text-sm mb-4">{user.bio}</Text> : null}

                <View className="flex-row gap-8 mb-4">
                  <Pressable className="items-center">
                    <Text className="text-white font-bold text-lg">{echoes.length}</Text>
                    <Text className="text-zinc-500 text-xs">Echoes</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push({ pathname: '/followers', params: { userId: user.id, tab: 'followers' } })} className="items-center">
                    <Text className="text-white font-bold text-lg">{user.followerCount}</Text>
                    <Text className="text-zinc-500 text-xs">Followers</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push({ pathname: '/followers', params: { userId: user.id, tab: 'following' } })} className="items-center">
                    <Text className="text-white font-bold text-lg">{user.followingCount}</Text>
                    <Text className="text-zinc-500 text-xs">Following</Text>
                  </Pressable>
                </View>

                {!isSelf && (
                  <View className="flex-row gap-3">
                    <Pressable
                      onPress={() =>
                        followMut.mutate({ userId: user.id, follow: !following })
                      }
                      className={`flex-1 py-2.5 rounded-xl items-center ${following ? 'bg-zinc-800 border border-zinc-700' : 'bg-blue-600'}`}
                    >
                      <Text className="font-semibold text-white">
                        {following ? 'Following' : 'Follow'}
                      </Text>
                    </Pressable>
                    <Pressable onPress={handleMessage} className="py-2.5 px-4 rounded-xl bg-zinc-800 border border-zinc-700">
                      <Mail color="#fff" size={20} />
                    </Pressable>
                    <Pressable className="py-2.5 px-4 rounded-xl bg-zinc-800 border border-zinc-700">
                      <Share2 color="#fff" size={20} />
                    </Pressable>
                  </View>
                )}
              </Animated.View>

              <View className="border-b border-zinc-900 mx-4 mb-2" />
              <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 mb-2">
                Echoes · {echoes.length}
              </Text>
            </View>
          )}
          ListEmptyComponent={(
            <View className="items-center pt-12">
              <Text className="text-zinc-500">No echoes yet</Text>
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  const user = id ? getUser(id) : undefined;
  const following = id ? isFollowing(id) : false;
  const blocked = id ? isBlocked(id) : false;
  const userEchoes = (feed || []).filter(item => item.username === user?.username);

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-black items-center justify-center">
        <Text className="text-zinc-400">User not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-blue-400">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const handleMessage = () => {
    const convId = getOrCreateConversation(user);
    router.push(`/messages/${convId}`);
  };

  const handleBlock = () => {
    Alert.alert(
      blocked ? 'Unblock User' : 'Block User',
      blocked ? `Unblock @${user.username}?` : `Block @${user.username}? They won't be able to see your content.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: blocked ? 'Unblock' : 'Block', style: 'destructive', onPress: () => toggleBlock(user.id) },
      ]
    );
  };

  const handleReport = () => {
    router.push({ pathname: '/report', params: { targetType: 'user', targetId: user.id, targetName: user.username } });
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-black">
      <FlashList
        data={userEchoes}
        renderItem={({ item, index }) => (
          <FeedCard item={item} index={index} onPress={() => router.push(`/thread/${item.id}`)} />
        )}
        keyExtractor={item => item.id}
        ListHeaderComponent={(
          <View>
            <View className="flex-row items-center justify-between px-4 py-2">
              <Pressable onPress={() => router.back()} className="p-1">
                <ArrowLeft color="#fff" size={24} />
              </Pressable>
              <Pressable onPress={() => setShowMenu(!showMenu)} className="p-1">
                <MoreHorizontal color="#fff" size={24} />
              </Pressable>
            </View>

            {showMenu && (
              <View className="absolute top-12 right-4 bg-zinc-900 rounded-xl border border-zinc-800 z-50 overflow-hidden">
                <Pressable onPress={() => { setShowMenu(false); handleReport(); }} className="flex-row items-center px-4 py-3 gap-3">
                  <Flag color="#F59E0B" size={16} />
                  <Text className="text-white text-sm">Report</Text>
                </Pressable>
                <View className="border-b border-zinc-800" />
                <Pressable onPress={() => { setShowMenu(false); handleBlock(); }} className="flex-row items-center px-4 py-3 gap-3">
                  <UserX color="#EF4444" size={16} />
                  <Text className="text-red-400 text-sm">{blocked ? 'Unblock' : 'Block'}</Text>
                </Pressable>
              </View>
            )}

            <Animated.View entering={FadeInDown.delay(100).springify()} className="items-center px-4 pt-2 pb-4">
              <View
                className="w-20 h-20 rounded-full items-center justify-center mb-3"
                style={{ backgroundColor: user.avatarColor }}
              >
                <Text className="text-white text-3xl font-bold">
                  {user.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5 mb-1">
                <Text className="text-white text-xl font-bold">{user.displayName}</Text>
                {user.isVerified && <BadgeCheck color="#3B82F6" size={20} fill="#3B82F6" />}
              </View>
              <Text className="text-zinc-500 text-sm mb-2">@{user.username}</Text>
              {user.bio ? <Text className="text-zinc-300 text-center text-sm mb-4">{user.bio}</Text> : null}

              <View className="flex-row gap-8 mb-4">
                <Pressable className="items-center">
                  <Text className="text-white font-bold text-lg">{user.echoCount}</Text>
                  <Text className="text-zinc-500 text-xs">Echoes</Text>
                </Pressable>
                <Pressable onPress={() => router.push({ pathname: '/followers', params: { userId: user.id, tab: 'followers' } })} className="items-center">
                  <Text className="text-white font-bold text-lg">{user.followerCount}</Text>
                  <Text className="text-zinc-500 text-xs">Followers</Text>
                </Pressable>
                <Pressable onPress={() => router.push({ pathname: '/followers', params: { userId: user.id, tab: 'following' } })} className="items-center">
                  <Text className="text-white font-bold text-lg">{user.followingCount}</Text>
                  <Text className="text-zinc-500 text-xs">Following</Text>
                </Pressable>
              </View>

              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => toggleFollow(user.id)}
                  className={`flex-1 py-2.5 rounded-xl items-center ${following ? 'bg-zinc-800 border border-zinc-700' : 'bg-blue-600'}`}
                >
                  <Text className="font-semibold text-white">
                    {following ? 'Following' : 'Follow'}
                  </Text>
                </Pressable>
                <Pressable onPress={handleMessage} className="py-2.5 px-4 rounded-xl bg-zinc-800 border border-zinc-700">
                  <Mail color="#fff" size={20} />
                </Pressable>
                <Pressable className="py-2.5 px-4 rounded-xl bg-zinc-800 border border-zinc-700">
                  <Share2 color="#fff" size={20} />
                </Pressable>
              </View>
            </Animated.View>

            <View className="border-b border-zinc-900 mx-4 mb-2" />
            <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 mb-2">
              Echoes · {userEchoes.length}
            </Text>
          </View>
        )}
        ListEmptyComponent={(
          <View className="items-center pt-12">
            <Text className="text-zinc-500">No echoes yet</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
