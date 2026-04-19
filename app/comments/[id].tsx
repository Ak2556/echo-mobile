import React, { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, Send, MessageCircle } from 'lucide-react-native';
import { TextInput } from '../../components/ui/TextInput';
import { CommentCard } from '../../components/social/CommentCard';
import { EmptyState } from '../../components/common/EmptyState';
import { useAppStore } from '../../store/useAppStore';
import { Comment } from '../../types';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useEchoComments, useAddRemoteComment } from '../../hooks/queries/useEchoComments';

export default function CommentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const remote = isSupabaseRemote();
  const remoteQ = useEchoComments(remote ? id : undefined);
  const addRemote = useAddRemoteComment(remote ? id : undefined);

  const { getComments, addComment, username, displayName, avatarColor } = useAppStore();
  const [text, setText] = useState('');

  const localComments = !remote && id ? getComments(id) : [];
  const comments: Comment[] = remote ? (remoteQ.data ?? []) : localComments;
  const loadingRemote = remote && remoteQ.isPending;

  const handleSend = async () => {
    if (!text.trim() || !id) return;
    if (remote) {
      try {
        await addRemote.mutateAsync(text.trim());
        setText('');
      } catch (e) {
        Alert.alert('Could not post', (e as Error).message);
      }
      return;
    }
    const comment: Comment = {
      id: Date.now().toString(),
      echoId: id,
      userId: 'me',
      username,
      displayName: displayName || username,
      avatarColor,
      isVerified: false,
      content: text.trim(),
      likes: 0,
      isLiked: false,
      replyCount: 0,
      createdAt: new Date().toISOString(),
    };
    addComment(id, comment);
    setText('');
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-black">
      <View className="flex-row items-center px-4 py-3 border-b border-zinc-900">
        <Pressable onPress={() => router.back()} className="p-1 mr-3">
          <ArrowLeft color="#fff" size={24} />
        </Pressable>
        <Text className="text-white font-bold text-lg flex-1">Comments</Text>
        <Text className="text-zinc-500 text-sm">{comments.length}</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loadingRemote ? (
          <View className="flex-1 items-center justify-center pt-20">
            <ActivityIndicator color="#3B82F6" size="large" />
          </View>
        ) : comments.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No comments yet"
            subtitle="Be the first to share your thoughts on this echo."
          />
        ) : (
          <FlashList
            data={comments}
            renderItem={({ item }) => (
              <CommentCard comment={item} echoId={id!} />
            )}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingVertical: 8 }}
          />
        )}

        <View className="flex-row items-end px-4 py-3 border-t border-zinc-900 bg-black">
          <View
            className="w-8 h-8 rounded-full items-center justify-center mr-2"
            style={{ backgroundColor: avatarColor }}
          >
            <Text className="text-white font-bold text-xs">
              {(username || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1 mr-2">
            <TextInput
              placeholder="Add a comment..."
              value={text}
              onChangeText={setText}
              maxLength={500}
            />
          </View>
          <Pressable
            onPress={() => { void handleSend(); }}
            disabled={!text.trim() || addRemote.isPending}
            className={`p-2.5 rounded-full ${text.trim() && !addRemote.isPending ? 'bg-blue-600' : 'bg-zinc-800'}`}
          >
            <Send color="#fff" size={18} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
