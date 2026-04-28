import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, PencilSimple, Envelope } from 'phosphor-react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { SealCheck } from 'phosphor-react-native';
import { EmptyState } from '../../components/common/EmptyState';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { Conversation } from '../../types';

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

function ConversationCard({ conversation, index, onPress }: {
  conversation: Conversation; index: number; onPress: () => void;
}) {
  const { colors, fontSizes, showAvatars, animation, isUserOnline } = useTheme();
  const online = isUserOnline(conversation.userId);

  return (
    <Animated.View entering={animation(FadeIn.delay(index * 20).duration(80))}>
      <AnimatedPressable onPress={onPress} className="flex-row items-center px-4 py-3.5" style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border }} scaleValue={0.98} haptic="light">
        {showAvatars && (
          <View className="relative">
            <View
              className="w-12 h-12 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: conversation.avatarColor }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.title * 0.9 }}>
                {conversation.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            {online && (
              <View className="absolute bottom-0 right-2 w-3.5 h-3.5 rounded-full" style={{ backgroundColor: colors.success, borderWidth: 2, borderColor: colors.bg }} />
            )}
            {conversation.unreadCount > 0 && (
              <Animated.View entering={animation(FadeInRight.springify())} className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{conversation.unreadCount}</Text>
              </Animated.View>
            )}
          </View>
        )}

        <View className="flex-1">
          <View className="flex-row items-center gap-1">
            <Text style={{
              fontWeight: '600', fontSize: fontSizes.body,
              color: conversation.unreadCount > 0 ? colors.text : colors.textSecondary,
            }}>
              {conversation.displayName}
            </Text>
            {conversation.isVerified && <SealCheck color={colors.accent} size={14} weight="fill" />}
            {online && <Text style={{ color: colors.success, fontSize: fontSizes.caption }}>online</Text>}
          </View>
          <Text
            style={{
              fontSize: fontSizes.small, marginTop: 2,
              color: conversation.unreadCount > 0 ? colors.textSecondary : colors.textMuted,
              fontWeight: conversation.unreadCount > 0 ? '500' : '400',
            }}
            numberOfLines={1}
          >
            {conversation.lastMessage}
          </Text>
        </View>

        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginLeft: 8 }}>{getTimeAgo(conversation.lastMessageAt)}</Text>
      </AnimatedPressable>
    </Animated.View>
  );
}

export default function MessagesListScreen() {
  const router = useRouter();
  const conversations = useAppStore(s => s.conversations);
  const { colors } = useTheme();

  const sorted = [...conversations].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View className="flex-row items-center justify-between px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} className="p-1" scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Messages</Text>
        <AnimatedPressable onPress={() => router.push('/(tabs)/search')} className="p-1" scaleValue={0.88} haptic="light" accessibilityLabel="New message" accessibilityRole="button">
          <PencilSimple color={colors.accent} size={22} />
        </AnimatedPressable>
      </View>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Envelope color="#6366F1" size={32} />}
          title="No messages yet"
          subtitle="Start a conversation by visiting someone's profile and tapping the message button."
        />
      ) : (
        <FlashList
          data={sorted}
          renderItem={({ item, index }: { item: Conversation; index: number }) => (
            <ConversationCard
              conversation={item}
              index={index}
              onPress={() => router.push(`/messages/${item.id}`)}
            />
          )}
          keyExtractor={(item: Conversation) => item.id}
        />
      )}
    </SafeAreaView>
  );
}
