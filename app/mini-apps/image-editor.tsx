import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import {
  Camera,
  DownloadSimple,
  FolderOpen,
  ImageSquare,
  Scissors,
  Sliders,
  Sparkle,
  Trash,
  VideoCamera,
} from 'phosphor-react-native';
import { PhotoEditor } from '../../components/social/PhotoEditor';
import { VideoPreview } from '../../components/social/VideoPreview';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import {
  MiniButton,
  MiniCard,
  MiniCommandDeck,
  MiniEmptyState,
  MiniSectionHeader,
} from '../../components/mini-apps/MiniKit';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useTheme } from '../../lib/theme';

const ACCENT = '#EC4899';
const COLLAGE_LIMIT = 6;
const VIDEO_MAX_DURATION_SECONDS = 180;

type CollageLayout = 'grid' | 'poster' | 'strip';

type ImageState = {
  originalUri: string;
  editedUri: string;
  width: number;
  height: number;
  fileName?: string | null;
};

type VideoState = {
  originalUri: string;
  editedUri: string;
  width: number;
  height: number;
  durationMs: number;
  fileName?: string | null;
};

type OptionalManipulator = {
  manipulateAsync: (uri: string, actions: unknown[], options: { compress?: number; format?: unknown }) => Promise<{ uri: string; width: number; height: number }>;
  SaveFormat: { JPEG: unknown };
};

function getManipulator(): OptionalManipulator | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-manipulator') as OptionalManipulator;
  } catch {
    return null;
  }
}

function megapixels(width: number, height: number): string {
  const mp = (width * height) / 1_000_000;
  if (!Number.isFinite(mp) || mp <= 0) return '0';
  return mp >= 10 ? mp.toFixed(0) : mp.toFixed(1);
}

