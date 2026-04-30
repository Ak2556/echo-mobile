import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface MessageBubbleProps {
  message: Message;
}

const FONT_SIZES = { small: 14, medium: 16, large: 18 };

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const { chatBubbleStyle, fontSize, reduceAnimations, accentColor } = useAppStore();
  const { colors } = useTheme();

  const textSize = FONT_SIZES[fontSize];
  const entering = FadeIn.duration(reduceAnimations ? 0 : 60);

  const borderRadius = (() => {
    switch (chatBubbleStyle) {
      case 'classic':
        return { borderRadius: 12 };
      case 'minimal':
        return {};
      default:
        return isUser
          ? { borderRadius: 20, borderTopRightRadius: 4 }
          : { borderRadius: 20, borderTopLeftRadius: 4 };
    }
  })();

  const padding = { paddingHorizontal: 16, paddingVertical: 12 };
  const textColor = isUser ? '#fff' : colors.text;

  // User bubble — accent colored, always solid
  if (isUser) {
    const minimalStyle = chatBubbleStyle === 'minimal'
      ? { borderBottomWidth: 2, borderBottomColor: accentColor }
      : { backgroundColor: accentColor };

    return (
      <Animated.View
        entering={entering}
        style={{ width: '100%', flexDirection: 'row', justifyContent: 'flex-end', marginVertical: 6, paddingHorizontal: 16 }}
      >
        <View style={[{ maxWidth: '80%' }, borderRadius, padding, minimalStyle]}>
          <Text style={{ color: textColor, fontSize: textSize, lineHeight: textSize * 1.5 }}>
            {message.content}
          </Text>
        </View>
      </Animated.View>
    );
  }

  // Assistant bubble — frosted glass on iOS
  const minimalStyle = chatBubbleStyle === 'minimal'
    ? { borderBottomWidth: 1, borderBottomColor: colors.glassBorder }
    : {};

  if (Platform.OS === 'ios' && !reduceAnimations && chatBubbleStyle !== 'minimal') {
    return (
      <Animated.View
        entering={entering}
        style={{ width: '100%', flexDirection: 'row', justifyContent: 'flex-start', marginVertical: 6, paddingHorizontal: 16 }}
      >
        <View
          style={[
            { maxWidth: '80%', overflow: 'hidden' },
            borderRadius,
            {
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.glassBorder,
            },
          ]}
        >
          <BlurView
            intensity={40}
            tint={colors.isDark ? 'dark' : 'extraLight'}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]}
          />
          {/* Top shine edge */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: colors.glassHighlight,
            }}
          />
          <View style={padding}>
            <Text style={{ color: textColor, fontSize: textSize, lineHeight: textSize * 1.5 }}>
              {message.content}
            </Text>
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={entering}
      style={{ width: '100%', flexDirection: 'row', justifyContent: 'flex-start', marginVertical: 6, paddingHorizontal: 16 }}
    >
      <View
        style={[
          { maxWidth: '80%', backgroundColor: colors.surface },
          borderRadius,
          padding,
          minimalStyle,
          { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        ]}
      >
        <Text style={{ color: textColor, fontSize: textSize, lineHeight: textSize * 1.5 }}>
          {message.content}
        </Text>
      </View>
    </Animated.View>
  );
}
