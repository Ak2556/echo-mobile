import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { GlassPanel } from '../ui/GlassPanel';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const GROUPS = [
  {
    title: 'Notes',
    examples: ['Create a note for my launch ideas', 'Append this to my grocery note'],
  },
  {
    title: 'Habits',
    examples: ['Create a habit to drink water', 'Mark meditation done today'],
  },
  {
    title: 'Expenses',
    examples: ['Log $12 for lunch', 'Summarize my spending this week'],
  },
  {
    title: 'Voice Memo',
    examples: ['Rename my latest memo', 'Delete the memo called draft'],
  },
  {
    title: 'Memory',
    examples: ['Remember my preferred currency is INR', 'What do you remember about me?'],
  },
];

export function ActionCenter({ visible, onClose }: Props) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        <View style={{ flex: 1, justifyContent: 'center', padding: 18 }}>
          <GlassPanel variant="ultra" borderRadius={22} elevated>
            <View style={{ padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 19, fontWeight: '800' }}>Echo Actions</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>Local writes ask before changing data.</Text>
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
                    <Text key={example} style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>- {example}</Text>
                  ))}
                </View>
              ))}
            </ScrollView>
          </GlassPanel>
        </View>
      </View>
    </Modal>
  );
}
