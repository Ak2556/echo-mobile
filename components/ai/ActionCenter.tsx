import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { GlassPanel } from '../ui/GlassPanel';

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
  const { colors } = useTheme();
  const selectExample = (prompt: string) => {
    onSelectExample?.(prompt);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        <View style={{ flex: 1, justifyContent: 'center', padding: 18 }}>
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
                    <Pressable
                      key={example}
                      onPress={() => selectExample(example)}
                      style={{ borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, marginHorizontal: -8 }}
                    >
                      <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>- {example}</Text>
                    </Pressable>
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
