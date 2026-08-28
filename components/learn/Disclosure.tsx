import React, { useState } from 'react';
import { View, Text, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { CaretDown, CaretRight } from 'phosphor-react-native';
import { useTheme } from '../../src/shared/lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * A secondary section, collapsed until asked for.
 *
 * Learn had eleven top-level tabs — eight with teacher tools switched off —
 * and every one of them opened on a wall of panels. The features were fine;
 * finding one meant reading the whole row of chips and guessing.
 *
 * Grouping them into four tabs only helps if a tab does not then become a very
 * long scroll, so everything secondary sits behind one of these: a single line
 * that says what it holds and how much is in it. The tab opens on one thing,
 * and the rest is one tap and clearly labelled, rather than absent or buried.
 */
export function Disclosure({
  title,
  meta,
  children,
  defaultOpen = false,
}: {
  title: string;
  /** A count or short status — "12 cards", "3 this week". Shown on the row. */
  meta?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const { colors, font, radius } = useTheme();
  const [open, setOpen] = useState(defaultOpen);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(v => !v);
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={meta ? `${title}, ${meta}` : title}
        // Layout stays on the inner View: box styles on a Pressable collapse in
        // Release builds (see components/ui/AnimatedPressable partitionStyle).
        style={{ borderRadius: radius.card }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: radius.card,
            backgroundColor: colors.surface,
          }}
        >
          {open
            ? <CaretDown size={16} weight="bold" color={colors.textMuted} />
            : <CaretRight size={16} weight="bold" color={colors.textMuted} />}
          <Text style={[font.bodyBold, { color: colors.text, fontSize: 14, flex: 1 }]}>{title}</Text>
          {!!meta && (
            <Text style={[font.body, { color: colors.textMuted, fontSize: 12 }]}>{meta}</Text>
          )}
        </View>
      </Pressable>

      {open && <View style={{ marginTop: 12 }}>{children}</View>}
    </View>
  );
}
