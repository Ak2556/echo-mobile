import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, Image, Pressable,
  ActivityIndicator, Alert, StyleSheet
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import ViewShot from 'react-native-view-shot';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { FadeInDown, ZoomIn, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import {
  Camera, CameraRotate,
  CameraPlus, Trash, X, SealCheck, FolderSimple, Stack, Tag, VideoCamera,
  Play, Pause, SpeakerHigh, SpeakerSlash, CornersOut, Images
} from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';
import { CameraCapture, CameraCaptureType, loadCameraCaptures, saveCameraCaptures } from '../../lib/cameraCaptures';
import { uploadMiniAppMedia } from '../../lib/miniAppMedia';
import { ttx } from '../../lib/i18n';
import { PhotoEditor } from '../../components/social/PhotoEditor';

type Mode = CameraCaptureType;
type CaptureIntent = 'proof' | 'progress' | 'listing' | 'document';

const INTENTS: { key: CaptureIntent; label: string; detail: string; icon: any }[] = [
  { key: 'proof', label: 'Proof', detail: 'Evidence', icon: SealCheck },
  { key: 'progress', label: 'Progress', detail: 'Before/after', icon: Stack },
  { key: 'listing', label: 'Listing', detail: 'Sell-ready', icon: Tag },
  { key: 'document', label: 'Document', detail: 'Scan-like', icon: FolderSimple },
];



function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function CaptureIntentRail({ value, accent, onChange }: { value: CaptureIntent; accent: string; onChange: (v: CaptureIntent) => void }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 9 }}>
        {ttx("Capture intent")}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {INTENTS.map(intent => {
          const Icon = intent.icon;
          const active = value === intent.key;
          return (
            <AnimatedPressable
              key={intent.key}
              onPress={() => onChange(intent.key)}
              scaleValue={0.95}
              haptic="light"
              style={{
                width: '48.5%',
                minHeight: 62,
                borderRadius: radius.xl,
                paddingHorizontal: 12,
                justifyContent: 'center',
                backgroundColor: active ? accent : colors.surface,
                borderWidth: 0,
                borderColor: 'transparent',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon color={active ? colors.bg : accent} size={17} weight="bold" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: active ? colors.bg : colors.text, fontSize: 14, fontWeight: '900' }}>{intent.label}</Text>
                  <Text style={{ color: active ? colors.bg : colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 }}>{intent.detail}</Text>
                </View>
              </View>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

export default function StudioApp() {
  const { colors, radius } = useTheme();
  const accent = colors.accent;
  const [intent, setIntent] = useState<CaptureIntent>('proof');
  const [captured, setCaptured] = useState<CameraCapture[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CameraCapture | null>(null);
  
  const [rawPhotoUri, setRawPhotoUri] = useState<string | null>(null);
  const videoRef = useRef<VideoView>(null);

  const [rawVideoUri, setRawVideoUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const player = useVideoPlayer(rawVideoUri, p => {
    p.muted = false;
    p.timeUpdateEventInterval = 0.25;
  });

  const captureScale = useSharedValue(1);
  const captureStyle = useAnimatedStyle(() => ({ transform: [{ scale: captureScale.value }] }));
  const ACCENT = accent;

  useEffect(() => {
    loadCameraCaptures().then(setCaptured).catch(() => setCaptured([]));
  }, []);

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    if (!rawVideoUri) return;
    const playingSub = player.addListener('playingChange', ({ isPlaying: nextPlaying }) => {
      setIsPlaying(nextPlaying);
    });
    const timeSub = player.addListener('timeUpdate', ({ currentTime }) => {
      setPosition(currentTime * 1000);
      if (player.duration) setDuration(player.duration * 1000);
    });
    const endSub = player.addListener('playToEnd', () => setIsPlaying(false));
    const sourceSub = player.addListener('sourceLoad', ({ duration: sourceDuration }) => {
      setDuration(sourceDuration * 1000);
    });
    return () => {
      playingSub.remove();
      timeSub.remove();
      endSub.remove();
      sourceSub.remove();
    };
  }, [player, rawVideoUri]);

  const persistCaptured = (next: CameraCapture[]) => {
    setCaptured(next);
    void saveCameraCaptures(next);
  };

  const handlePhotoEditorDone = async (uri: string) => {
    setLoading(true);
    try {
      const item: CameraCapture = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        uri: uri,
        type: 'photo',
        intent,
        width: 1080,
        height: 1440,
        createdAt: new Date().toISOString(),
      };
      const next = [item, ...captured];
      persistCaptured(next);
      setRawPhotoUri(null);
      showToast('Photo saved to Studio!', 'Success');
      
      uploadMiniAppMedia('studio', uri, { fileName: `capture_${item.id}.jpg`, mimeType: 'image/jpeg' })
        .then((uploaded) => {
           if (!uploaded?.path) return;
           setCaptured(prev => {
             const synced = prev.map(c => c.id === item.id ? { ...c, storagePath: uploaded.path } : c);
             void saveCameraCaptures(synced);
             return synced;
           });
        }).catch(() => {});
    } catch (e) {
      Alert.alert('Error saving image');
    } finally {
      setLoading(false);
    }
  };

  const processAndSaveVideo = async () => {
    if (!rawVideoUri) return;
    setLoading(true);
    try {
      const item: CameraCapture = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        uri: rawVideoUri,
        type: 'video',
        intent,
        width: 1920,
        height: 1080,
        createdAt: new Date().toISOString(),
      };
      const next = [item, ...captured];
      persistCaptured(next);
      setRawVideoUri(null);
      showToast('Video saved to Studio!', 'Success');
      
      uploadMiniAppMedia('studio', rawVideoUri, { fileName: `capture_${item.id}.mp4`, mimeType: 'video/mp4' })
        .then((uploaded) => {
           if (!uploaded?.path) return;
           setCaptured(prev => {
             const synced = prev.map(c => c.id === item.id ? { ...c, storagePath: uploaded.path } : c);
             void saveCameraCaptures(synced);
             return synced;
           });
        }).catch(() => {});
    } catch (e) {
      Alert.alert('Error saving video');
    } finally {
      setLoading(false);
    }
  };

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required.');
      return;
    }
    captureScale.value = withSpring(0.88, {}, () => { captureScale.value = withSpring(1); });
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setRawPhotoUri(result.assets[0].uri);
    }
  };

  const launchVideoCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      allowsEditing: true,
      videoMaxDuration: 120,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
    });
    if (!result.canceled && result.assets[0]) {
      setRawVideoUri(result.assets[0].uri);
      setIsPlaying(false);
      setPosition(0);
      setDuration(result.assets[0].duration ? result.assets[0].duration * 1000 : 0);
    }
  };

  const launchGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.type === 'video' || asset.mimeType?.startsWith('video/')) {
        setRawVideoUri(asset.uri);
        setIsPlaying(false);
        setPosition(0);
        setDuration(asset.duration ? asset.duration * 1000 : 0);
      } else {
        setRawPhotoUri(asset.uri);
      }
    }
  };

  const deleteItem = (index: number) => {
    if (selected === captured[index]) setSelected(null);
    persistCaptured(captured.filter((_, i) => i !== index));
  };

  const GalleryBtn = (
    <AnimatedPressable onPress={launchGallery} scaleValue={0.9} haptic="light"
      style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHover, borderRadius: radius.md }}>
      <Images color={colors.textMuted} size={20} />
    </AnimatedPressable>
  );

  if (rawPhotoUri) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <PhotoEditor
          visible={true}
          uri={rawPhotoUri}
          onCancel={() => setRawPhotoUri(null)}
          onDone={handlePhotoEditorDone}
        />
        {loading && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }]}>
            <ActivityIndicator size="large" color={accent} />
          </View>
        )}
      </View>
    );
  }

  if (rawVideoUri) {
    const progressPct = duration > 0 ? (position / duration) * 100 : 0;
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 60 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20 }}>
          <Text style={{ color: colors.text, fontSize: 32, fontFamily: 'Fraunces_900Black', letterSpacing: -0.5 }}>Review</Text>
          <Pressable onPress={() => { setRawVideoUri(null); player.pause(); }}>
            <Text style={{ color: colors.textMuted, fontSize: 16, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          <View style={{ flex: 1, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bgPure }}>
            <VideoView
              ref={videoRef}
              player={player}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
              nativeControls={false}
              fullscreenOptions={{ enable: true }}
            />
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, paddingVertical: 24, gap: 16 }}>
          <View>
            <View style={{ height: 4, backgroundColor: colors.inputBg, borderRadius: radius.sm, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${progressPct}%`, backgroundColor: accent, borderRadius: radius.sm }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{formatDuration(position)}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{formatDuration(duration)}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <AnimatedPressable onPress={() => setIsMuted(m => !m)} scaleValue={0.85} haptic="light">
              <View style={{ width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' }}>
                {isMuted ? <SpeakerSlash color={colors.textMuted} size={18} /> : <SpeakerHigh color={colors.text} size={18} />}
              </View>
            </AnimatedPressable>

            <AnimatedPressable onPress={() => isPlaying ? player.pause() : player.play()} scaleValue={0.9} haptic="medium">
              <View style={{ width: 64, height: 64, borderRadius: radius.full, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
                {isPlaying ? <Pause color={colors.bgPure} size={26} weight="fill" /> : <Play color={colors.bgPure} size={26} weight="fill" />}
              </View>
            </AnimatedPressable>

            <AnimatedPressable onPress={() => showToast('Use pinch to zoom', 'Zoom')} scaleValue={0.85} haptic="light">
              <View style={{ width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' }}>
                <CornersOut color={colors.text} size={18} />
              </View>
            </AnimatedPressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          <AnimatedPressable
            onPress={processAndSaveVideo}
            disabled={loading}
            style={{ backgroundColor: accent, paddingVertical: 20, borderRadius: radius.xl, alignItems: 'center' }}
            haptic="heavy"
          >
            {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={{ color: colors.bg, fontSize: 18, fontWeight: '900' }}>Save Video</Text>}
          </AnimatedPressable>
        </View>
      </View>
    );
  }

  return (
    <MiniAppShell title={ttx("Studio")} subtitle={ttx("Create")} headerRight={GalleryBtn}>
      <CaptureIntentRail value={intent} accent={ACCENT} onChange={setIntent} />
      
      <Animated.View style={[captureStyle, { marginBottom: 24, marginTop: 12, flexDirection: 'row', gap: 12 }]}>
        <AnimatedPressable
          onPress={launchCamera}
          disabled={loading}
          scaleValue={0.96}
          haptic="heavy"
          style={{
            flex: 1, backgroundColor: ACCENT,
            borderRadius: radius.xl, paddingVertical: 26,
            alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 12,
            shadowColor: ACCENT, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
          }}
        >
          <Camera color={colors.bg} size={28} weight="fill" />
          <Text style={{ color: colors.bg, fontWeight: '900', fontSize: 18, letterSpacing: -0.5 }}>
            Photo
          </Text>
        </AnimatedPressable>

        <AnimatedPressable
          onPress={launchVideoCamera}
          disabled={loading}
          scaleValue={0.96}
          haptic="heavy"
          style={{
            flex: 1, backgroundColor: colors.danger,
            borderRadius: radius.xl, paddingVertical: 26,
            alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 12,
            shadowColor: colors.danger, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
          }}
        >
          <VideoCamera color={colors.bg} size={28} weight="fill" />
          <Text style={{ color: colors.bg, fontWeight: '900', fontSize: 18, letterSpacing: -0.5 }}>
            Video
          </Text>
        </AnimatedPressable>
      </Animated.View>

      {/* Captured gallery */}
      {captured.length > 0 && (
        <Animated.View entering={FadeInDown}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, flex: 1 }}>
              {ttx("CAPTURED ·")} {captured.length}
            </Text>
            <Pressable onPress={() => { persistCaptured([]); setSelected(null); }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{ttx("Clear all")}</Text>
            </Pressable>
          </View>

          {/* Full preview of selected */}
          {selected && (
            <Animated.View entering={ZoomIn.duration(220)} style={{ marginBottom: 14, borderRadius: radius.xl, overflow: 'hidden', position: 'relative', backgroundColor: colors.bgPure }}>
              {selected.type === 'video' ? (
                <View style={{ width: '100%', aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center' }}>
                  <VideoCamera color={colors.textMuted} size={48} weight="duotone" />
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8, fontWeight: '600' }}>Video saved to gallery</Text>
                </View>
              ) : (
                <Image source={{ uri: selected.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.xl }} resizeMode="cover" />
              )}
              <View style={{ position: 'absolute', left: 12, bottom: 12, right: 12, flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, borderRadius: radius.card, padding: 10, backgroundColor: 'rgba(0,0,0,0.6)' }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>{selected.intent ? selected.intent[0].toUpperCase() + selected.intent.slice(1) : 'Capture'}</Text>
                </View>
              </View>
              <AnimatedPressable
                onPress={() => setSelected(null)}
                scaleValue={0.9} haptic="light"
                style={{ position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.xl, padding: 8 }}
              >
                <X color="#fff" size={16} />
              </AnimatedPressable>
            </Animated.View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {captured.map((item, i) => (
              <Animated.View key={item.id} entering={ZoomIn.delay(i * 30).duration(220)}>
                <Pressable
                  onPress={() => setSelected(selected?.uri === item.uri ? null : item)}
                  style={{
                    width: 80, height: 80, borderRadius: radius.card, overflow: 'hidden',
                    borderWidth: 2.5,
                    borderColor: selected?.uri === item.uri ? ACCENT : 'transparent',
                    backgroundColor: colors.surface
                  }}
                >
                  {item.type === 'video' ? (
                    <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                      <Play color={colors.textMuted} size={24} weight="fill" />
                    </View>
                  ) : (
                    <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  )}
                  <AnimatedPressable
                    onPress={() => deleteItem(i)}
                    scaleValue={0.85} haptic="light"
                    style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.md, padding: 3 }}
                  >
                    <Trash color="#ff4444" size={12} weight="fill" />
                  </AnimatedPressable>
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>
        </Animated.View>
      )}
    </MiniAppShell>
  );
}
