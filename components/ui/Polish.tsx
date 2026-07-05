import React from 'react';
import { Pressable, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../../lib/theme';

export function SectionTitle({ title, caption, right }: { title: string; caption?: string; right?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase' }}>{title}</Text>
        {caption ? <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>{caption}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Pill({
  label,
  active,
  onPress,
  icon,
  style,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  // Layout lives on the inner View — pressable wrappers drop layout props
  // through the NativeWind interop.
  return (
    <Pressable onPress={onPress}>
      <View
        style={[
          {
            alignItems: 'center',
            backgroundColor: active ? colors.accent : colors.surfaceHover,
            borderRadius: 999,
            flexDirection: 'row',
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 8,
          },
          style,
        ]}
      >
        {icon}
        <Text style={{ color: active ? '#fff' : colors.textSecondary, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function EmptyState({ title, caption }: { title: string; caption?: string }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 22, paddingHorizontal: 18 }}>
      <Text style={[font.display, { color: colors.text, fontSize: 17 }]}>{title}</Text>
      {caption ? <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' }}>{caption}</Text> : null}
    </View>
  );
}
