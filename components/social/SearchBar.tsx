import React from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Search, X } from 'lucide-react-native';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChangeText, placeholder = 'Search echoes...' }: SearchBarProps) {
  return (
    <View className="flex-row items-center bg-zinc-900 rounded-xl px-3 py-2.5 mx-4 mb-3 border border-zinc-800">
      <Search color="#71717A" size={18} />
      <TextInput
        className="flex-1 text-white text-base ml-2"
        placeholder={placeholder}
        placeholderTextColor="#71717A"
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')}>
          <X color="#71717A" size={18} />
        </Pressable>
      )}
    </View>
  );
}
