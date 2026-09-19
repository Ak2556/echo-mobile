import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../src/shared/lib/theme';

/**
 * The Echo lockup: the mark from the app icon, then the name.
 *
 * The header used to set the word "Echo" in the display face and nothing else,
 * so the one place a brand is always visible carried no brand at all.
 *
 * The mark is the glyph only, with the dot drawn here rather than baked into
 * the image, and that split is the point. The app ships nine themes, four of
 * them light, and the icon's `e` is cream — on Light or Nord Light it would sit
 * invisible against the background. Tinting a single flat PNG would fix that
 * and flatten the orange dot with it. Separated, the glyph follows colors.text
 * and the dot follows colors.accent, so the lockup reads correctly on every
 * theme and picks up the user's Accent Color as a bonus.
 *
 * The proportions are measured from the source art rather than guessed: in the
 * 1024px icon the glyph is 190x204, the dot is 69px across and the gap is 50px,
 * and both sit on the same baseline. Expressed as ratios of the glyph height so
 * the lockup holds its shape at any size.
 */

/** Dot diameter, as a fraction of the glyph's height. */
const DOT_RATIO = 69 / 204;
/** Space between glyph and dot, same basis. */
const GAP_RATIO = 50 / 204;
/** The glyph's own aspect, so width follows height without distortion. */
const GLYPH_ASPECT = 190 / 204;

export function EchoWordmark({ height = 26 }: { height?: number }) {
  const { colors } = useTheme();

  const dot = Math.round(height * DOT_RATIO);
  const gap = Math.round(height * GAP_RATIO);
  const glyphWidth = Math.round(height * GLYPH_ASPECT);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Echo"
      // flex-end: glyph and dot share a baseline in the source art, and the dot
      // is the thing that makes the mark read as a full stop rather than a
      // floating circle.
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap }}
    >
      <Image
        source={require('../../assets/images/echo-mark.png')}
        style={{ width: glyphWidth, height }}
        contentFit="contain"
        // The glyph is cream in the source; this is what makes it legible on
        // the four light themes.
        tintColor={colors.text}
        cachePolicy="memory-disk"
      />
      <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: colors.accent }} />
    </View>
  );
}
