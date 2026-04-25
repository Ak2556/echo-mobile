import React, { useState, useRef } from 'react';
import {
  View, Text, Pressable, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft, VideoCamera, Images, Play, Pause,
  SpeakerHigh, SpeakerSlash, CornersOut,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';

const COLOR = '#6366F1';

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface VideoMeta {
  uri: string;
  name: string;
  duration: number; // ms
  width?: number;
  height?: number;
}

export default function VideoPlayerApp() {
  const { colors } = useTheme();
  const router = useRouter();
  const videoRef = useRef<Video>(null);
  const [video, setVideo] = useState<VideoMeta | null>(null);
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
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const name = asset.uri.split('/').pop() ?? 'video.mp4';
    setVideo({ uri: asset.uri, name, duration: asset.duration ? asset.duration * 1000 : 0, width: asset.width, height: asset.height });
    setIsPlaying(false);
    setPosition(0);
    setDuration(asset.duration ? asset.duration * 1000 : 0);
    showToast('Video loaded', '🎬');
  };

  const recordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to record videos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 120,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const name = `Recording_${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', '-')}.mp4`;
    setVideo({ uri: asset.uri, name, duration: asset.duration ? asset.duration * 1000 : 0, width: asset.width, height: asset.height });
    setIsPlaying(false);
    setPosition(0);
    showToast('Video recorded', '🎥');
  };

  const onPlaybackUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying);
    setPosition(status.positionMillis);
    if (status.durationMillis) setDuration(status.durationMillis);
    if (status.didJustFinish) setIsPlaying(false);
  };

  const togglePlay = async () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  };

  const toggleMute = async () => {
    if (!videoRef.current) return;
    await videoRef.current.setIsMutedAsync(!isMuted);
    setIsMuted(m => !m);
  };

  const progressPct = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
        <AnimatedPressable onPress={() => router.back()} scaleValue={0.88} haptic="light" style={{ marginRight: 12 }}>
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', flex: 1 }}>Video Player</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Pick / Record buttons */}
        <Animated.View entering={FadeInDown.springify()} style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          <Pressable
            onPress={pickVideo}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingVertical: 14, gap: 8, borderRadius: 18,
              backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
            }}
          >
            <Images color={COLOR} size={20} />
            <Text style={{ color: COLOR, fontWeight: '700', fontSize: 15 }}>From Library</Text>
          </Pressable>
          <Pressable
            onPress={recordVideo}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingVertical: 14, gap: 8, borderRadius: 18,
              backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
            }}
          >
            <VideoCamera color="#EF4444" size={20} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>Record</Text>
          </Pressable>
        </Animated.View>

        {video ? (
          <Animated.View entering={FadeInDown.delay(60).springify()}>
            {/* Video player */}
            <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: '#000', marginBottom: 16 }}>
              <Video
                ref={videoRef}
                source={{ uri: video.uri }}
                style={{ width: '100%', aspectRatio: (video.width && video.height) ? video.width / video.height : 16 / 9 }}
                resizeMode={ResizeMode.CONTAIN}
                onPlaybackStatusUpdate={onPlaybackUpdate}
                shouldPlay={false}
                isMuted={isMuted}
              />
            </View>

            {/* Controls */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 16 }}>
              {/* File name */}
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{video.name}</Text>

              {/* Progress bar */}
              <View>
                <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${progressPct}%`, backgroundColor: COLOR, borderRadius: 2 }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{formatDuration(position)}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{formatDuration(duration)}</Text>
                </View>
              </View>

              {/* Buttons row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                {/* Mute toggle */}
                <AnimatedPressable onPress={toggleMute} scaleValue={0.85} haptic="light">
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
                    {isMuted
                      ? <SpeakerSlash color={colors.textMuted} size={18} />
                      : <SpeakerHigh color={colors.text} size={18} />}
                  </View>
                </AnimatedPressable>

                {/* Play / Pause */}
                <AnimatedPressable onPress={togglePlay} scaleValue={0.9} haptic="medium">
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: COLOR, alignItems: 'center', justifyContent: 'center', shadowColor: COLOR, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
                    {isPlaying
                      ? <Pause color="#fff" size={26} weight="fill" />
                      : <Play color="#fff" size={26} weight="fill" />}
                  </View>
                </AnimatedPressable>

                {/* Fullscreen hint */}
                <AnimatedPressable onPress={() => showToast('Use pinch to zoom', '🔍')} scaleValue={0.85} haptic="light">
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
                    <CornersOut color={colors.text} size={18} />
                  </View>
                </AnimatedPressable>
              </View>

              {/* Meta */}
              {(video.width && video.height) ? (
                <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
                  {video.width} × {video.height} · {formatDuration(video.duration)}
                </Text>
              ) : null}
            </View>
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeInDown.delay(40).springify()}
            style={{ alignItems: 'center', paddingVertical: 80, gap: 16 }}
          >
            <View style={{ width: 88, height: 88, borderRadius: 28, backgroundColor: COLOR + '20', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLOR + '30' }}>
              <VideoCamera color={COLOR} size={40} weight="duotone" />
            </View>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>No Video Loaded</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', maxWidth: 240 }}>
              Pick a video from your library or record a new one to start playing.
            </Text>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
