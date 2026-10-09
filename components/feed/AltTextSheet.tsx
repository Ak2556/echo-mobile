import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../lib/ui/theme';
import { ttx } from '../../lib/i18n/i18n';
import { ALT_TEXT_MAX } from '../../lib/media/altText';


interface AltTextSheetProps {
  visible: boolean;
  uri: string | null;
  initial: string;
  onSave: (text: string) => void;
  onClose: () => void;
}

/**
 * Describe a photo for people who cannot see it. A screen reader reads this aloud
 * in place of the photo, so say what is in it the way you would on the phone.
 */
export function AltTextSheet({ visible, uri, initial, onSave, onClose }: AltTextSheetProps) {
  const { colors, radius, fontSizes } = useTheme();
  const [text, setText] = useState(initial);

  // Start from the saved description each time the sheet opens for a photo.
  useEffect(() => { if (visible) setText(initial); }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={ttx('Close')} accessibilityRole="button" />
        <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: 16, gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: fontSizes.body, fontWeight: '700' }}>{ttx('Describe this photo')}</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>
            {ttx('For people who cannot see it. A screen reader reads this aloud.')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            {uri ? <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: radius.md }} contentFit="cover" /> : null}
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              maxLength={ALT_TEXT_MAX}
              autoFocus
              placeholder={ttx('A dog running on a beach at sunset')}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={ttx('Photo description')}
              style={{
                flex: 1, minHeight: 72, maxHeight: 140, color: colors.text, fontSize: fontSizes.body,
                borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, textAlignVertical: 'top',
              }}
            />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, alignSelf: 'flex-end' }}>{text.length} / {ALT_TEXT_MAX}</Text>
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Pressable onPress={onClose} accessibilityRole="button" style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ color: colors.textMuted, fontWeight: '600' }}>{ttx('Cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(text.trim())}
              accessibilityRole="button"
              style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.accent }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{ttx('Save')}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
