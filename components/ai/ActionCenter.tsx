import React, { useEffect, useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'phosphor-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { GlassPanel } from '../ui/GlassPanel';
import { MOTION } from '../../lib/motion';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectExample?: (prompt: string) => void;
}

const GROUPS = [
  {
    title: 'Read-only',
    examples: ['Search my local productivity for launch', 'Summarize my spending this week', 'What do you remember about me?'],
  },
  {
    title: 'Requires confirmation',
    examples: [
      'Create a note for my launch ideas',
      'Append this to my grocery note',
      'Create a habit to drink water',
      'Mark meditation done today',
      'Log $12 for lunch',
      'Rename my latest memo',
      'Delete the memo called draft',
      'Remember my preferred currency is INR',
    ],
  },
];

const DISMISS_THRESHOLD = 80;
const SHEET_OFF = 700;

export function ActionCenter({ visible, onClose, onSelectExample }: Props) {
  const { colors, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);

  const translateY = useSharedValue(SHEET_OFF);
  const backdropOpacity = useSharedValue(0);
  const dragY = useSharedValue(0);

  const animateIn = useCallback(() => {
    if (reduceAnimations) {
      translateY.value = 0;
      backdropOpacity.value = 1;
      return;
    }
    translateY.value = withSpring(0, { damping: 26, stiffness: 340, mass: 0.9 });
    backdropOpacity.value = withTiming(1, { duration: 180 });
  }, [reduceAnimations, translateY, backdropOpacity]);

  const animateOut = useCallback((cb: () => void) => {
    if (reduceAnimations) {
      translateY.value = SHEET_OFF;
      backdropOpacity.value = 0;
      cb();
      return;
    }
    translateY.value = withSpring(SHEET_OFF, { damping: 20, stiffness: 360, mass: 0.8 });
    backdropOpacity.value = withTiming(0, { duration: 200 });
    setTimeout(cb, 280);
  }, [reduceAnimations, translateY, backdropOpacity]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = SHEET_OFF;
      dragY.value = 0;
      backdropOpacity.value = 0;
      // Small delay so Modal renders before animating
      setTimeout(animateIn, 16);
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    animateOut(onClose);
  }, [animateOut, onClose]);

  const pan = Gesture.Pan()
    .activeOffsetY([4, 4])
    .onUpdate((e) => {
      const dy = e.translationY;
      dragY.value = dy > 0 ? dy : dy * 0.15; // resist upward
    })
    .onEnd((e) => {
      const shouldDismiss = e.translationY > DISMISS_THRESHOLD || e.velocityY > 600;
      if (shouldDismiss) {
        translateY.value = withSpring(SHEET_OFF, { damping: 20, stiffness: 360 });
        backdropOpacity.value = withTiming(0, { duration: 180 });
        runOnJS(onClose)();
      } else {
        dragY.value = withSpring(0, MOTION.release);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const selectExample = (prompt: string) => {
    onSelectExample?.(prompt);
    handleClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={StyleSheet.absoluteFill}>
        {/* Backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            onPress={handleClose}
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
          />
        </Animated.View>

        {/* Sheet */}
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              paddingBottom: insets.bottom + 8,
            }, sheetStyle]}
          >
            {/* Drag handle */}
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' }} />
            </View>

            <GlassPanel variant="ultra" borderRadius={24} elevated style={{ marginHorizontal: 12, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}>
              <View style={{ padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 19, fontWeight: '800' }}>Echo Actions</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>Runs on this device. Local writes ask before changing data.</Text>
                </View>
                <AnimatedPressable onPress={handleClose} scaleValue={0.9} haptic="light" style={{ padding: 6 }}>
                  <X color={colors.textMuted} size={20} />
                </AnimatedPressable>
              </View>

              <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ padding: 14, gap: 10 }}>
                {GROUPS.map(group => (
                  <View key={group.title} style={{ borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, padding: 12, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', marginBottom: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 8 }}>{group.title}</Text>
                    {group.examples.map(example => (
                      <AnimatedPressable
                        key={example}
                        onPress={() => selectExample(example)}
                        depth="soft"
                        fadeOnPress
                        style={{ borderRadius: 999, paddingVertical: 7, paddingHorizontal: 10, marginHorizontal: -2, marginVertical: 2, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}
                      >
                        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>- {example}</Text>
                      </AnimatedPressable>
                    ))}
                  </View>
                ))}
              </ScrollView>
            </GlassPanel>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}