function shortSize(width: number, height: number): string {
  if (!width || !height) return 'Unknown';
  return `${Math.round(width)} x ${Math.round(height)}`;
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function videoExportPreset() {
  return Platform.OS === 'ios'
    ? ImagePicker.VideoExportPreset.H264_1280x720
    : undefined;
}

export default function ImageEditorApp() {
  const { colors } = useTheme();
  const [image, setImage] = useState<ImageState | null>(null);
  const [video, setVideo] = useState<VideoState | null>(null);
  const [collageUris, setCollageUris] = useState<string[]>([]);
  const [collageLayout, setCollageLayout] = useState<CollageLayout>('grid');
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const collageRef = useRef<View>(null);

  const changed = !!image && image.originalUri !== image.editedUri;
  const activeKind = video ? 'video' : image ? 'image' : 'empty';
  const metrics = useMemo(() => ([
    { label: 'Media', value: activeKind === 'empty' ? '0' : '1', detail: activeKind === 'video' ? 'video' : activeKind === 'image' ? 'image' : 'none' },
    { label: 'Size', value: image ? shortSize(image.width, image.height).split(' ')[0] : video ? shortSize(video.width, video.height).split(' ')[0] : '-', detail: image ? shortSize(image.width, image.height) : video ? shortSize(video.width, video.height) : 'Pick one' },
    { label: activeKind === 'video' ? 'Time' : 'MP', value: video ? formatDuration(video.durationMs) : image ? megapixels(image.width, image.height) : '-', detail: activeKind === 'video' ? 'clip' : 'resolution' },
  ]), [activeKind, image, video]);

  const readSize = (uri: string): Promise<{ width: number; height: number }> =>
    new Promise(resolve => {
      RNImage.getSize(uri, (width, height) => resolve({ width, height }), () => resolve({ width: 0, height: 0 }));
    });

  const setPickedAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    const size = asset.width && asset.height
      ? { width: asset.width, height: asset.height }
      : await readSize(asset.uri);
    setImage({
      originalUri: asset.uri,
      editedUri: asset.uri,
      width: size.width,
      height: size.height,
      fileName: asset.fileName,
    });
    setVideo(null);
    showToast('Image ready', 'Editor');
  };

  const setPickedVideo = (asset: ImagePicker.ImagePickerAsset, edited = false) => {
    const durationMs = Math.max(0, asset.duration ?? 0);
    setVideo({
      originalUri: asset.uri,
      editedUri: asset.uri,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      durationMs,
      fileName: asset.fileName,
    });
    setImage(null);
    setCollageUris([]);
    showToast(edited ? 'Edited video ready' : 'Video ready', 'Editor');
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      await setPickedAsset(result.assets[0]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take a photo for editing.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      await setPickedAsset(result.assets[0]);
    }
  };

  const pickVideo = async (edited = true) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to choose videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: edited,
      quality: 1,
      videoMaxDuration: VIDEO_MAX_DURATION_SECONDS,
      videoExportPreset: videoExportPreset(),
    });
    if (!result.canceled && result.assets[0]) {
      setPickedVideo(result.assets[0], edited);
    }
  };

  const recordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to record a video.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      allowsEditing: true,
      quality: 1,
      videoMaxDuration: VIDEO_MAX_DURATION_SECONDS,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
      videoExportPreset: videoExportPreset(),
    });
    if (!result.canceled && result.assets[0]) {
      setPickedVideo(result.assets[0], true);
    }
  };

  const pickCollage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: COLLAGE_LIMIT,
      quality: 1,
    });
    if (!result.canceled) {
      const uris = result.assets.map(asset => asset.uri).slice(0, COLLAGE_LIMIT);
      if (uris.length < 2) {
        showToast('Choose at least 2 photos', 'Collage');
        return;
      }
      setCollageUris(uris);
      showToast(`${uris.length} photos selected`, 'Collage');
    }
  };

  const applyEditedUri = async (uri: string) => {
    const size = await readSize(uri);
    setImage(prev => prev ? { ...prev, editedUri: uri, width: size.width, height: size.height } : prev);
    setEditorOpen(false);
    showToast('Edit applied', 'Image');
  };

  const resetImage = () => {
    if (!image) return;
    setImage({ ...image, editedUri: image.originalUri });
    showToast('Reset to original', 'Image');
  };

  const clearMedia = () => {
    setImage(null);
    setVideo(null);
    setCollageUris([]);
  };

  const optimize = async () => {
    if (!image || busy) return;
    const m = getManipulator();
    if (!m) {
      showToast('Image tools need the latest build', 'Update needed');
      return;
    }
    setBusy(true);
    try {
      const result = await m.manipulateAsync(image.editedUri, [], {
        compress: 0.78,
        format: m.SaveFormat.JPEG,
      });
      setImage(prev => prev ? { ...prev, editedUri: result.uri, width: result.width, height: result.height } : prev);
      showToast('Optimized copy ready', 'Image');
    } catch {
      showToast('Could not optimize image', 'Error');
    } finally {
      setBusy(false);
    }
  };

  const shareImage = async () => {
    if (!image) return;
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      showToast('Sharing is not available here', 'Image');
      return;
    }
    await Sharing.shareAsync(image.editedUri, {
      mimeType: 'image/jpeg',
      dialogTitle: 'Share edited image',
    });
  };

  const shareVideo = async () => {
    if (!video) return;
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      showToast('Sharing is not available here', 'Video');
      return;
    }
    await Sharing.shareAsync(video.editedUri, {
      mimeType: 'video/mp4',
      dialogTitle: 'Share edited video',
    });
  };

  const createCollage = async () => {
    if (collageUris.length < 2 || !collageRef.current || busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(collageRef.current, {
        format: 'jpg',
        quality: 0.92,
        result: 'tmpfile',
      });
      const size = await readSize(uri);
      setImage({
        originalUri: uri,
        editedUri: uri,
        width: size.width,
        height: size.height,
        fileName: 'Echo collage',
      });
      showToast('Collage ready', 'Image');
    } catch {
      showToast('Could not create collage', 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MiniAppShell title="Image Editor" subtitle="Polish">
      <MiniCommandDeck
        accent={ACCENT}
        title="Quick edits before you post"
        subtitle="Photos, collages, and trimmed videos."
        metrics={metrics}
        chips={['Crop', 'Trim', 'Record', 'Export']}
      />

      {activeKind === 'empty' ? (
        <MiniEmptyState
          accent={ACCENT}
          icon={<ImageSquare color={ACCENT} size={38} weight="bold" />}
          title="Pick media"
          subtitle="Start from a photo, collage, or video. Every action creates a usable media file."
          actionLabel="Choose image"
          onAction={pickImage}
        />
      ) : image ? (
        <>
          <MiniSectionHeader label="Canvas" actionLabel={changed ? 'Reset' : undefined} onAction={resetImage} accent={ACCENT} />
          <MiniCard accent={ACCENT} elevated padding={0} style={{ marginBottom: 14, overflow: 'hidden' }}>
            <View style={{ aspectRatio: 4 / 5, backgroundColor: colors.bg }}>
              <Image
                source={{ uri: image.editedUri }}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                transition={140}
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.55)']}
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 96 }}
                pointerEvents="none"
              />
              <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Inter_800ExtraBold' }} numberOfLines={1}>
                    {image.fileName || 'Edited image'}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {shortSize(image.width, image.height)} {changed ? 'edited' : 'original'}
                  </Text>
                </View>
                {busy ? <ActivityIndicator color="#fff" /> : null}
              </View>
            </View>
          </MiniCard>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <MiniButton
              label="Edit"
              accent={ACCENT}
              icon={<Sliders color="#fff" size={18} weight="bold" />}
              onPress={() => setEditorOpen(true)}
              style={{ flex: 1 }}
            />
            <MiniButton
              label="Share"
              accent={ACCENT}
              variant="secondary"
              icon={<DownloadSimple color={colors.text} size={18} weight="bold" />}
              onPress={shareImage}
              style={{ flex: 1 }}
            />
          </View>

          <MiniSectionHeader label="Fast actions" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <QuickAction icon={<Sparkle color={ACCENT} size={18} weight="fill" />} label="Optimize" onPress={optimize} />
            <QuickAction icon={<FolderOpen color={ACCENT} size={18} weight="bold" />} label="Replace" onPress={pickImage} />
            <QuickAction icon={<Camera color={ACCENT} size={18} weight="bold" />} label="Camera" onPress={takePhoto} />
            <QuickAction icon={<Trash color="#EF4444" size={18} weight="bold" />} label="Clear" onPress={clearMedia} danger />
          </View>
        </>
      ) : video ? (
        <>
          <MiniSectionHeader label="Video" actionLabel="Clear" onAction={clearMedia} accent={ACCENT} />
          <MiniCard accent={ACCENT} elevated padding={0} style={{ marginBottom: 14, overflow: 'hidden' }}>
            <VideoPreview uri={video.editedUri} height={260} borderRadius={0} />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.65)']}
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 }}
              pointerEvents="none"
            />
            <View style={{ position: 'absolute', left: 14, right: 14, bottom: 13, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Inter_800ExtraBold' }} numberOfLines={1}>
                  {video.fileName || 'Edited video'}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                  {shortSize(video.width, video.height)} · {formatDuration(video.durationMs)}
                </Text>
              </View>
            </View>
          </MiniCard>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <MiniButton
              label="Trim"
              accent={ACCENT}
              icon={<Scissors color="#fff" size={18} weight="bold" />}
              onPress={() => pickVideo(true)}
              style={{ flex: 1 }}
            />
            <MiniButton
              label="Share"
              accent={ACCENT}
              variant="secondary"
              icon={<DownloadSimple color={colors.text} size={18} weight="bold" />}
              onPress={shareVideo}
              style={{ flex: 1 }}
            />
          </View>

          <MiniSectionHeader label="Fast actions" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <QuickAction icon={<Scissors color={ACCENT} size={18} weight="bold" />} label="Trim import" onPress={() => pickVideo(true)} />
            <QuickAction icon={<FolderOpen color={ACCENT} size={18} weight="bold" />} label="Replace" onPress={() => pickVideo(false)} />
            <QuickAction icon={<VideoCamera color={ACCENT} size={18} weight="bold" />} label="Record" onPress={recordVideo} />
            <QuickAction icon={<Trash color="#EF4444" size={18} weight="bold" />} label="Clear" onPress={clearMedia} danger />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
            Trim uses the native video editor and exports a new clip. Filters are intentionally photo-only until a video renderer is added.
          </Text>
        </>
      ) : null}

      {collageUris.length > 0 ? (
        <>
          <MiniSectionHeader label="Collage maker" actionLabel="Clear" onAction={() => setCollageUris([])} accent={ACCENT} />
          <MiniCard accent={ACCENT} padding={12} style={{ marginBottom: 14 }}>
            <CollageCanvas ref={collageRef} uris={collageUris} layout={collageLayout} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {(['grid', 'poster', 'strip'] as CollageLayout[]).map(layout => (
                <LayoutButton
                  key={layout}
                  label={layout}
                  active={collageLayout === layout}
                  onPress={() => setCollageLayout(layout)}
                />
              ))}
            </View>
            <MiniButton
              label={busy ? 'Creating...' : 'Create collage'}
              accent={ACCENT}
              icon={<ImageSquare color="#fff" size={18} weight="bold" />}
              onPress={createCollage}
              style={{ marginTop: 12 }}
            />
          </MiniCard>
        </>
      ) : null}

      {activeKind === 'empty' ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <MiniButton
              label="Library"
              accent={ACCENT}
              icon={<FolderOpen color="#fff" size={18} weight="bold" />}
              onPress={pickImage}
              style={{ flex: 1 }}
            />
            <MiniButton
              label="Camera"
              accent={ACCENT}
              variant="secondary"
              icon={<Camera color={colors.text} size={18} weight="bold" />}
              onPress={takePhoto}
              style={{ flex: 1 }}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <MiniButton
              label="Video"
              accent={ACCENT}
              variant="secondary"
              icon={<VideoCamera color={colors.text} size={18} weight="bold" />}
              onPress={() => pickVideo(true)}
              style={{ flex: 1 }}
            />
            <MiniButton
              label="Record"
              accent={ACCENT}
              variant="secondary"
              icon={<Camera color={colors.text} size={18} weight="bold" />}
              onPress={recordVideo}
              style={{ flex: 1 }}
            />
          </View>
          <MiniButton
            label="Make collage"
            accent={ACCENT}
            variant="secondary"
            icon={<ImageSquare color={colors.text} size={18} weight="bold" />}
            onPress={pickCollage}
          />
        </View>
      ) : null}

      <PhotoEditor
        visible={editorOpen}
        uri={image?.editedUri ?? null}
        onDone={applyEditedUri}
        onCancel={() => setEditorOpen(false)}
      />
    </MiniAppShell>
  );
}

