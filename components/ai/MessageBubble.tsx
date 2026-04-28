import React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useAppStore } from '../../store/useAppStore';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface MessageBubbleProps {
  message: Message;
}

const FONT_SIZES = { small: 14, medium: 16, large: 18 };

function MessageBubbleInner({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  // Granular selectors — avoids re-render on unrelated store changes
  const chatBubbleStyle  = useAppStore(s => s.chatBubbleStyle);
  const fontSize         = useAppStore(s => s.fontSize);
  const reduceAnimations = useAppStore(s => s.reduceAnimations);
  const accentColor      = useAppStore(s => s.accentColor);

  const textSize = FONT_SIZES[fontSize];

  const entering = FadeIn.duration(reduceAnimations ? 0 : 60);

  const bubbleClasses = (() => {
    switch (chatBubbleStyle) {
      case 'classic':
        return isUser ? 'rounded-xl px-4 py-3' : 'rounded-xl px-4 py-3';
      case 'minimal':
        return 'px-3 py-2';
      default:
        return isUser ? 'rounded-2xl rounded-tr-sm px-4 py-3' : 'rounded-2xl rounded-tl-sm px-4 py-3';
    }
  })();

  const bubbleBg = (() => {
    if (chatBubbleStyle === 'minimal') {
      return isUser
        ? { borderBottomWidth: 2, borderBottomColor: accentColor }
        : { borderBottomWidth: 1, borderBottomColor: '#3f3f46' };
    }
    return isUser ? { backgroundColor: accentColor } : { backgroundColor: '#27272a' };
  })();

  return (
    <Animated.View
      entering={entering}
      className={`w-full flex-row my-1.5 px-4 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <View className={`max-w-[80%] ${bubbleClasses}`} style={bubbleBg}>
        <Text style={{ color: '#fff', fontSize: textSize, lineHeight: textSize * 1.5 }}>
          {message.content}
        </Text>
      </View>
    </Animated.View>
  );
}

// Only re-render when the message content changes (i.e. during streaming chunks)
export const MessageBubble = React.memo(MessageBubbleInner,
  (prev, next) => prev.message.content === next.message.content,
);
