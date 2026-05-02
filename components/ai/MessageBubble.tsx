import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, Share } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { ActionSheet, ActionItem } from '../common/ActionSheet';
import { tap } from '../../lib/haptics';

async function copyToClipboard(text: string) {
  try {
    // Web
    if (typeof navigator !== 'undefined' && (navigator as any)?.clipboard?.writeText) {
      await (navigator as any).clipboard.writeText(text);
      return;
    }
  } catch {}
  // Native fallback — share sheet so the user can copy from there.
  try { await Share.share({ message: text }); } catch {}
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface MessageBubbleProps {
  message: Message;
  onCopy?: (m: Message) => void;
  onEdit?: (m: Message) => void;
  onRegenerate?: (m: Message) => void;
  onBranch?: (m: Message) => void;
}

const FONT_SIZES = { small: 14, medium: 16, large: 18 };

export function MessageBubble({ message, onCopy, onEdit, onRegenerate, onBranch }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const { chatBubbleStyle, fontSize, reduceAnimations, accentColor, fontScale } = useAppStore();
  const { colors } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  const baseSize = FONT_SIZES[fontSize];
  const textSize = Math.round(baseSize * (fontScale ?? 1));
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

  const handleLongPress = () => {
    if (message.id === 'welcome') return;
    tap('medium');
    setSheetOpen(true);
  };

  const actions: ActionItem[] = [
    {
      key: 'copy',
      label: 'Copy',
      onPress: async () => {
        await copyToClipboard(message.content);
        onCopy?.(message);
      },
    },
    isUser
      ? { key: 'edit', label: 'Edit & resend', disabled: !onEdit, onPress: () => onEdit?.(message) }
      : { key: 'regen', label: 'Regenerate', disabled: !onRegenerate, onPress: () => onRegenerate?.(message) },
    { key: 'branch', label: 'Branch from here', disabled: !onBranch, onPress: () => onBranch?.(message) },
  ];

  // User bubble — accent colored, always solid
  if (isUser) {
    const minimalStyle = chatBubbleStyle === 'minimal'
      ? { borderBottomWidth: 2, borderBottomColor: accentColor }
      : { backgroundColor: accentColor };

    return (
      <>
        <Animated.View
          entering={entering}
          style={{ width: '100%', flexDirection: 'row', justifyContent: 'flex-end', marginVertical: 6, paddingHorizontal: 16 }}
        >
          <Pressable onLongPress={handleLongPress} style={[{ maxWidth: '80%' }, borderRadius, padding, minimalStyle]}>
            <Text style={{ color: textColor, fontSize: textSize, lineHeight: textSize * 1.5 }}>
              {message.content}
            </Text>
          </Pressable>
        </Animated.View>
        <ActionSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} actions={actions} />
      </>
    );
  }

  // Assistant bubble — frosted glass on iOS
  const minimalStyle = chatBubbleStyle === 'minimal'
    ? { borderBottomWidth: 1, borderBottomColor: colors.glassBorder }
    : {};

  if (Platform.OS === 'ios' && !reduceAnimations && chatBubbleStyle !== 'minimal') {
    return (
      <>
        <Animated.View
          entering={entering}
          style={{ width: '100%', flexDirection: 'row', justifyContent: 'flex-start', marginVertical: 6, paddingHorizontal: 16 }}
        >
          <Pressable
            onLongPress={handleLongPress}
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
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
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
          </Pressable>
        </Animated.View>
        <ActionSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} actions={actions} />
      </>
    );
  }

  return (
    <>
      <Animated.View
        entering={entering}
        style={{ width: '100%', flexDirection: 'row', justifyContent: 'flex-start', marginVertical: 6, paddingHorizontal: 16 }}
      >
        <Pressable
          onLongPress={handleLongPress}
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
        </Pressable>
      </Animated.View>
      <ActionSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} actions={actions} />
    </>
  );
}
