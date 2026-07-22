import React, { useEffect, useState } from 'react';
import { View, Pressable, Keyboard, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { PencilSimpleLine } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { tap } from '../../lib/haptics';
import { useTutorialTarget } from '../../hooks/useTutorialTarget';

/**
 * Floating compose button — single canonical creation entry point for v1.
 *
 * Replaces the dropped `evolutions` tab and the old `+` header button on
 * Home. Sits bottom-right above the floating tab bar so it's always within
 * thumb reach but never overlaps the active card.
 *
 * Visibility:
 *   - Hidden when the soft keyboard is open (no compose button stuck mid-feed
 *     while the user is typing somewhere else).
 *   - FadeIn/FadeOut on visibility transitions so it doesn't pop.
 *
 * Render pattern:
 *   - Outer View owns visual treatment (bg, shadow, border-radius).
 *   - Inner Pressable owns press handling only.
 *   - Avoids the Release-build quirk where Pressable.style as a function
 *     drops layout properties.
 */
export function ComposeFAB() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const target = useTutorialTarget('compose-fab');

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (keyboardOpen) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        right: 22,
        // The floating tab bar sits ~70pt above the home indicator. Stack
        // the FAB above it with enough clearance.
        bottom: insets.bottom + 88,
        zIndex: 50,
      }}
    >
      <View
        ref={target.ref}
        onLayout={target.onLayout}
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.surface,
          shadowColor: '#000',
          shadowOpacity: colors.isDark ? 0.18 : 0.10,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 5 },
          elevation: 3,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        }}
      >
        <Pressable
          onPress={() => {
            tap('medium');
            router.push('/create-post');
          }}
          accessibilityRole="button"
          accessibilityLabel="Compose new echo"
          style={{
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 24,
          }}
        >
          <PencilSimpleLine color={colors.accent} size={22} weight="bold" />
        </Pressable>
      </View>
    </Animated.View>
  );
}