const CollageCanvas = React.forwardRef<View, { uris: string[]; layout: CollageLayout }>(
  function CollageCanvas({ uris, layout }, ref) {
    const { colors } = useTheme();
    const shown = uris.slice(0, COLLAGE_LIMIT);

    return (
      <View
        ref={ref}
        collapsable={false}
        style={{
          width: '100%',
          aspectRatio: 1,
          borderRadius: 18,
          overflow: 'hidden',
          backgroundColor: colors.bg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.glassBorder,
        }}
      >
        {layout === 'poster' ? <PosterCollage uris={shown} /> : null}
        {layout === 'strip' ? <StripCollage uris={shown} /> : null}
        {layout === 'grid' ? <GridCollage uris={shown} /> : null}
      </View>
    );
  },
);

function GridCollage({ uris }: { uris: string[] }) {
  const rows = uris.length <= 2
    ? [uris]
    : uris.length <= 4
      ? [uris.slice(0, 2), uris.slice(2)]
      : [uris.slice(0, 2), uris.slice(2, 4), uris.slice(4)];

  return (
    <View style={{ flex: 1, gap: 4, padding: 4 }}>
      {rows.map((row, index) => (
        <View key={`row-${index}`} style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
          {row.map(uri => <CollageImage key={uri} uri={uri} />)}
        </View>
      ))}
    </View>
  );
}

