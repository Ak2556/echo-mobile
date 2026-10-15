import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/ui/theme';
import { SHADOW } from '../../lib/ui/fixedColors';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * `docked`: a card on the surface colour with a grabber, flush with the bottom edge, for
   * forms. `floating`: no card of its own, inset from the edges, for content that draws its
   * own glass (action lists, the edit-message box).
   */
  variant?: 'docked' | 'floating';
  /** Scrolls the content and keeps it above the keyboard. Docked sheets with inputs. */
  form?: boolean;
}

/** The scrim behind every sheet. Not lighter than this: glass over a busy feed is unreadable. */
const SCRIM = 'rgba(0,0,0,0.55)';

/**
 * The one sheet shell: a Modal with a fading scrim (tap to close), a slide up from the
 * bottom, the safe area, and the Android back button. Sheets differ in what is inside them,
 * not in how they arrive, so Tasks, Shopping List, Habits, the action lists and the
 * edit-message box all come through here.
 */
export function BottomSheet({ visible, onClose, children, variant = 'docked', form = false }: BottomSheetProps) {
  const { colors, radius, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();

  // No Modal portal while closed.
  if (!visible) return null;

  const body = variant === 'floating' ? (
    <View style={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 12 }}>{children}</View>
  ) : (
    <View
      style={{
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: insets.bottom + 16,
        maxHeight: '90%',
        shadowColor: SHADOW,
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 20,
      }}
    >
      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 }} />
      {form ? (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView>
      ) : children}
    </View>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View
        entering={reduceAnimations ? undefined : FadeIn.duration(160)}
        exiting={reduceAnimations ? undefined : FadeOut.duration(120)}
        style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM }]}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' }}
      >
        <Animated.View
          entering={reduceAnimations ? undefined : SlideInDown.duration(220)}
          exiting={reduceAnimations ? undefined : SlideOutDown.duration(160)}
        >
          {body}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
