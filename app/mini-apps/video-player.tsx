import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  VideoCamera, Images, Play, Pause,
  SpeakerHigh, SpeakerSlash, CornersOut,
} from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniEmptyState } from '../../components/mini-apps/MiniKit';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface VideoMeta {
  uri: string;
  name: string;
  duration: number;
  width?: number;
  height?: number;
}

export default function VideoPlayerApp() {
  const { colors } = useTheme();
  const accent = colors.accent;
  const videoRef = useRef<VideoView>(null);
  const [video, setVideo] = useState<VideoMeta | null>(null);
  const player = useVideoPlayer(video?.uri ?? null, p => {
    p.muted = false;
    p.timeUpdateEventInterval = 0.25;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to pick videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const name = asset.uri.split('/').pop() ?? 'video.mp4';
    setVideo({ uri: asset.uri, name, duration: asset.duration ? asset.duration * 1000 : 0, width: asset.width, height: asset.height });
    setIsPlaying(false);
    setPosition(0);
    setDuration(asset.duration ? asset.duration * 1000 : 0);
    showToast('Video loaded', 'Loaded');
  };

  const recordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to record videos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 120,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const name = `Recording_${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', '-')}.mp4`;
    setVideo({ uri: asset.uri, name, duration: asset.duration ? asset.duration * 1000 : 0, width: asset.width, height: asset.height });
    setIsPlaying(false);
    setPosition(0);
    showToast('Video recorded', 'Recorded');
  };

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
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
  }, [player]);

  const togglePlay = async () => {
    if (isPlaying) player.pause();
    else player.play();
  };

  const toggleMute = async () => {
    setIsMuted(m => !m);
  };

  const progressPct = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <MiniAppShell title="Video Player" subtitle="Pick or record a video">
      {/* Pick / Record buttons */}
      <Animated.View entering={FadeInDown.duration(220)} style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <GlassPanel
          variant="medium"
          borderRadius={18}
          contentStyle={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 }}
        >
          <Pressable onPress={pickVideo} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Images color={accent} size={20} />
            <Text style={{ color: accent, fontWeight: '700', fontSize: 15 }}>From Library</Text>
          </Pressable>
        </GlassPanel>
        <GlassPanel
          variant="medium"
          borderRadius={18}
          contentStyle={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 }}
        >
          <Pressable onPress={recordVideo} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <VideoCamera color={colors.danger} size={20} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>Record</Text>
          </Pressable>
        </GlassPanel>
      </Animated.View>

      {video ? (
        <Animated.View entering={FadeInDown.delay(60).duration(220)}>
          {/* Video player */}
          <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: '#000', marginBottom: 14 }}>
            <VideoView
              ref={videoRef}
              player={player}
              style={{ width: '100%', aspectRatio: (video.width && video.height) ? video.width / video.height : 16 / 9 }}
              contentFit="contain"
              nativeControls={false}
              fullscreenOptions={{ enable: true }}
            />
          </View>

          {/* Controls */}
          <GlassPanel variant="medium" borderRadius={20} contentStyle={{ padding: 20 }} style={{ gap: 16 }}>
            {/* File name */}
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{video.name}</Text>

            {/* Progress bar */}
            <View>
              <View style={{ height: 4, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${progressPct}%`, backgroundColor: accent, borderRadius: 2 }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{formatDuration(position)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{formatDuration(duration)}</Text>
              </View>
            </View>

            {/* Buttons row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
              <AnimatedPressable onPress={toggleMute} scaleValue={0.85} haptic="light">
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.glassBorder }}>
                  {isMuted
                    ? <SpeakerSlash color={colors.textMuted} size={18} />
                    : <SpeakerHigh color={colors.text} size={18} />}
                </View>
              </AnimatedPressable>

              <AnimatedPressable onPress={togglePlay} scaleValue={0.9} haptic="medium">
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', shadowColor: accent, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
                  {isPlaying
                    ? <Pause color="#fff" size={26} weight="fill" />
                    : <Play color="#fff" size={26} weight="fill" />}
                </View>
              </AnimatedPressable>

              <AnimatedPressable onPress={() => showToast('Use pinch to zoom', 'Zoom')} scaleValue={0.85} haptic="light">
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.glassBorder }}>
                  <CornersOut color={colors.text} size={18} />
                </View>
              </AnimatedPressable>
            </View>

            {(video.width && video.height) ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
                {video.width} × {video.height} · {formatDuration(video.duration)}
              </Text>
            ) : null}
          </GlassPanel>

          <EdgeFeaturePanel
            appName="Video Player"
            accent={accent}
            headline="Review clips with purpose"
            caption="Turn videos into notes, progress updates, feedback loops, or publish-ready summaries."
            metrics={[
              { label: 'Duration', value: formatDuration(duration || video.duration) },
              { label: 'Progress', value: `${Math.round(progressPct)}%` },
              { label: 'Sound', value: isMuted ? 'Muted' : 'On' },
            ]}
            prompt="Help me review this video and extract useful feedback, next actions, or a post summary."
            shareText={`Video review: ${video.name}, duration ${formatDuration(duration || video.duration)}, progress ${Math.round(progressPct)}%.`}
            publishTitle="Video review"
            publishBody={`Reviewed ${video.name}. Duration ${formatDuration(duration || video.duration)}.`}
          />
        </Animated.View>
      ) : (
        <MiniEmptyState
          accent={accent}
          icon={<VideoCamera color={colors.textMuted} size={44} weight="duotone" />}
          title="No video loaded"
          subtitle="Pick a video from your library or record a new one to start playing."
        />
      )}
    </MiniAppShell>
  );
}
