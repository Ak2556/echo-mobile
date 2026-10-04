import React from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/shared/lib/theme';
import { ttx } from '../../src/shared/lib/i18n';
import type { ConsentGate } from '../../lib/privacy/consentGate';

interface ConsentSheetProps {
  gate: Pick<ConsentGate, 'useConsent' | 'answer'>;
  icon: React.ReactNode;
  title: string;
  paragraphs: string[];
  allowLabel: string;
  declineLabel: string;
}

/**
 * The sheet for a lib/consentGate permission. Mounted once at the app root;
 * appears whenever something awaits that gate's ensure(). Every string passes
 * through ttx, so callers pass English.
 */
export function ConsentSheet({ gate, icon, title, paragraphs, allowLabel, declineLabel }: ConsentSheetProps) {
  const { colors, radius } = useTheme();
  const router = useRouter();
  const open = gate.useConsent(s => s.pending !== null);
  if (!open) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => gate.answer(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
          <View style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 12 }}>
            <View style={{
              width: 56, height: 56, borderRadius: 28, alignSelf: 'center', marginBottom: 16,
              backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center',
            }}>
              {icon}
            </View>
            <Text style={{ color: colors.text, fontSize: 21, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 }}>
              {ttx(title)}
            </Text>
            {paragraphs.map(p => (
              <Text key={p} style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginTop: 12 }}>
                {ttx(p)}
              </Text>
            ))}
            <Pressable
              onPress={() => { gate.answer(false); router.push('/privacy'); }}
              accessibilityRole="link"
              style={{ paddingVertical: 8 }}
            >
              <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>{ttx("Read the privacy policy")}</Text>
            </Pressable>

            {/* Wrapper Views own the fill AND the padding; the Pressables stay
                bare. A style function on the Pressable was dropped in Release
                too, which collapsed both buttons to a thin bar with the label
                pinned left and a 20px-tall "Keep on this device". */}
            <View style={{ marginTop: 12, borderRadius: radius.lg, backgroundColor: colors.accent, overflow: 'hidden' }}>
              <Pressable onPress={() => gate.answer(true)} accessibilityRole="button" accessibilityLabel={ttx(allowLabel)}>
                {({ pressed }) => (
                  <View style={{ paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.9 : 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{ttx(allowLabel)}</Text>
                  </View>
                )}
              </Pressable>
            </View>
            <View style={{ marginTop: 6 }}>
              <Pressable onPress={() => gate.answer(false)} accessibilityRole="button" accessibilityLabel={ttx(declineLabel)}>
                {({ pressed }) => (
                  <View style={{ paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.6 : 1 }}>
                    <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: 15 }}>{ttx(declineLabel)}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
