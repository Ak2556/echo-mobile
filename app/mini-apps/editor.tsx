import React, { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { ImageSquare, VideoCamera, SlidersHorizontal } from 'phosphor-react-native';
import { useTheme } from '../../lib/ui/theme';
import { PhotoEditor } from '../../components/feed/PhotoEditor';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { VideoTrimmer } from '../../components/mini-apps/VideoTrimmer';
import { showToast } from '../../components/ui/Toast';
import { canSaveToGallery, canTrimVideo, mediaErrorMessage, saveToGallery } from '../../lib/media/echoMedia';
import { WARM, BRAND } from '../../lib/ui/fixedColors';

export default function EditorApp() {
  const { colors, radius, font } = useTheme();
  const [editingPhotoUri, setEditingPhotoUri] = useState<string | null>(null);
  const [trimmingVideoUri, setTrimmingVideoUri] = useState<string | null>(null);

  // What happens to a finished edit. Where the build can write to the gallery
  // (Android with the EchoMedia module) it offers Save and Share; everywhere
  // else it goes straight to the share sheet, which on iOS has Save built in.
  const deliver = async (uri: string, mimeType: string, label: string) => {
    const canShare = await Sharing.isAvailableAsync();
    if (!canSaveToGallery()) {
      if (canShare) await Sharing.shareAsync(uri);
      else Alert.alert(label, 'Your edits are done, but sharing is not available on this device.');
      return;
    }
    Alert.alert(label, 'Your edit is ready.', [
      {
        text: 'Save to gallery',
        onPress: async () => {
          try {
            await saveToGallery(uri, mimeType);
            showToast('Saved to your gallery', 'Editor');
          } catch (e) {
            Alert.alert('Could not save', mediaErrorMessage(e));
          }
        },
      },
      ...(canShare ? [{ text: 'Share', onPress: () => { void Sharing.shareAsync(uri); } }] : []),
      { text: 'Done', style: 'cancel' as const },
    ]);
  };

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
    // Android's picker has no trim step (allowsEditing only exists on iOS), so
    // where the EchoMedia module is present Echo trims in its own screen.
    const ownTrimmer = canTrimVideo();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: !ownTrimmer,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      if (ownTrimmer) setTrimmingVideoUri(uri);
      else await deliver(uri, 'video/mp4', 'Video ready');
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
            <ImageSquare size={24} color={BRAND.ember} weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.bodyBold.fontFamily, fontSize: 16, color: colors.text }}>Edit Photo</Text>
            <Text style={{ fontFamily: font.body.fontFamily, fontSize: 13, color: colors.textMuted, marginTop: 2 }}>Color grading, crop, and filters</Text>
          </View>
        </Pressable>

        <Pressable onPress={pickAndEditVideo} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgPure, padding: 20, borderRadius: radius.xl, gap: 16 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(78, 139, 122, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <VideoCamera size={24} color={WARM.sage} weight="fill" />
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
        onDone={async (uri) => {
          setEditingPhotoUri(null);
          if (!uri) return;
          await deliver(uri, /\.png($|\?)/i.test(uri) ? 'image/png' : 'image/jpeg', 'Photo ready');
        }}
      />

      <VideoTrimmer
        visible={!!trimmingVideoUri}
        uri={trimmingVideoUri || ''}
        onCancel={() => setTrimmingVideoUri(null)}
        onDone={async (uri) => {
          setTrimmingVideoUri(null);
          await deliver(uri, 'video/mp4', 'Video ready');
        }}
      />
    </MiniAppShell>
  );
}
