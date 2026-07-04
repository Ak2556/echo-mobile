import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { ArrowsClockwise, GitFork } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { tap } from '../../lib/haptics';

interface RepostChoiceSheetProps {
  visible: boolean;
  onClose: () => void;
  reposted: boolean;
  /** Plain re-echo — share as-is to your followers. */
  onRepost: () => void;
  /** Remix — open compose pre-filled with this echo as a quote. */
  onRemix: () => void;
}

/**
 * Dedicated picker for the re-echo / remix moment. Surfaces both options
 * as equal-weight cards with an icon, a name, and a one-line tradeoff
 * explanation. Better than a bare ActionSheet for a creative decision
 * users make a lot — and clarifies what "Remix" means at the point of use.
 */
export function RepostChoiceSheet({ visible, onClose, reposted, onRepost, onRemix }: RepostChoiceSheetProps) {
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
          borderRadius: 22,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.glassBorder,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 14 },
        }}>
          <BlurView intensity={60} tint={colors.isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: 0.62 }]} pointerEvents="none" />
          <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 }}>
            <Text style={[font.display, { color: colors.text, fontSize: 18, letterSpacing: -0.3 }]}>
              Spread this echo
            </Text>
            <Text style={[font.body, { color: colors.textSecondary, fontSize: 13, marginTop: 4 }]}>
              Pass it through or build on it with your own take.
            </Text>
          </View>

          <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 6 }}>
            <ChoiceRow
              Icon={ArrowsClockwise}
              accent="#22C55E"
              name={reposted ? 'Undo re-echo' : 'Re-echo'}
              tagline={reposted
                ? 'Remove from your followers’ feed'
                : 'Share as-is — credits the original author'}
              onPress={() => { tap('light'); onRepost(); onClose(); }}
              destructive={reposted}
              colors={colors}
              font={font}
            />
            <ChoiceRow
              Icon={GitFork}
              accent={colors.accent}
              name="Add Perspective"
              tagline="Add your own angle and link back to the original"
              onPress={() => { tap('light'); onRemix(); onClose(); }}
              colors={colors}
              font={font}
            />
          </View>
        </View>

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

interface ChoiceRowProps {
  Icon: React.ComponentType<any>;
  accent: string;
  name: string;
  tagline: string;
  onPress: () => void;
  destructive?: boolean;
  colors: any;
  font: any;
}

function ChoiceRow({ Icon, accent, name, tagline, onPress, destructive, colors, font }: ChoiceRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${tagline}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: 14,
        backgroundColor: pressed ? colors.surfaceHover : 'transparent',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      })}
    >
      <View style={{
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: `${accent}22`,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon color={accent} size={20} weight="fill" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[font.bodyBold, { color: destructive ? colors.danger : colors.text, fontSize: 15, letterSpacing: -0.1 }]}>
          {name}
        </Text>
        <Text style={[font.body, { color: colors.textSecondary, fontSize: 12, marginTop: 1 }]} numberOfLines={1}>
          {tagline}
        </Text>
      </View>
    </Pressable>
  );
}
