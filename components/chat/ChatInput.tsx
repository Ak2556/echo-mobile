import React, { useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { PaperPlaneRight, Image as ImageIcon, Smiley } from 'phosphor-react-native';

interface Props {
  onSend: (text: string) => void;
  colors: any;
}

export function ChatInput({ onSend, colors }: Props) {
  const inputRef = useRef<TextInput>(null);
  const textRef = useRef('');

  const handleSend = () => {
    const val = textRef.current.trim();
    if (val) {
      onSend(val);
      textRef.current = '';
      inputRef.current?.clear();
    }
  };

  return (
    <View style={[styles.container, { borderTopColor: colors.border, backgroundColor: colors.bg }]}>
      <TouchableOpacity style={styles.iconButton}>
        <ImageIcon size={24} color={colors.textMuted} />
      </TouchableOpacity>
      
      <View style={[styles.inputContainer, { backgroundColor: colors.bgSecondary }]}>
        <TextInput
          ref={inputRef}
          placeholder="Message..."
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text }]}
          onChangeText={(t) => { textRef.current = t; }}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.smileyButton}>
          <Smiley size={24} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={[styles.sendButton, { backgroundColor: colors.text }]}
        onPress={handleSend}
      >
        <PaperPlaneRight size={18} color={colors.bg} weight="fill" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    padding: 8,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    marginHorizontal: 8,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  smileyButton: {
    padding: 4,
  },
  sendButton: {
    padding: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
