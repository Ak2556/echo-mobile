import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, X } from 'phosphor-react-native';
import { IconButton } from './IconButton';
import { useTheme } from '../../src/shared/lib/theme';
import { safeBack } from '../../lib/safeBack';

interface ScreenHeaderProps {
  title?: string;
  /** Optional second line under the title (muted). */
  subtitle?: string;
  /** Left affordance: back arrow (detail screens), close X (modals), or none. */
  leading?: 'back' | 'close' | 'none';
  /** Override the default back/close action (safeBack). */
  onLeading?: () => void;
  /** Optional right-side content (a single action — keep it to one). */
  right?: React.ReactNode;
  /**
   * Hairline bottom border. Default false.
   *
   * A rule under every header is the loudest piece of chrome in the app and it
   * carries no information — the title already marks where the screen begins.
   * Screens that genuinely need the separation (a header pinned over scrolling
   * content that would otherwise collide with it) opt back in.
   */
  border?: boolean;
  /** Add the top safe-area inset (for screens that aren't wrapped in a
   *  SafeAreaView with top edge). Default false. */
  safeTop?: boolean;
}

/**
 * The one screen header for detail/modal screens — a consistent back/close
 * button (via the shared IconButton), a left-aligned title, and one optional
 * right action. Replaces the ~8 hand-rolled header rows scattered across the
 * app so back/title styling is identical everywhere.
 *
 * Renders just the row: the parent still owns its SafeAreaView(edges top).
 */
export function ScreenHeader({ title, subtitle, leading = 'back', onLeading, right, border = false, safeTop = false }: ScreenHeaderProps) {
  const { colors, font } = useTheme();
  const insets = useSafeAreaInsets();
  const handleLeading = onLeading ?? (() => safeBack());

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingTop: 8 + (safeTop ? insets.top : 0),
        paddingBottom: 8,
        minHeight: 56,
        borderBottomWidth: border ? StyleSheet.hairlineWidth : 0,
        borderBottomColor: colors.border,
      }}
    >
      {leading !== 'none' ? (
        <IconButton
          icon={leading === 'close' ? X : ArrowLeft}
          label={leading === 'close' ? 'Close' : 'Back'}
          onPress={handleLeading}
          size="lg"
          // 44 is Apple's minimum. The primitive defaults to 40, and back is the
          // one control on these screens that must never be missed.
          hitSize={44}
        />
      ) : (
        <View style={{ width: 8 }} />
      )}

      {title ? (
        <View style={{ flex: 1, marginLeft: 2 }}>
          {/* Set from the theme's display face rather than a hardcoded weight,
              so it follows the user's font preference and matches the masthead
              treatment on home. Larger and optically tracked-in: with the rule
              gone, the title itself has to mark the top of the screen. */}
          <Text
            numberOfLines={1}
            style={[font.displayBlack, { color: colors.text, fontSize: 24, letterSpacing: -0.7 }]}
            maxFontSizeMultiplier={1.2}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2 }}
              maxFontSizeMultiplier={1.2}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      {right ?? null}
    </View>
  );
}
