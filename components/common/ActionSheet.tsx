import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GlassPanel } from '../ui/GlassPanel';
import { BottomSheet } from './BottomSheet';
import { SHADOW } from '../../lib/ui/fixedColors';
import { useTheme } from '../../lib/ui/theme';
import { tap } from '../../lib/ui/haptics';
import { ttx } from '../../lib/i18n/i18n';

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
 * iOS-style action sheet — glass card stacked above a separate Cancel
 * button. Backdrop dims the page behind.
 *
 * Legibility note: an early glass version used only a 4% white fill and
 * was unreadable over busy feeds. The current recipe stacks the 55% black
 * backdrop + blur(60) + a 62% bg fill, which keeps text solid while still
 * reading as glass. Don't reduce the fill below ~0.55.
 */
export function ActionSheet({ visible, onClose, title, subtitle, actions }: ActionSheetProps) {
  const { colors, font } = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} variant="floating">
        {/* Action card — glass sheet over the dimmed content */}
        <GlassPanel
          overlay
          borderRadius={22}
          style={{
            shadowColor: SHADOW,
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
        </GlassPanel>

        {/* Cancel — separate glass pill */}
        <GlassPanel
          overlay
          borderRadius={18}
          style={{
            marginTop: 10,
            shadowColor: SHADOW,
            shadowOpacity: 0.25,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
          }}
        >
          <Pressable
            onPress={() => { tap('light'); onClose(); }}
            style={{ paddingVertical: 16, alignItems: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={ttx("Cancel")}
          >
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 16 }]}>{ttx("Cancel")}</Text>
          </Pressable>
        </GlassPanel>
    </BottomSheet>
  );
}
