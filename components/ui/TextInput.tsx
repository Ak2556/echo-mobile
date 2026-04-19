import React from 'react';
import { TextInput as RNTextInput, TextInputProps, View } from 'react-native';

export function TextInput(props: TextInputProps) {
  return (
    <View className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 min-h-[50px] justify-center">
      <RNTextInput
        className="text-white text-base leading-5"
        placeholderTextColor="#A1A1AA"
        multiline
        {...props}
      />
    </View>
  );
}
