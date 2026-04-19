import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Heart, BadgeCheck, MessageCircle } from 'lucide-react-native';
import { Comment } from '../../types';
import { useAppStore } from '../../store/useAppStore';

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

interface CommentCardProps {
  comment: Comment;
  echoId: string;
}

export function CommentCard({ comment, echoId }: CommentCardProps) {
  const { likeComment } = useAppStore();

  return (
    <View className="flex-row px-4 py-3 border-b border-zinc-900/50">
      {/* Avatar */}
      <View
        className="w-9 h-9 rounded-full items-center justify-center mr-3 mt-0.5"
        style={{ backgroundColor: comment.avatarColor }}
      >
        <Text className="text-white font-bold text-sm">
          {comment.displayName.charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Content */}
      <View className="flex-1">
        <View className="flex-row items-center gap-1 mb-1">
          <Text className="text-white font-semibold text-sm">{comment.displayName}</Text>
          {comment.isVerified && <BadgeCheck color="#3B82F6" size={14} fill="#3B82F6" />}
          <Text className="text-zinc-600 text-xs">· {getTimeAgo(comment.createdAt)}</Text>
        </View>

        <Text className="text-zinc-200 text-sm leading-5">{comment.content}</Text>

        {/* Actions */}
        <View className="flex-row items-center gap-5 mt-2">
          <Pressable
            onPress={() => likeComment(echoId, comment.id)}
            className="flex-row items-center gap-1"
          >
            <Heart
              color={comment.isLiked ? '#EF4444' : '#71717A'}
              size={14}
              fill={comment.isLiked ? '#EF4444' : 'transparent'}
            />
            <Text className={`text-xs ${comment.isLiked ? 'text-red-400' : 'text-zinc-500'}`}>
              {comment.likes}
            </Text>
          </Pressable>
          <Pressable className="flex-row items-center gap-1">
            <MessageCircle color="#71717A" size={14} />
            <Text className="text-zinc-500 text-xs">Reply</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
