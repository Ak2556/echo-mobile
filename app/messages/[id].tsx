// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, FlatList, TextInput as RNTextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, PaperPlaneTilt, SealCheck } from 'phosphor-react-native';
import Animated, { SlideInRight, SlideInLeft, useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';

function DMBubble({ message, isMe, showReadReceipt }: { message: any; isMe: boolean; showReadReceipt: boolean }) {
  const { reduceAnimations, accentColor, fontSize: fontSizeSetting } = useAppStore();
  const { colors } = useTheme();
  const textSize = { small: 14, medium: 16, large: 18 }[fontSizeSetting];

  const entering = reduceAnimations
    ? undefined
    : isMe
      ? FadeIn.duration(60)
      : FadeIn.duration(60);

  return (
    <Animated.View
      entering={entering}
      className={`px-4 py-1.5 ${isMe ? 'items-end' : 'items-start'}`}
    >
      <View
        className={`max-w-[75%] px-4 py-2.5 ${
          isMe ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-bl-sm'
        }`}
        style={{ backgroundColor: isMe ? accentColor : colors.surface }}
      >
        <Text style={{ color: '#fff', fontSize: textSize, lineHeight: textSize * 1.3 }}>{message.content}</Text>
      </View>
      <View className="flex-row items-center gap-1 mt-1 mx-1">
        <Text style={{ color: colors.textMuted, fontSize: 10 }}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {isMe && showReadReceipt && message.isRead && (
          <Text style={{ color: colors.accent, fontSize: 10 }}>Read</Text>
        )}
      </View>
    </Animated.View>
  );
}

export default function DMScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { conversations, getDMs, sendDM, markConversationRead } = useAppStore();
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const readReceipts = useAppStore(s => s.readReceipts);
  const { colors, isUserOnline } = useTheme();
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);
  const sendScale = useSharedValue(1);

  const conversation = conversations.find(c => c.id === id);
  const messages = id ? getDMs(id) : [];
  const online = conversation ? isUserOnline(conversation.userId) : false;

  useEffect(() => {
    if (id) markConversationRead(id);
  }, [id]);

  const sendBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
  }));

  const handleSend = () => {
    if (!text.trim() || !id) return;
    sendScale.value = withSequence(
      withSpring(0.75, { damping: 8, stiffness: 500 }),
      withSpring(1.1, { damping: 8, stiffness: 300 }),
      withSpring(1, { damping: 12, stiffness: 300 })
    );
    if (hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    sendDM(id, text.trim());
    setText('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  if (!conversation) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} className="items-center justify-center">
        <Text style={{ color: colors.textSecondary }}>Conversation not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View className="flex-row items-center px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} className="p-1 mr-3" scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <View
          className="w-9 h-9 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: conversation.avatarColor }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
            {conversation.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-1">
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{conversation.displayName}</Text>
            {conversation.isVerified && <SealCheck color={colors.accent} size={14} weight="fill" />}
          </View>
          <Text style={{ color: online ? colors.success : colors.textMuted, fontSize: 12 }}>
            {online ? 'Online' : `@${conversation.username}`}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={({ item }) => (
            <DMBubble message={item} isMe={item.senderId === 'me'} showReadReceipt={readReceipts} />
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingVertical: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        <View className="flex-row items-end px-4 py-3" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
          <View className="flex-1 mr-2 min-h-[44px] justify-center px-4 py-2.5" style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 16 }}>
            <RNTextInput
              style={{ color: colors.text, fontSize: 16, lineHeight: 20 }}
              placeholder="Message..."
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
            />
          </View>
          <Animated.View style={sendBtnStyle}>
            <AnimatedPressable
              onPress={handleSend}
              disabled={!text.trim()}
              className="p-3 rounded-full mb-0.5"
              style={{ backgroundColor: text.trim() ? colors.accent : colors.surfaceHover }}
              scaleValue={0.88}
              haptic="none"
            >
              <PaperPlaneTilt color="#fff" size={18} />
            </AnimatedPressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
