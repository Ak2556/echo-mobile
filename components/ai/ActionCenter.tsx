import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'phosphor-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
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

export function ActionCenter({ visible, onClose, onSelectExample }: Props) {
  const { colors, reduceAnimations } = useTheme();
  const selectExample = (prompt: string) => {
    onSelectExample?.(prompt);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View entering={reduceAnimations ? undefined : FadeIn.duration(120)} style={StyleSheet.absoluteFill}>
          <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        </Animated.View>
        <View style={{ flex: 1, justifyContent: 'center', padding: 18 }}>
          <Animated.View entering={reduceAnimations ? undefined : FadeInDown.springify().damping(MOTION.modalEntrance.damping).stiffness(MOTION.modalEntrance.stiffness).mass(MOTION.modalEntrance.mass)}>
          <GlassPanel variant="ultra" borderRadius={22} elevated>
            <View style={{ padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 19, fontWeight: '800' }}>Echo Actions</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>Runs on this device. Local writes ask before changing data.</Text>
              </View>
              <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light" style={{ padding: 6 }}>
                <X color={colors.textMuted} size={20} />
              </AnimatedPressable>
            </View>

            <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ padding: 14, gap: 10 }}>
              {GROUPS.map(group => (
                <View key={group.title} style={{ borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, padding: 12, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
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
        </View>
      </View>
    </Modal>
  );
}
