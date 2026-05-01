import React from 'react';
import { Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from './AnimatedPressable';

export function SectionTitle({ title, caption, right }: { title: string; caption?: string; right?: React.ReactNode }) {
  const { colors, fontSizes } = useTheme();
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: fontSizes.title, fontWeight: '800' }}>{title}</Text>
        {caption ? <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 2 }}>{caption}</Text> : null}
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
  const { colors, radius, fontSizes } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      depth="soft"
      fadeOnPress
      style={[
        {
          alignItems: 'center',
          backgroundColor: active ? colors.accent : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
          borderColor: active ? colors.accent : colors.glassBorder,
          borderRadius: radius.full,
          borderWidth: 1,
          flexDirection: 'row',
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 7,
        },
        style,
      ]}
    >
      {icon}
      <Text style={{ color: active ? '#fff' : colors.textMuted, fontSize: fontSizes.caption, fontWeight: '700' }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export function EmptyState({ title, caption }: { title: string; caption?: string }) {
  const { colors, fontSizes, radius } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        borderColor: colors.glassBorder,
        borderRadius: radius.card,
        borderWidth: 1,
        padding: 18,
      }}
    >
      <Text style={{ color: colors.text, fontSize: fontSizes.body, fontWeight: '800' }}>{title}</Text>
      {caption ? <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 4, textAlign: 'center' }}>{caption}</Text> : null}
    </View>
  );
}
