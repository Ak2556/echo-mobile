import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, cancelAnimation,
} from 'react-native-reanimated';
import { MMKV } from 'react-native-mmkv';
import {
  ArrowLeft, Microphone, Stop, Play, Pause,
  Trash, MicrophoneStage,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';

const storage = new MMKV({ id: 'voice-memo-store' });

interface Memo {
  id: string;
  title: string;
  uri: string;
  duration: number; // seconds
  createdAt: string;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function loadMemos(): Memo[] {
  try { return JSON.parse(storage.getString('memos') ?? '[]'); } catch { return []; }
}
function saveMemos(memos: Memo[]) {
  storage.set('memos', JSON.stringify(memos));
}

export default function VoiceMemoApp() {
  const { colors } = useTheme();
  const router = useRouter();
  const [memos, setMemos] = useState<Memo[]>(loadMemos);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pulseScale = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseScale.value > 1.05 ? 0.8 : 1,
  }));

  useEffect(() => {
    return () => {
      sound?.unloadAsync();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sound]);

  const startRecording = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Microphone access is required to record voice memos.');
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording: rec } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    setRecording(rec);
    setIsRecording(true);
    setRecordDuration(0);
    timerRef.current = setInterval(() => setRecordDuration(d => d + 1), 1000);
    pulseScale.value = withRepeat(
      withSequence(withTiming(1.18, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1,
    );
  };

  const stopRecording = async () => {
    if (!recording) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    cancelAnimation(pulseScale);
    pulseScale.value = withTiming(1);
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    const uri = recording.getURI();
    setRecording(null);
    setIsRecording(false);
    if (!uri) { showToast('Recording failed', '❌'); return; }
    const duration = recordDuration;
    const memo: Memo = {
      id: Date.now().toString(),
      title: `Recording ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      uri,
      duration,
      createdAt: new Date().toISOString(),
    };
    const updated = [memo, ...memos];
    setMemos(updated);
    saveMemos(updated);
    showToast('Memo saved', '🎙');
  };

  const playMemo = async (memo: Memo) => {
    if (playingId === memo.id) {
      await sound?.pauseAsync();
      setPlayingId(null);
      return;
    }
    if (sound) { await sound.unloadAsync(); setSound(null); }
    const { sound: s } = await Audio.Sound.createAsync(
      { uri: memo.uri },
      { shouldPlay: true },
      (status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          s.unloadAsync();
        }
      },
    );
    setSound(s);
    setPlayingId(memo.id);
  };

  const deleteMemo = (id: string) => {
    if (playingId === id) { sound?.unloadAsync(); setPlayingId(null); setSound(null); }
    const updated = memos.filter(m => m.id !== id);
    setMemos(updated);
    saveMemos(updated);
  };

  const confirmDelete = (memo: Memo) => {
    Alert.alert('Delete memo?', `"${memo.title}" will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMemo(memo.id) },
    ]);
  };

  const saveRename = () => {
    if (!renamingId || !renameText.trim()) { setRenamingId(null); return; }
    const updated = memos.map(m => m.id === renamingId ? { ...m, title: renameText.trim() } : m);
    setMemos(updated);
    saveMemos(updated);
    setRenamingId(null);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
        <AnimatedPressable onPress={() => router.back()} scaleValue={0.88} haptic="light" style={{ marginRight: 12 }}>
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', flex: 1 }}>Voice Memo</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{memos.length} saved</Text>
      </View>

      {/* Recording widget */}
      <Animated.View
        entering={FadeInDown.springify()}
        style={{
          marginHorizontal: 16, marginBottom: 24,
          backgroundColor: colors.surface,
          borderRadius: 28, padding: 28,
          borderWidth: 1, borderColor: isRecording ? '#EF444444' : colors.border,
          alignItems: 'center', gap: 20,
          shadowColor: isRecording ? '#EF4444' : 'transparent',
          shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 4 },
        }}
      >
        {/* Waveform bars */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 48 }}>
          {Array.from({ length: 18 }).map((_, i) => {
            const heights = [12, 20, 32, 18, 38, 24, 14, 42, 28, 36, 16, 44, 22, 34, 18, 28, 40, 14];
            const h = isRecording ? heights[i % heights.length] : 8;
            return (
              <Animated.View key={i} style={[isRecording && pulseStyle]}>
                <View style={{
                  width: 3, height: isRecording ? heights[i] : 8, borderRadius: 2,
                  backgroundColor: isRecording
                    ? (i % 3 === 0 ? '#EF4444' : i % 3 === 1 ? '#EF444499' : '#EF444455')
                    : colors.border,
                  transition: 'height 0.3s',
                }} />
              </Animated.View>
            );
          })}
        </View>

        {/* Duration */}
        <Text style={{
          color: isRecording ? '#EF4444' : colors.textMuted,
          fontSize: 38, fontWeight: '900', letterSpacing: -1, fontVariant: ['tabular-nums'],
        }}>
          {formatTime(recordDuration)}
        </Text>

        {/* Record / Stop button */}
        <Animated.View style={isRecording ? pulseStyle : undefined}>
          <AnimatedPressable
            onPress={isRecording ? stopRecording : startRecording}
            scaleValue={0.92}
            haptic="heavy"
            style={{
              width: 80, height: 80, borderRadius: 40,
              backgroundColor: isRecording ? '#EF4444' : '#6366F1',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: isRecording ? '#EF4444' : '#6366F1',
              shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
              borderWidth: 4, borderColor: isRecording ? '#EF444433' : '#6366F133',
            }}
          >
            {isRecording
              ? <Stop color="#fff" size={28} weight="fill" />
              : <Microphone color="#fff" size={32} weight="fill" />}
          </AnimatedPressable>
        </Animated.View>

        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          {isRecording ? 'Tap to stop recording' : 'Tap to start recording'}
        </Text>
      </Animated.View>

      {/* Memo list */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {memos.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
            <MicrophoneStage color={colors.border} size={48} weight="thin" />
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>No recordings yet</Text>
          </View>
        )}
        {memos.map((memo, i) => (
          <Animated.View key={memo.id} entering={FadeInDown.delay(i * 40).springify()}>
            <View style={{
              backgroundColor: colors.surface, borderRadius: 18,
              borderWidth: 1, borderColor: playingId === memo.id ? '#6366F144' : colors.border,
              padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
            }}>
              {/* Play button */}
              <AnimatedPressable
                onPress={() => playMemo(memo)}
                scaleValue={0.88} haptic="medium"
                style={{
                  width: 48, height: 48, borderRadius: 24,
                  backgroundColor: playingId === memo.id ? '#6366F1' : colors.bg,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1.5, borderColor: playingId === memo.id ? '#6366F1' : colors.border,
                }}
              >
                {playingId === memo.id
                  ? <Pause color="#fff" size={20} weight="fill" />
                  : <Play color="#6366F1" size={20} weight="fill" />}
              </AnimatedPressable>

              {/* Info */}
              <View style={{ flex: 1, gap: 3 }}>
                {renamingId === memo.id ? (
                  <TextInput
                    value={renameText}
                    onChangeText={setRenameText}
                    onBlur={saveRename}
                    onSubmitEditing={saveRename}
                    autoFocus
                    style={{ color: colors.text, fontSize: 15, fontWeight: '700', padding: 0 }}
                  />
                ) : (
                  <Pressable onLongPress={() => { setRenamingId(memo.id); setRenameText(memo.title); }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{memo.title}</Text>
                  </Pressable>
                )}
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {formatTime(memo.duration)} · {formatDate(memo.createdAt)}
                </Text>
              </View>

              {/* Delete */}
              <AnimatedPressable onPress={() => confirmDelete(memo)} scaleValue={0.85} haptic="light">
                <Trash color={colors.textMuted} size={18} />
              </AnimatedPressable>
            </View>
          </Animated.View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
