import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Image, Pressable,
  ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown, ZoomIn, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import {
  Camera, VideoCamera, CameraRotate,
  CameraPlus, Trash, X, SealCheck, ImageSquare, FolderSimple, Stack, Tag,
} from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniCommandDeck } from '../../components/mini-apps/MiniKit';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';
import { CameraCapture, CameraCaptureType, loadCameraCaptures, saveCameraCaptures } from '../../lib/cameraCaptures';
import { uploadMiniAppMedia } from '../../lib/miniAppMedia';

type Mode = CameraCaptureType;
type CaptureIntent = 'proof' | 'progress' | 'listing' | 'document';

const VIDEO_COLOR = '#EF4444';
const INTENTS: { key: CaptureIntent; label: string; detail: string; icon: any }[] = [
  { key: 'proof', label: 'Proof', detail: 'Evidence', icon: SealCheck },
  { key: 'progress', label: 'Progress', detail: 'Before/after', icon: Stack },
  { key: 'listing', label: 'Listing', detail: 'Sell-ready', icon: Tag },
  { key: 'document', label: 'Document', detail: 'Scan-like', icon: FolderSimple },
];

function CaptureIntentRail({ value, accent, onChange }: { value: CaptureIntent; accent: string; onChange: (v: CaptureIntent) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 9 }}>
        Capture intent
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
                borderRadius: 17,
                paddingHorizontal: 12,
                justifyContent: 'center',
                backgroundColor: active ? accent : colors.surface,
                borderWidth: 1,
                borderColor: active ? `${accent}AA` : colors.glassBorder,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon color={active ? '#fff' : accent} size={17} weight="bold" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: active ? '#fff' : colors.text, fontSize: 14, fontWeight: '900' }}>{intent.label}</Text>
                  <Text style={{ color: active ? 'rgba(255,255,255,0.76)' : colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 }}>{intent.detail}</Text>
                </View>
              </View>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

function CaptureReadiness({ accent, mode, intent, captured }: { accent: string; mode: Mode; intent: CaptureIntent; captured: CameraCapture[] }) {
  const { colors } = useTheme();
  const synced = captured.filter(c => c.storagePath).length;
  const currentIntent = captured.filter(c => c.intent === intent).length;
  const chips = [
    { label: 'Mode', value: mode === 'photo' ? 'Photo' : 'Video' },
    { label: 'Intent', value: INTENTS.find(i => i.key === intent)?.label ?? 'Proof' },
    { label: 'Synced', value: `${synced}/${captured.length}` },
    { label: 'Set', value: `${currentIntent}` },
  ];
  return (
    <GlassPanel variant="light" borderRadius={20} contentStyle={{ padding: 15, gap: 12 }} style={{ marginBottom: 14, borderColor: `${accent}38` }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: `${accent}20`, alignItems: 'center', justifyContent: 'center' }}>
          <ImageSquare color={accent} size={21} weight="fill" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900' }}>Capture cockpit</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, fontWeight: '600', marginTop: 2 }}>Intent, proof, sync.</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {chips.map(chip => (
          <View key={chip.label} style={{ flex: 1, minHeight: 52, borderRadius: 15, padding: 9, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
            <Text style={{ color: colors.textMuted, fontSize: 9.5, fontWeight: '900', textTransform: 'uppercase' }}>{chip.label}</Text>
            <Text style={{ color: chip.label === 'Intent' ? accent : colors.text, fontSize: 13.5, fontWeight: '900', marginTop: 6 }} numberOfLines={1}>{chip.value}</Text>
          </View>
        ))}
      </View>
    </GlassPanel>
  );
}

