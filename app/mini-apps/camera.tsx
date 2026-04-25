import React, { useState } from 'react';
import {
  View, Text, ScrollView, Image, Pressable,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown, ZoomIn, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import {
  ArrowLeft, Camera, VideoCamera, CameraRotate,
  CameraPlus, Trash, X,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';

type Mode = 'photo' | 'video';
type MediaItem = { uri: string; type: Mode; width?: number; height?: number };

export default function CameraApp() {
  const { colors } = useTheme();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('photo');
  const [captured, setCaptured] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const captureScale = useSharedValue(1);

  const captureStyle = useAnimatedStyle(() => ({ transform: [{ scale: captureScale.value }] }));

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take photos and videos.');
      return;
    }
    captureScale.value = withSpring(0.88, {}, () => { captureScale.value = withSpring(1); });
    setLoading(true);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: mode === 'photo'
        ? ImagePicker.MediaTypeOptions.Images
        : ImagePicker.MediaTypeOptions.Videos,
      quality: 0.92,
      allowsEditing: mode === 'photo',
      videoMaxDuration: 60,
    });
    setLoading(false);
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const item: MediaItem = {
        uri: asset.uri,
        type: mode,
        width: asset.width,
        height: asset.height,
      };
      setCaptured(prev => [item, ...prev]);
      showToast(mode === 'photo' ? 'Photo captured' : 'Video saved', '✅');
    }
  };

  const launchGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const type: Mode = asset.type === 'video' ? 'video' : 'photo';
      setCaptured(prev => [{ uri: asset.uri, type, width: asset.width, height: asset.height }, ...prev]);
      showToast('Added from library', '🖼');
    }
  };

  const deleteItem = (index: number) => {
    setCaptured(prev => prev.filter((_, i) => i !== index));
    if (selected === captured[index]) setSelected(null);
  };

  const ACCENT = mode === 'photo' ? '#6366F1' : '#EF4444';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
        <AnimatedPressable onPress={() => router.back()} scaleValue={0.88} haptic="light" style={{ marginRight: 12 }}>
          <ArrowLeft color="#fff" size={24} />
        </AnimatedPressable>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', flex: 1 }}>Camera</Text>
        <AnimatedPressable onPress={launchGallery} scaleValue={0.9} haptic="light" style={{ padding: 8 }}>
          <CameraPlus color="#71717A" size={22} />
        </AnimatedPressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Viewfinder panel */}
        <Animated.View
          entering={FadeInDown.springify()}
          style={{
            marginHorizontal: 16,
            borderRadius: 28,
            overflow: 'hidden',
            aspectRatio: 3 / 4,
            backgroundColor: '#0D0D0D',
            borderWidth: 1.5,
            borderColor: ACCENT + '44',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Corner brackets */}
          {([['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']] as const).map(([v, h]) => (
            <View key={`${v}${h}`} style={{
              position: 'absolute',
              ...(v === 'top' ? { top: 20 } : { bottom: 20 }),
              ...(h === 'left' ? { left: 20 } : { right: 20 }),
              width: 28, height: 28,
              borderTopWidth: v === 'top' ? 2.5 : 0,
              borderBottomWidth: v === 'bottom' ? 2.5 : 0,
              borderLeftWidth: h === 'left' ? 2.5 : 0,
              borderRightWidth: h === 'right' ? 2.5 : 0,
              borderColor: ACCENT,
              borderTopLeftRadius: v === 'top' && h === 'left' ? 6 : 0,
              borderTopRightRadius: v === 'top' && h === 'right' ? 6 : 0,
              borderBottomLeftRadius: v === 'bottom' && h === 'left' ? 6 : 0,
              borderBottomRightRadius: v === 'bottom' && h === 'right' ? 6 : 0,
            }} />
          ))}

          {/* Grid lines */}
          <View style={{ position: 'absolute', left: '33%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.04)' }} />
          <View style={{ position: 'absolute', left: '66%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.04)' }} />
          <View style={{ position: 'absolute', top: '33%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.04)' }} />
          <View style={{ position: 'absolute', top: '66%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.04)' }} />

          {/* Center icon */}
          <View style={{ alignItems: 'center', gap: 16 }}>
            {mode === 'photo'
              ? <Camera color={ACCENT} size={72} weight="thin" />
              : <VideoCamera color={ACCENT} size={72} weight="thin" />}
            <Text style={{ color: '#3F3F46', fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 40 }}>
              {mode === 'photo'
                ? 'Tap the capture button to\ntake a photo'
                : 'Tap the capture button to\nstart recording'}
            </Text>
          </View>

          {/* Mode badge */}
          <View style={{
            position: 'absolute', top: 16, left: 16,
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: ACCENT + '22',
            borderRadius: 8, borderWidth: 1, borderColor: ACCENT + '44',
            paddingHorizontal: 10, paddingVertical: 4,
          }}>
            {mode === 'video' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />}
            <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>
              {mode === 'photo' ? 'PHOTO' : 'VIDEO'}
            </Text>
          </View>

          {/* Rotation icon */}
          <View style={{ position: 'absolute', top: 16, right: 16 }}>
            <CameraRotate color="#3F3F46" size={20} />
          </View>
        </Animated.View>

        {/* Mode switcher */}
        <View style={{ marginHorizontal: 16, marginTop: 16 }}>
          <View style={{ flexDirection: 'row', backgroundColor: '#111', borderRadius: 16, padding: 4, borderWidth: 1, borderColor: '#1C1C1E' }}>
            {(['photo', 'video'] as Mode[]).map(m => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 12,
                  alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'row', gap: 8,
                  backgroundColor: mode === m
                    ? (m === 'photo' ? '#6366F1' : '#EF4444')
                    : 'transparent',
                }}
              >
                {m === 'photo'
                  ? <Camera color={mode === m ? '#fff' : '#52525B'} size={16} weight="fill" />
                  : <VideoCamera color={mode === m ? '#fff' : '#52525B'} size={16} weight="fill" />}
                <Text style={{ color: mode === m ? '#fff' : '#52525B', fontWeight: '700', fontSize: 14, textTransform: 'capitalize' }}>
                  {m}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Capture button */}
        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <Animated.View style={captureStyle}>
            <AnimatedPressable
              onPress={launchCamera}
              disabled={loading}
              scaleValue={0.96}
              haptic="heavy"
              style={{
                backgroundColor: ACCENT,
                borderRadius: 20, paddingVertical: 20,
                alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row', gap: 10,
                shadowColor: ACCENT, shadowOpacity: 0.45,
                shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : mode === 'photo'
                  ? <Camera color="#fff" size={22} weight="fill" />
                  : <VideoCamera color="#fff" size={22} weight="fill" />}
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>
                {loading ? 'Opening camera…' : mode === 'photo' ? 'Capture Photo' : 'Record Video'}
              </Text>
            </AnimatedPressable>
          </Animated.View>
        </View>

        {/* Captured gallery */}
        {captured.length > 0 && (
          <Animated.View entering={FadeInDown} style={{ paddingHorizontal: 16, marginTop: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: '#71717A', fontSize: 12, fontWeight: '700', letterSpacing: 1, flex: 1 }}>
                CAPTURED · {captured.length}
              </Text>
              <Pressable onPress={() => { setCaptured([]); setSelected(null); }}>
                <Text style={{ color: '#3F3F46', fontSize: 12 }}>Clear all</Text>
              </Pressable>
            </View>

            {/* Full preview of selected */}
            {selected && (
              <Animated.View entering={ZoomIn.springify()} style={{ marginBottom: 14, borderRadius: 20, overflow: 'hidden', position: 'relative' }}>
                <Image source={{ uri: selected.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 20 }} resizeMode="cover" />
                {selected.type === 'video' && (
                  <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 40, padding: 16 }}>
                      <VideoCamera color="#fff" size={32} weight="fill" />
                    </View>
                  </View>
                )}
                <AnimatedPressable
                  onPress={() => setSelected(null)}
                  scaleValue={0.9} haptic="light"
                  style={{ position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, padding: 8 }}
                >
                  <X color="#fff" size={16} />
                </AnimatedPressable>
              </Animated.View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {captured.map((item, i) => (
                <Animated.View key={i} entering={ZoomIn.delay(i * 30).springify()}>
                  <Pressable
                    onPress={() => setSelected(selected?.uri === item.uri ? null : item)}
                    style={{
                      width: 80, height: 80, borderRadius: 14, overflow: 'hidden',
                      borderWidth: 2.5,
                      borderColor: selected?.uri === item.uri ? ACCENT : (item.type === 'photo' ? '#6366F133' : '#EF444433'),
                    }}
                  >
                    <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    {item.type === 'video' && (
                      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
                        <VideoCamera color="#fff" size={18} weight="fill" />
                      </View>
                    )}
                    {/* Delete dot */}
                    <AnimatedPressable
                      onPress={() => deleteItem(i)}
                      scaleValue={0.85} haptic="light"
                      style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, padding: 3 }}
                    >
                      <Trash color="#EF4444" size={12} weight="fill" />
                    </AnimatedPressable>
                  </Pressable>
                </Animated.View>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