function PosterCollage({ uris }: { uris: string[] }) {
  const [lead, ...rest] = uris;
  return (
    <View style={{ flex: 1, gap: 4, padding: 4 }}>
      <View style={{ flex: 1.35 }}>
        <CollageImage uri={lead} />
      </View>
      <View style={{ flex: 0.75, flexDirection: 'row', gap: 4 }}>
        {rest.slice(0, 4).map(uri => <CollageImage key={uri} uri={uri} />)}
      </View>
    </View>
  );
}

function StripCollage({ uris }: { uris: string[] }) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: 4, padding: 4 }}>
      {uris.map(uri => <CollageImage key={uri} uri={uri} />)}
    </View>
  );
}

function CollageImage({ uri }: { uri: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, minHeight: 0, borderRadius: 13, overflow: 'hidden', backgroundColor: '#111' }}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={80} />
    </View>
  );
}

function LayoutButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, font } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      scaleValue={0.94}
      haptic="light"
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        flex: 1,
        minHeight: 38,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? ACCENT : colors.surfaceHover,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? ACCENT : colors.glassBorder,
      }}
    >
      <Text style={[font.bodyBold, { color: active ? '#fff' : colors.textSecondary, fontSize: 12, textTransform: 'capitalize' }]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { colors, font } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      scaleValue={0.94}
      haptic={danger ? 'medium' : 'light'}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: '48%',
        minHeight: 58,
        borderRadius: 17,
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: danger ? '#EF444455' : colors.glassBorder,
        paddingHorizontal: 13,
        justifyContent: 'center',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        {icon}
        <Text style={[font.bodyBold, { color: danger ? '#EF4444' : colors.text, fontSize: 13.5 }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </AnimatedPressable>
  );
}
