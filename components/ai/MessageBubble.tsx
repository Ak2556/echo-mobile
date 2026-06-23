import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, Share } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import Markdown from 'react-native-markdown-display';
import { Copy } from 'phosphor-react-native';
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
  /** When true, renders plain text with blinking cursor instead of Markdown — faster during streaming. */
  isStreaming?: boolean;
  onCopy?: (m: Message) => void;
  onEdit?: (m: Message) => void;
  onRegenerate?: (m: Message) => void;
  onBranch?: (m: Message) => void;
}

const FONT_SIZES = { small: 14, medium: 16, large: 18 };
const MAX_MARKDOWN_RENDER_CHARS = 12000;

function buildMarkdownStyles(colors: any, textSize: number) {
  return StyleSheet.create({
    body: { color: colors.text, fontSize: textSize, lineHeight: textSize * 1.55 },
    heading1: { color: colors.text, fontSize: textSize * 1.25, fontWeight: '700' as const, marginBottom: 6, marginTop: 4 },
    heading2: { color: colors.text, fontSize: textSize * 1.1, fontWeight: '700' as const, marginBottom: 4, marginTop: 4 },
    heading3: { color: colors.text, fontSize: textSize, fontWeight: '700' as const, marginBottom: 4 },
    bullet_list: { marginBottom: 4 },
    ordered_list: { marginBottom: 4 },
    list_item: { color: colors.text, fontSize: textSize, lineHeight: textSize * 1.5 },
    code_inline: {
      color: colors.accent,
      backgroundColor: colors.surfaceHover,
      borderRadius: 4,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: textSize * 0.88,
    },
    fence: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 10,
      paddingRight: 36,
      marginVertical: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    code_block: { color: colors.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: textSize * 0.88 },
    blockquote: { borderLeftColor: colors.accent, borderLeftWidth: 3, paddingLeft: 10, marginLeft: 0, opacity: 0.8, marginVertical: 4 },
    link: { color: colors.accent },
    strong: { fontWeight: '700' as const },
    paragraph: { marginTop: 0, marginBottom: 4 },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: 8 },
  });
}

export function MessageBubble({ message, isStreaming, onCopy, onEdit, onRegenerate, onBranch }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const { chatBubbleStyle, fontSize, reduceAnimations, accentColor, fontScale } = useAppStore();
  const { colors } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Blinking cursor during streaming
  const [cursorOn, setCursorOn] = useState(true);
  useEffect(() => {
    if (!isStreaming || isUser) return;
    const timer = setInterval(() => setCursorOn(v => !v), 530);
    return () => clearInterval(timer);
  }, [isStreaming, isUser]);

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

  // Code block copy button — injected via custom Markdown rules
  const markdownRules = {
    fence: (node: any) => {
      const code: string = node.content ?? '';
      return (
        <View
          key={node.key}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 8,
            padding: 10,
            marginVertical: 6,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
          }}
        >
          <Text
            selectable
            style={{
              color: colors.text,
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              fontSize: textSize * 0.88,
              lineHeight: textSize * 1.4,
            }}
          >
            {code.trimEnd()}
          </Text>
          <Pressable
            onPress={() => copyToClipboard(code)}
            hitSlop={8}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: colors.surfaceHover,
              borderRadius: 6,
              padding: 5,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
            }}
          >
            <Copy color={colors.textMuted} size={13} />
          </Pressable>
        </View>
      );
    },
  };

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

  // Assistant bubble content — plain text during streaming, Markdown after done
  const shouldRenderMarkdown = !isStreaming && message.content.length <= MAX_MARKDOWN_RENDER_CHARS;
  const bubbleContent = !shouldRenderMarkdown ? (
    <Text style={{ color: colors.text, fontSize: textSize, lineHeight: textSize * 1.55 }}>
      {message.content}
      {isStreaming && <Text style={{ color: colors.accent, opacity: cursorOn ? 1 : 0 }}>▌</Text>}
    </Text>
  ) : (
    <Markdown style={buildMarkdownStyles(colors, textSize)} rules={markdownRules}>
      {message.content || ' '}
    </Markdown>
  );

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
              {bubbleContent}
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
          {bubbleContent}
        </Pressable>
      </Animated.View>
      <ActionSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} actions={actions} />
    </>
  );
}