export default function CameraApp() {
  const { colors } = useTheme();
  const accent = colors.accent;
  const [mode, setMode] = useState<Mode>('photo');
  const [intent, setIntent] = useState<CaptureIntent>('proof');
  const [captured, setCaptured] = useState<CameraCapture[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CameraCapture | null>(null);
  const captureScale = useSharedValue(1);

  const captureStyle = useAnimatedStyle(() => ({ transform: [{ scale: captureScale.value }] }));

  const ACCENT = mode === 'photo' ? accent : VIDEO_COLOR;

  useEffect(() => {
    loadCameraCaptures().then(setCaptured).catch(() => setCaptured([]));
  }, []);

  const persistCaptured = (next: CameraCapture[]) => {
    setCaptured(next);
    void saveCameraCaptures(next);
  };

  const saveCapture = (asset: ImagePicker.ImagePickerAsset, type: Mode) => {
    const item: CameraCapture = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      uri: asset.uri,
      type,
      intent,
      width: asset.width,
      height: asset.height,
      createdAt: new Date().toISOString(),
    };
    const next = [item, ...captured];
    persistCaptured(next);
    void (async () => {
      try {
        const uploaded = await uploadMiniAppMedia('camera', asset.uri, {
          fileName: asset.fileName,
          mimeType: asset.mimeType,
        });
        if (!uploaded?.path) return;
        setCaptured(prev => {
          const synced = prev.map(capture => capture.id === item.id ? { ...capture, storagePath: uploaded.path } : capture);
          void saveCameraCaptures(synced);
          return synced;
        });
        setSelected(prev => prev?.id === item.id ? { ...prev, storagePath: uploaded.path } : prev);
      } catch {
        showToast('Saved on this device. Cloud media sync will retry after another edit.', 'Camera');
      }
    })();
  };

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take photos and videos.');
      return;
    }
    captureScale.value = withSpring(0.88, {}, () => { captureScale.value = withSpring(1); });
    setLoading(true);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: mode === 'photo' ? ['images'] : ['videos'],
      quality: 0.92,
      allowsEditing: mode === 'photo',
      videoMaxDuration: 60,
    });
    setLoading(false);
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      saveCapture(asset, mode);
      showToast(mode === 'photo' ? 'Photo captured' : 'Video saved', 'Saved');
    }
  };

  const launchGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const type: Mode = asset.type === 'video' ? 'video' : 'photo';
      saveCapture(asset, type);
      showToast('Added from library', 'Added');
    }
  };

  const deleteItem = (index: number) => {
    if (selected === captured[index]) setSelected(null);
    persistCaptured(captured.filter((_, i) => i !== index));
  };

  const GalleryBtn = (
    <AnimatedPressable onPress={launchGallery} scaleValue={0.9} haptic="light"
      style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 10 }}>
      <CameraPlus color={colors.textMuted} size={20} />
    </AnimatedPressable>
  );

  return (
    <MiniAppShell title="Camera" subtitle="Prove" headerRight={GalleryBtn}>
      <MiniCommandDeck
        accent={ACCENT}
        title="Proof and progress capture"
        subtitle="Photos, clips, evidence."
        metrics={[
          { label: 'Total', value: `${captured.length}`, detail: 'captures' },
          { label: 'Photos', value: `${captured.filter(item => item.type === 'photo').length}`, detail: 'still' },
          { label: 'Videos', value: `${captured.filter(item => item.type === 'video').length}`, detail: 'motion' },
        ]}
        chips={['Progress proof', 'Listing media', 'Post-ready']}
      />
      <CaptureReadiness accent={ACCENT} mode={mode} intent={intent} captured={captured} />
      <CaptureIntentRail value={intent} accent={ACCENT} onChange={setIntent} />
      {/* Viewfinder panel */}
      <Animated.View
        entering={FadeInDown.duration(220)}
        style={{
          borderRadius: 28,
          overflow: 'hidden',
          aspectRatio: 3 / 4,
          backgroundColor: colors.isDark ? '#0D0D0D' : '#1A1A1A',
          borderWidth: 1.5,
          borderColor: ACCENT + '44',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
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
            ? <Camera color={ACCENT} size={72} weight="duotone" />
            : <VideoCamera color={ACCENT} size={72} weight="duotone" />}
          <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 40 }}>
            {mode === 'photo' ? 'Tap the capture button to\ntake a photo' : 'Tap the capture button to\nstart recording'}
          </Text>
          <View style={{ marginTop: 2, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: ACCENT + '22', borderWidth: 1, borderColor: ACCENT + '44' }}>
            <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '900' }}>{INTENTS.find(i => i.key === intent)?.label}</Text>
          </View>
        </View>

        {/* Mode badge */}
        <View style={{
          position: 'absolute', top: 16, left: 16,
          flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: ACCENT + '22',
          borderRadius: 8, borderWidth: 1, borderColor: ACCENT + '44',
          paddingHorizontal: 10, paddingVertical: 4,
        }}>
          {mode === 'video' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: VIDEO_COLOR }} />}
          <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>
            {mode === 'photo' ? 'PHOTO' : 'VIDEO'}
          </Text>
        </View>

        <View style={{ position: 'absolute', top: 16, right: 16 }}>
          <CameraRotate color="rgba(255,255,255,0.25)" size={20} />
        </View>
      </Animated.View>

      {/* Mode switcher */}
      <GlassPanel variant="light" borderRadius={16} contentStyle={{ flexDirection: 'row', padding: 4 }} style={{ marginBottom: 14 }}>
        {(['photo', 'video'] as Mode[]).map(m => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={{
              flex: 1, paddingVertical: 12, borderRadius: 12,
              alignItems: 'center', justifyContent: 'center',
              flexDirection: 'row', gap: 8,
              backgroundColor: mode === m ? (m === 'photo' ? accent : VIDEO_COLOR) : 'transparent',
            }}
          >
            {m === 'photo'
              ? <Camera color={mode === m ? '#fff' : colors.textMuted} size={16} weight="fill" />
              : <VideoCamera color={mode === m ? '#fff' : colors.textMuted} size={16} weight="fill" />}
            <Text style={{ color: mode === m ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 14, textTransform: 'capitalize' }}>
              {m}
            </Text>
          </Pressable>
        ))}
      </GlassPanel>

      {/* Capture button */}
      <Animated.View style={[captureStyle, { marginBottom: 24 }]}>
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

      <EdgeFeaturePanel
        appName="Camera"
        accent={ACCENT}
        headline="Capture with intent"
        caption="Use photos and clips as proof, progress updates, listing media, or Echo drafts."
        metrics={[
          { label: 'Captured', value: `${captured.length}` },
          { label: 'Photos', value: `${captured.filter(item => item.type === 'photo').length}` },
          { label: 'Videos', value: `${captured.filter(item => item.type === 'video').length}` },
        ]}
        prompt="Help me choose the best way to use this capture as proof, a post, or a useful progress update."
        shareText={`Camera captures: ${captured.length} total, ${captured.filter(item => item.type === 'photo').length} photos, ${captured.filter(item => item.type === 'video').length} videos.`}
        publishTitle="Captured progress"
        publishBody={`Captured ${captured.length} media items: ${captured.filter(item => item.type === 'photo').length} photos and ${captured.filter(item => item.type === 'video').length} videos.`}
      />

      {/* Captured gallery */}
      {captured.length > 0 && (
        <Animated.View entering={FadeInDown}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, flex: 1 }}>
              CAPTURED · {captured.length}
            </Text>
            <Pressable onPress={() => { persistCaptured([]); setSelected(null); }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Clear all</Text>
            </Pressable>
          </View>

          {/* Full preview of selected */}
          {selected && (
            <Animated.View entering={ZoomIn.duration(220)} style={{ marginBottom: 14, borderRadius: 20, overflow: 'hidden', position: 'relative' }}>
              <Image source={{ uri: selected.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 20 }} resizeMode="cover" />
              <View style={{ position: 'absolute', left: 12, bottom: 12, right: 12, flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, borderRadius: 14, padding: 10, backgroundColor: 'rgba(0,0,0,0.58)' }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>{selected.intent ? selected.intent[0].toUpperCase() + selected.intent.slice(1) : 'Capture'}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                    {selected.width && selected.height ? `${selected.width} x ${selected.height}` : selected.type}
                  </Text>
                </View>
                <View style={{ borderRadius: 14, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: selected.storagePath ? 'rgba(34,197,94,0.26)' : 'rgba(255,255,255,0.14)' }}>
                  <Text style={{ color: selected.storagePath ? '#86EFAC' : '#fff', fontSize: 11, fontWeight: '900' }}>{selected.storagePath ? 'SYNCED' : 'LOCAL'}</Text>
                </View>
              </View>
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
              <Animated.View key={item.id} entering={ZoomIn.delay(i * 30).duration(220)}>
                <Pressable
                  onPress={() => setSelected(selected?.uri === item.uri ? null : item)}
                  style={{
                    width: 80, height: 80, borderRadius: 14, overflow: 'hidden',
                    borderWidth: 2.5,
                    borderColor: selected?.uri === item.uri ? ACCENT : (item.type === 'photo' ? accent + '33' : VIDEO_COLOR + '33'),
                  }}
                >
                  <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  {item.type === 'video' && (
                    <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
                      <VideoCamera color="#fff" size={18} weight="fill" />
                    </View>
                  )}
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
    </MiniAppShell>
  );
}
