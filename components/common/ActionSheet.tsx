import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { tap } from '../../lib/haptics';

export interface ActionItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  actions: ActionItem[];
}

export function ActionSheet({ visible, onClose, title, subtitle, actions }: ActionSheetProps) {
  const { colors, reduceAnimations, font } = useTheme();
  const insets = useSafeAreaInsets();

  // Don't keep a Modal portal mounted when invisible. RN keeps the portal in
  // the view hierarchy even with `visible={false}` — across a feed of cards,
  // that's hundreds of dead portals taking up the bridge.
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        entering={reduceAnimations ? undefined : FadeIn.duration(160)}
        exiting={reduceAnimations ? undefined : FadeOut.duration(120)}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View
        entering={reduceAnimations ? undefined : SlideInDown.duration(220)}
        exiting={reduceAnimations ? undefined : SlideOutDown.duration(160)}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 12,
          paddingBottom: insets.bottom + 12,
        }}
      >
        <View
          style={{
            borderRadius: 22,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glassBorder,
            backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.surface,
          }}
        >
          {Platform.OS === 'ios' && (
            <BlurView
              intensity={70}
              tint={colors.isDark ? 'dark' : 'extraLight'}
              style={StyleSheet.absoluteFill}
            />
          )}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
          {(title || subtitle) && (
            <View style={{ paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              {title && <Text style={[font.bodyBold, { color: colors.textMuted, fontSize: 12, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 }]}>{title}</Text>}
              {subtitle && <Text style={[font.body, { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 }]}>{subtitle}</Text>}
            </View>
          )}
          {actions.map((a, i) => (
            <Pressable
              key={a.key}
              disabled={a.disabled}
              onPress={() => {
                tap('light');
                a.onPress();
                onClose();
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 18,
                paddingVertical: 14,
                opacity: a.disabled ? 0.5 : pressed ? 0.6 : 1,
                borderTopWidth: i === 0 && !title && !subtitle ? 0 : StyleSheet.hairlineWidth,
                borderTopColor: colors.glassBorder,
              })}
            >
              {a.icon}
              <Text
                style={[
                  font.bodyMedium,
                  {
                    color: a.destructive ? '#ef4444' : colors.text,
                    fontSize: 15,
                    flex: 1,
                  },
                ]}
              >
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={onClose}
          style={{
            marginTop: 8,
            borderRadius: 18,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glassBorder,
            backgroundColor: colors.surface,
            paddingVertical: 14,
            alignItems: 'center',
          }}
        >
          <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>Cancel</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}
