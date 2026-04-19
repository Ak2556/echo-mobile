import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { BadgeCheck } from 'lucide-react-native';
import { User } from '../../types';
import { useAppStore } from '../../store/useAppStore';

interface UserRowProps {
  user: User;
  onPress?: () => void;
  showFollowButton?: boolean;
}

export function UserRow({ user, onPress, showFollowButton = false }: UserRowProps) {
  const { isFollowing, toggleFollow } = useAppStore();
  const following = isFollowing(user.id);

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-4 py-3 border-b border-zinc-900"
    >
      <View
        className="w-11 h-11 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: user.avatarColor }}
      >
        <Text className="text-white font-bold text-base">
          {user.displayName.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View className="flex-1">
        <View className="flex-row items-center gap-1">
          <Text className="text-white font-semibold text-base">{user.displayName}</Text>
          {user.isVerified && <BadgeCheck color="#3B82F6" size={16} fill="#3B82F6" />}
        </View>
        <Text className="text-zinc-500 text-sm">@{user.username}</Text>
        {user.bio ? (
          <Text className="text-zinc-400 text-xs mt-0.5" numberOfLines={1}>{user.bio}</Text>
        ) : null}
      </View>

      {showFollowButton && (
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); toggleFollow(user.id); }}
          className={`px-4 py-1.5 rounded-full ${following ? 'bg-zinc-800 border border-zinc-700' : 'bg-white'}`}
        >
          <Text className={`text-sm font-semibold ${following ? 'text-white' : 'text-black'}`}>
            {following ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
}
