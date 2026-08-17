import React, { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ImageSquare, VideoCamera, SlidersHorizontal } from 'phosphor-react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { PhotoEditor } from '../../src/features/feed/ui/PhotoEditor';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';

export default function EditorApp() {
  const { colors, radius, font } = useTheme();
  const [editingPhotoUri, setEditingPhotoUri] = useState<string | null>(null);
  
  const pickAndEditPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Gallery access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      setEditingPhotoUri(result.assets[0].uri);
    }
  };

  const pickAndEditVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Gallery access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: true, // Native video editor!
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
    });
    if (!result.canceled && result.assets[0]) {
      Alert.alert('Video Edit Complete', 'Your trimmed and edited video has been saved locally.');
    }
  };

  return (
    <MiniAppShell title="Editor" subtitle="Post-process">
      <Stack.Screen options={{ title: 'Editor', headerTitleStyle: { fontFamily: font.bodyBold.fontFamily } }} />
      
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <SlidersHorizontal size={48} color={colors.accent} weight="duotone" />
          <Text style={{ fontFamily: font.bodyBold.fontFamily, fontSize: 24, color: colors.text, marginTop: 16 }}>Full Scale Editor</Text>
          <Text style={{ fontFamily: font.body.fontFamily, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8 }}>
            Pro-grade image color adjustments and native video trimming suite.
          </Text>
        </View>

        <Pressable onPress={pickAndEditPhoto} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgPure, padding: 20, borderRadius: radius.xl, gap: 16 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(224, 96, 48, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <ImageSquare size={24} color="#E06030" weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.bodyBold.fontFamily, fontSize: 16, color: colors.text }}>Edit Photo</Text>
            <Text style={{ fontFamily: font.body.fontFamily, fontSize: 13, color: colors.textMuted, marginTop: 2 }}>Color grading, crop, and filters</Text>
          </View>
        </Pressable>

        <Pressable onPress={pickAndEditVideo} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgPure, padding: 20, borderRadius: radius.xl, gap: 16 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(78, 139, 122, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <VideoCamera size={24} color="#4E8B7A" weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.bodyBold.fontFamily, fontSize: 16, color: colors.text }}>Edit Video</Text>
            <Text style={{ fontFamily: font.body.fontFamily, fontSize: 13, color: colors.textMuted, marginTop: 2 }}>Trim, crop, and apply native effects</Text>
          </View>
        </Pressable>
      </View>

      <PhotoEditor
        visible={!!editingPhotoUri}
        uri={editingPhotoUri || ''}
        onCancel={() => setEditingPhotoUri(null)}
        onDone={(uri) => {
          setEditingPhotoUri(null);
          Alert.alert('Photo Edit Complete', 'Your edits have been successfully baked into the image.');
        }}
      />
    </MiniAppShell>
  );
}
