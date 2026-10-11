import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../lib/ui/theme';
import { useResponsiveLayout } from '../../lib/ui/responsive';

interface TabHeaderProps {
  title: string;
  subtitle?: string;
  /** Controls at the right edge of the title row (the header "+", action buttons). */
  right?: React.ReactNode;
  /** Space under the title block; the caller's search field or content sits below it. */
  marginBottom?: number;
}

/**
 * The title block at the top of a tab that is a page, not a feed: the same display type,
 * line height and subtitle on every one. The caller supplies the horizontal gutter, so it
 * stays on `layout.gutter` with whatever sits beside and below it.
 */
export function TabHeader({ title, subtitle, right, marginBottom = 0 }: TabHeaderProps) {
  const { colors, font } = useTheme();
  const layout = useResponsiveLayout();
  const size = layout.isPhone ? 34 : 40;
  const line = layout.isPhone ? 38 : 44;

  return (
    <View style={{ marginBottom }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Text
          numberOfLines={1}
          style={[font.displayBlack, { flex: 1, minWidth: 0, color: colors.text, fontSize: size, lineHeight: line, letterSpacing: -0.5 }]}
        >
          {title}
        </Text>
        {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{right}</View> : null}
      </View>
      {subtitle ? <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 2 }}>{subtitle}</Text> : null}
    </View>
  );
}
