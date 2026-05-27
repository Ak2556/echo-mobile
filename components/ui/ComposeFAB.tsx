import React, { useEffect, useState } from 'react';
import { View, Pressable, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Plus } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { tap } from '../../lib/haptics';

/**
 * Floating compose button — single canonical creation entry point for v1.
 *
 * Replaces the dropped `evolutions` tab and the old `+` header button on
 * Home. Sits bottom-right above the floating tab bar so it's always within
 * thumb reach but never overlaps the active card.
 *
 * Visibility:
 *   • Hidden when the soft keyboard is open (no compose button stuck mid-feed
 *     while the user is typing somewhere else).
 *   • FadeIn/FadeOut on visibility transitions so it doesn't pop.
 *
 * Render pattern:
 *   • Outer View owns visual treatment (bg, shadow, border-radius).
 *   • Inner Pressable owns press handling only.
 *   • Avoids the Release-build quirk where Pressable.style as a function
 *     drops layout properties.
 */
export function ComposeFAB() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

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
        right: 20,
        // The floating tab bar sits ~70pt above the home indicator. Stack
        // the FAB above it with breathing room.
        bottom: insets.bottom + 90,
        zIndex: 50,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.accent,
          shadowColor: colors.accent,
          shadowOpacity: 0.55,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 6,
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
            borderRadius: 28,
          }}
        >
          <Plus color="#fff" size={26} weight="bold" />
        </Pressable>
      </View>
    </Animated.View>
  );
}
