import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
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

/**
 * iOS-style action sheet — opaque surface card stacked above a separate
 * Cancel button. Backdrop dims the page behind.
 *
 * Earlier this used a BlurView + 4% white fill, which on a busy feed
 * read as half-transparent and made the title invisible and the underlying
 * post visible through the sheet. Solid surface fills it.
 */
export function ActionSheet({ visible, onClose, title, subtitle, actions }: ActionSheetProps) {
  const { colors, reduceAnimations, font } = useTheme();
  const insets = useSafeAreaInsets();

  // Don't keep a Modal portal mounted when invisible.
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        entering={reduceAnimations ? undefined : FadeIn.duration(160)}
        exiting={reduceAnimations ? undefined : FadeOut.duration(120)}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
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
        {/* Action card — opaque surface */}
        <View
          style={{
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: colors.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
          }}
        >
          {(title || subtitle) && (
            <View
              style={{
                paddingHorizontal: 18,
                paddingVertical: 14,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
                backgroundColor: colors.bgPure ? colors.bgPure : colors.bg,
              }}
            >
              {title && (
                <Text
                  style={[font.bodyBold, {
                    color: colors.text,
                    fontSize: 13,
                    textAlign: 'center',
                    letterSpacing: 0.3,
                  }]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
              )}
              {subtitle && (
                <Text
                  style={[font.body, {
                    color: colors.textSecondary,
                    fontSize: 12,
                    textAlign: 'center',
                    marginTop: 3,
                  }]}
                  numberOfLines={2}
                >
                  {subtitle}
                </Text>
              )}
            </View>
          )}

          {actions.map((a, i) => (
            // Outer View owns the visual treatment (flex row + padding +
            // top border). Pressable inside owns just press handling.
            // Earlier we had `style={({pressed}) => ({...})}` on the Pressable
            // and RN silently dropped the layout properties in Release, so
            // icons stacked above labels and rows lost their row direction.
            <View
              key={a.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingHorizontal: 18,
                borderTopWidth: i === 0 && !title && !subtitle ? 0 : StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
              }}
            >
              <Pressable
                disabled={a.disabled}
                onPress={() => {
                  tap('light');
                  a.onPress();
                  onClose();
                }}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingVertical: 16,
                  opacity: a.disabled ? 0.45 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                accessibilityState={{ disabled: !!a.disabled }}
              >
                {a.icon ? (
                  <View style={{ width: 22, alignItems: 'center', justifyContent: 'center' }}>
                    {a.icon}
                  </View>
                ) : null}
                <Text
                  style={[
                    font.bodyMedium,
                    {
                      color: a.destructive ? colors.danger : colors.text,
                      fontSize: 16,
                      flex: 1,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {a.label}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        {/* Cancel — separate pill, also opaque */}
        <View style={{
          marginTop: 10,
          borderRadius: 16,
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        }}>
          <Pressable
            onPress={() => { tap('light'); onClose(); }}
            style={{ paddingVertical: 16, alignItems: 'center' }}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 16 }]}>Cancel</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}
