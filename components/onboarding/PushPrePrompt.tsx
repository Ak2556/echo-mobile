import React from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, BellSlash } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { track } from '../../lib/analytics';

interface PushPrePromptProps {
  visible: boolean;
  onAccept: () => void; // caller fires the OS prompt
  onDecline: () => void;
}

/**
 * In-app sheet that explains push value *before* iOS shows the native prompt.
 *
 * Apple HIG recommends a pre-prompt so users have context — once they tap
 * "Don't allow" on the native dialog there's no second chance. The flow:
 *
 *   1. User publishes their first Echo
 *   2. This sheet appears with the value prop
 *   3. They tap "Turn on notifications" → caller calls Notifications.
 *      requestPermissionsAsync()
 *   4. Or they tap "Not now" -> no native prompt fires
 *
 * The decline branch is reversible because we never burned the OS prompt.
 */
export function PushPrePrompt({ visible, onAccept, onDecline }: PushPrePromptProps) {
  const { colors, radius } = useTheme();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDecline}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
          <View style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 12, alignItems: 'center' }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: colors.accent + '18',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
              }}
            >
              <Bell color={colors.accent} size={28} weight="duotone" />
            </View>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4, textAlign: 'center' }}>
              Stay in the loop
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 15,
                lineHeight: 22,
                textAlign: 'center',
                marginTop: 10,
                maxWidth: 320,
              }}
            >
              We&apos;ll ping you when someone reacts, comments, or quotes your Echoes — not for anything else.
            </Text>

            <Pressable
              onPress={() => { track('push_permission_granted', { source: 'pre_prompt' }); onAccept(); }}
              style={({ pressed }) => ({
                marginTop: 24,
                width: '100%',
                paddingVertical: 14,
                borderRadius: radius.lg,
                backgroundColor: colors.accent,
                alignItems: 'center',
                opacity: pressed ? 0.9 : 1,
                shadowColor: colors.accent,
                shadowOpacity: 0.25,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
              })}
              accessibilityRole="button"
              accessibilityLabel="Turn on notifications"
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Turn on notifications</Text>
            </Pressable>

            <Pressable
              onPress={() => { track('push_permission_denied', { source: 'pre_prompt' }); onDecline(); }}
              style={({ pressed }) => ({
                marginTop: 8,
                width: '100%',
                paddingVertical: 14,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                opacity: pressed ? 0.6 : 1,
              })}
              accessibilityRole="button"
              accessibilityLabel="Not now"
            >
              <BellSlash color={colors.textMuted} size={16} />
              <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: 15 }}>Not now</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
