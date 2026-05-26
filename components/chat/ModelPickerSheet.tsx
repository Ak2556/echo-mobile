import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lightning, Sparkle, Star, Check } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { tap } from '../../lib/haptics';
import type { EchoAIModel } from '../../lib/api';

interface ModelMeta {
  key: EchoAIModel;
  name: string;
  tagline: string;
  Icon: React.ComponentType<any>;
  accent: string;
}

/**
 * Each model gets a name, a one-line tagline that frames the tradeoff, and
 * a glyph. Keeps the picker feeling like a deliberate product surface
 * instead of "another action sheet with three text items."
 */
const MODELS: ModelMeta[] = [
  {
    key: 'gemini-2.5-flash',
    name: 'Flash',
    tagline: 'Fast, balanced — the default',
    Icon: Lightning,
    accent: '#FACC15', // amber — speed
  },
  {
    key: 'gemini-2.5-pro',
    name: 'Pro',
    tagline: 'Deepest thinking, slower',
    Icon: Star,
    accent: '#A78BFA', // violet — premium
  },
  {
    key: 'gemini-2.0-flash-lite',
    name: 'Lite',
    tagline: 'Light replies, fewer compute hits',
    Icon: Sparkle,
    accent: '#38BDF8', // cyan — featherweight
  },
];

interface ModelPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  selected: EchoAIModel;
  onSelect: (model: EchoAIModel) => void;
}

export function ModelPickerSheet({ visible, onClose, selected, onSelect }: ModelPickerSheetProps) {
  const { colors, reduceAnimations, font } = useTheme();
  const insets = useSafeAreaInsets();

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
        <View style={{
          borderRadius: 20,
          overflow: 'hidden',
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 14 },
        }}>
          {/* Header */}
          <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 }}>
            <Text style={[font.display, { color: colors.text, fontSize: 18, letterSpacing: -0.3 }]}>
              Pick a model
            </Text>
            <Text style={[font.body, { color: colors.textSecondary, fontSize: 13, marginTop: 4 }]}>
              All three answer the same prompt with different tradeoffs.
            </Text>
          </View>

          {/* Rows */}
          <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 6 }}>
            {MODELS.map(m => {
              const active = m.key === selected;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => {
                    tap('light');
                    onSelect(m.key);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${m.name}. ${m.tagline}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    padding: 14,
                    borderRadius: 14,
                    backgroundColor: active
                      ? colors.accentMuted
                      : pressed
                        ? colors.surfaceHover
                        : 'transparent',
                    borderWidth: active ? 1 : StyleSheet.hairlineWidth,
                    borderColor: active ? colors.accent : colors.border,
                  })}
                >
                  {/* Icon tile */}
                  <View style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: `${m.accent}22`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <m.Icon color={m.accent} size={20} weight="fill" />
                  </View>

                  {/* Label + tagline */}
                  <View style={{ flex: 1 }}>
                    <Text style={[font.bodyBold, { color: colors.text, fontSize: 15, letterSpacing: -0.1 }]}>
                      {m.name}
                    </Text>
                    <Text style={[font.body, { color: colors.textSecondary, fontSize: 12, marginTop: 1 }]} numberOfLines={1}>
                      {m.tagline}
                    </Text>
                  </View>

                  {/* Selected check */}
                  {active && (
                    <View style={{
                      width: 24, height: 24, borderRadius: 12,
                      backgroundColor: colors.accent,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Check color="#fff" size={14} weight="bold" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Cancel pill — same treatment as ActionSheet for consistency */}
        <Pressable
          onPress={() => { tap('light'); onClose(); }}
          style={({ pressed }) => ({
            marginTop: 10,
            borderRadius: 16,
            backgroundColor: pressed ? colors.surfaceHover : colors.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            paddingVertical: 16,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
          })}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={[font.bodyBold, { color: colors.text, fontSize: 16 }]}>Cancel</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}
