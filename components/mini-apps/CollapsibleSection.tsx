import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { CaretDown, CaretUp } from 'phosphor-react-native';
import { useTheme } from '../../lib/ui/theme';

interface CollapsibleSectionProps {
  title: string;
  /** One line shown beside the title while closed, so closing it does not hide what is in it. */
  summary?: string;
  open: boolean;
  onToggle: () => void;
  /** A control that belongs to the section (for example "+ Log"), kept outside the toggle. */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A section that shows its title and a one-line summary, and opens to its content.
 *
 * The toggle is a plain Pressable on purpose. AnimatedPressable splits `flex` away
 * from the row layout, and a flex column inside it rendered at zero width (see
 * app/follow-requests.tsx). `action` sits beside the toggle rather than inside it so
 * there is never a button within a button.
 */
export function CollapsibleSection({ title, summary, open, onToggle, action, children }: CollapsibleSectionProps) {
  const { colors, font } = useTheme();
  const Caret = open ? CaretUp : CaretDown;
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={summary ? `${title}. ${summary}` : title}
          style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}
        >
          <Text style={[font.eyebrow, { color: colors.textMuted }]}>{title}</Text>
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.textMuted, fontSize: 12.5, textAlign: 'right' }}>
            {open ? '' : summary ?? ''}
          </Text>
          <Caret color={colors.textMuted} size={16} weight="bold" />
        </Pressable>
        {action}
      </View>
      {/* The bottom margin is what keeps an open section from touching whatever follows it. */}
      {open ? <View style={{ marginTop: 2, marginBottom: 12 }}>{children}</View> : null}
    </View>
  );
}
