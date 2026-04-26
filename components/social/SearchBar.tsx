import React from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { MagnifyingGlass, X } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChangeText, placeholder = 'Search echoes...' }: SearchBarProps) {
  const { colors, radius } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        paddingHorizontal: 12,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <MagnifyingGlass color={colors.textMuted} size={18} />
      <TextInput
        style={{ flex: 1, color: colors.text, fontSize: 16, marginLeft: 8 }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')}>
          <X color={colors.textMuted} size={18} />
        </Pressable>
      )}
    </View>
  );
}
