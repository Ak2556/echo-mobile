import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { X } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

interface ProfilePhotoPreviewProps {
  visible: boolean;
  imageUrl?: string;
  displayName: string;
  onClose: () => void;
}

export function ProfilePhotoPreview({ visible, imageUrl, displayName, onClose }: ProfilePhotoPreviewProps) {
  const { colors, radius, font } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', padding: 22 }}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close profile photo"
          style={{
            position: 'absolute',
            top: 54,
            right: 22,
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.12)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.16)',
            zIndex: 2,
          }}
        >
          <X color="#fff" size={21} weight="bold" />
        </Pressable>

        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
          <Text
            style={[font.bodySemibold, { color: '#fff', fontSize: 18, marginBottom: 14, textAlign: 'center' }]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <View
            style={{
              width: '100%',
              aspectRatio: 1,
              overflow: 'hidden',
              borderRadius: radius.card,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.16)',
            }}
          >
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
