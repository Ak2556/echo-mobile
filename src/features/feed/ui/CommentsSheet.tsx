import React, { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'phosphor-react-native';
import { CommentsPanel } from './CommentsPanel';
import { useTheme } from '../../../shared/lib/theme';
import { ttx } from '../../../shared/lib/i18n';

interface Props {
  visible: boolean;
  echoId: string | undefined;
  onClose: () => void;
}

/**
 * Comments over the video, the way every other short-video feed does it.
 *
 * The Flow comment button used to push /thread/[id] — a hub screen offering
 * Comments, Add perspective, Quote and Message author. That is two taps to read
 * a reply, and it replaces the video instead of sitting over it.
 *
 * The sheet covers the lower portion of the screen so the video keeps playing
 * behind it, and the list is the same CommentsPanel the full-screen route uses.
 *
 * Height is fixed rather than draggable: a drag-to-resize sheet needs a gesture
 * that competes with the list's own scroll, and getting that wrong is worse
 * than not having it. The grabber is decorative and labelled as such.
 */
export function CommentsSheet({ visible, echoId, onClose }: Props) {
  const { colors, reduceAnimations, font } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [count, setCount] = useState<number | null>(null);

  if (!visible) return null;

  // Tall enough to read a conversation, short enough to keep the video visible.
  const sheetHeight = Math.round(height * 0.72);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View
        entering={reduceAnimations ? undefined : FadeIn.duration(160)}
        exiting={reduceAnimations ? undefined : FadeOut.duration(120)}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
      >
        {/* Tapping the video above the sheet closes it. */}
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={ttx("Close comments")} />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      >
        <Animated.View
          entering={reduceAnimations ? undefined : SlideInDown.duration(230)}
          exiting={reduceAnimations ? undefined : SlideOutDown.duration(170)}
          style={{
            height: sheetHeight,
            backgroundColor: colors.bg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            overflow: 'hidden',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border }}
            />
          </View>

          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 10,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
          }}>
            <Text style={[font.display, { color: colors.text, fontSize: 17, letterSpacing: -0.2 }]}>
              {ttx("Comments")}
            </Text>
            {count !== null && (
              <Text style={{ color: colors.textMuted, fontSize: 14, marginLeft: 8 }}>{count}</Text>
            )}
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={{ padding: 6, borderRadius: 999, backgroundColor: colors.surface }}
              accessibilityRole="button"
              accessibilityLabel={ttx("Close comments")}
            >
              <X color={colors.textSecondary} size={16} weight="bold" />
            </Pressable>
          </View>

          <CommentsPanel
            echoId={echoId}
            bottomInset={insets.bottom}
            onCountChange={setCount}
          />
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
