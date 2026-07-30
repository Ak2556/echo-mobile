import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../lib/theme';

export interface ConnectionAction {
  key: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  onPress: () => void;
  emphasis?: 'primary' | 'neutral';
}

interface ConnectionPanelProps {
  title?: string;
  subtitle?: string;
  actions: ConnectionAction[];
}

export function ConnectionPanel({ title, subtitle, actions }: ConnectionPanelProps) {
  const { colors, radius, font } = useTheme();

  if (actions.length === 0) return null;

  return (
    <View>
      {title ? (
        <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text style={[font.body, { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 }]}>
          {subtitle}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: title ? 14 : 0 }}>
        {actions.map(action => {
          const primary = action.emphasis === 'primary';
          // The wrapper View owns the flex sizing and card styling; the
          // Pressable stays bare. NativeWind's cssInterop strips box/layout
          // props off a Pressable's own style (worst on touchables), which
          // otherwise collapses these into bare left-aligned icon+label.
          return (
            <View key={action.key} style={{ flexGrow: 1, flexBasis: 148 }}>
              <Pressable
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <View
                  style={{
                    minHeight: 58,
                    borderRadius: radius.lg,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    backgroundColor: primary ? colors.accent : colors.bg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: primary ? colors.accent : colors.border,
                  }}
                >
                  {action.icon ? (
                    <View style={{ opacity: primary ? 1 : 0.9 }}>
                      {action.icon}
                    </View>
                  ) : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[font.bodySemibold, { color: primary ? '#fff' : colors.text, fontSize: 13 }]}
                      numberOfLines={1}
                    >
                      {action.label}
                    </Text>
                    {action.description ? (
                      <Text
                        style={[font.body, { color: primary ? 'rgba(255,255,255,0.78)' : colors.textMuted, fontSize: 12, lineHeight: 16, marginTop: 2 }]}
                        numberOfLines={2}
                      >
                        {action.description}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
