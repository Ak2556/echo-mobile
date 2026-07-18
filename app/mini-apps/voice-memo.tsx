import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, Alert, TextInput,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioPlayer,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, cancelAnimation,
} from 'react-native-reanimated';
import {
  Microphone, Stop, Play, Pause,
  Trash, MicrophoneStage,
} from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { MiniCommandDeck, MiniEmptyState } from '../../components/mini-apps/MiniKit';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';
import { getMiniAppMediaUrl, uploadMiniAppMedia } from '../../lib/miniAppMedia';
import { Memo, formatMemoDate, formatMemoTime, loadMemos, saveMemos } from '../../lib/voiceMemos';

const REC_COLOR = '#EF4444';

async function playbackCandidates(memo: Memo): Promise<string[]> {
  const candidates: string[] = [];
  if (/^https?:\/\//i.test(memo.uri)) {
    candidates.push(memo.uri);
  } else if (memo.uri) {
    try {
      const info = await FileSystem.getInfoAsync(memo.uri);
      if (info.exists) candidates.push(memo.uri);
    } catch {}
  }
  const remote = await getMiniAppMediaUrl(memo.storagePath);
  if (remote) candidates.push(remote);
  return Array.from(new Set(candidates));
}

export default function VoiceMemoApp() {
  const { colors } = useTheme();
  const accent = colors.accent;
  const [memos, setMemos] = useState<Memo[]>([]);
  useEffect(() => { loadMemos().then(setMemos); }, []);
  useFocusEffect(
    React.useCallback(() => {
      loadMemos().then(setMemos);
    }, []),
  );
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [sound, setSound] = useState<AudioPlayer | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackSubscriptionRef = useRef<{ remove: () => void } | null>(null);

  const pulseScale = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseScale.value > 1.05 ? 0.8 : 1,
  }));

  useEffect(() => {
    return () => {
      playbackSubscriptionRef.current?.remove();
      sound?.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sound]);

  const startRecording = async () => {
    const { status } = await requestRecordingPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Microphone access is required to record voice memos.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setIsRecording(true);
    setRecordDuration(0);
    timerRef.current = setInterval(() => setRecordDuration(d => d + 1), 1000);
    pulseScale.value = withRepeat(
      withSequence(withTiming(1.18, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1,
    );
  };

  const stopRecording = async () => {
    if (!isRecording) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    cancelAnimation(pulseScale);
    pulseScale.value = withTiming(1);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    setIsRecording(false);
    if (!uri) { showToast('Recording failed', 'Error'); return; }
    const memo: Memo = {
      id: Date.now().toString(),
      title: `Recording ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      uri,
      duration: recordDuration,
      createdAt: new Date().toISOString(),
    };
    const updated = [memo, ...memos];
    setMemos(updated);
    await saveMemos(updated);
    showToast('Memo saved', 'Saved');
    try {
      const uploaded = await uploadMiniAppMedia('voice-memo', uri, { extension: 'm4a', mimeType: 'audio/mp4' });
      if (uploaded?.path) {
        const synced = updated.map(item => item.id === memo.id ? { ...item, storagePath: uploaded.path } : item);
        setMemos(synced);
        await saveMemos(synced);
      }
    } catch {
      showToast('Saved on this device. Cloud audio sync will retry after another edit.', 'Voice Memo');
    }
  };

  const playMemo = async (memo: Memo) => {
    if (playingId === memo.id) {
      sound?.pause();
      setPlayingId(null);
      return;
    }
    const candidates = await playbackCandidates(memo);
    if (candidates.length === 0) {
      showToast('Audio file is not available on this device', 'Voice Memo');
      return;
    }
    playbackSubscriptionRef.current?.remove();
    if (sound) { sound.remove(); setSound(null); }
    for (const uri of candidates) {
      try {
        const nextSound = createAudioPlayer({ uri });
        playbackSubscriptionRef.current = nextSound.addListener('playbackStatusUpdate', status => {
          if (status.didJustFinish) {
            setPlayingId(null);
            playbackSubscriptionRef.current?.remove();
            playbackSubscriptionRef.current = null;
            nextSound.remove();
            setSound(null);
          }
        });
        nextSound.play();
        setSound(nextSound);
        setPlayingId(memo.id);
        return;
      } catch {
        if (playbackSubscriptionRef.current) {
          playbackSubscriptionRef.current?.remove();
          playbackSubscriptionRef.current = null;
        }
      }
    }
    setPlayingId(null);
    showToast('Audio file is not available on this device', 'Voice Memo');
  };

  const deleteMemo = (id: string) => {
    if (playingId === id) {
      playbackSubscriptionRef.current?.remove();
      playbackSubscriptionRef.current = null;
      sound?.remove();
      setPlayingId(null);
      setSound(null);
    }
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

  const CountBadge = (
    <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>
      {memos.length} saved
    </Text>
  );

  return (
    <MiniAppShell title="Voice Memo" subtitle="Record" headerRight={CountBadge}>
      <MiniCommandDeck
        accent={isRecording ? REC_COLOR : accent}
        title="Voice-to-action capture"
        subtitle="Thoughts, meetings, practice, proof."
        metrics={[
          { label: 'Memos', value: `${memos.length}`, detail: 'saved' },
          { label: 'Minutes', value: `${Math.round(memos.reduce((sum, memo) => sum + memo.duration, 0) / 60)}`, detail: 'captured' },
          { label: 'Now', value: formatMemoTime(recordDuration), detail: isRecording ? 'live' : 'idle' },
        ]}
        chips={['Turn into note', 'Practice proof', 'Draft from audio']}
      />
      {/* Recording widget */}
      <GlassPanel
        variant="medium"
        borderRadius={28}
        contentStyle={{ padding: 28, alignItems: 'center', gap: 20 }}
        style={{
          marginBottom: 20,
          borderColor: isRecording ? REC_COLOR + '44' : colors.glassBorder,
          shadowColor: isRecording ? REC_COLOR : 'transparent',
          shadowOpacity: 0.25,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        {/* Waveform bars */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 48 }}>
          {Array.from({ length: 18 }).map((_, i) => {
            const heights = [12, 20, 32, 18, 38, 24, 14, 42, 28, 36, 16, 44, 22, 34, 18, 28, 40, 14];
            return (
              <Animated.View key={i} style={isRecording ? pulseStyle : undefined}>
                <View style={{
                  width: 3,
                  height: isRecording ? heights[i % heights.length] : 8,
                  borderRadius: 2,
                  backgroundColor: isRecording
                    ? (i % 3 === 0 ? REC_COLOR : i % 3 === 1 ? REC_COLOR + '99' : REC_COLOR + '55')
                    : colors.glassBorder,
                }} />
              </Animated.View>
            );
          })}
        </View>

        {/* Duration */}
        <Text style={{
          color: isRecording ? REC_COLOR : colors.textMuted,
          fontSize: 38, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -1,
        }}>
          {formatMemoTime(recordDuration)}
        </Text>

        {/* Record / Stop button */}
        <Animated.View style={isRecording ? pulseStyle : undefined}>
          <AnimatedPressable
            onPress={isRecording ? stopRecording : startRecording}
            scaleValue={0.92}
            haptic="heavy"
            style={{
              width: 80, height: 80, borderRadius: 40,
              backgroundColor: isRecording ? REC_COLOR : accent,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: isRecording ? REC_COLOR : accent,
              shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
              borderWidth: 4, borderColor: isRecording ? REC_COLOR + '33' : accent + '33',
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
      </GlassPanel>

      <EdgeFeaturePanel
        appName="Voice Memo"
        accent={accent}
        headline="Capture before the idea disappears"
        caption="Use voice notes as raw material for prompts, posts, decisions, and follow-ups."
        metrics={[
          { label: 'Memos', value: `${memos.length}` },
          { label: 'Minutes', value: `${Math.round(memos.reduce((sum, memo) => sum + memo.duration, 0) / 60)}` },
          { label: 'Latest', value: memos[0] ? formatMemoTime(memos[0].duration) : '0:00' },
        ]}
        prompt="Help me turn my latest voice memo into a clear note, next action, or Echo draft."
        shareText={`Voice memo progress: ${memos.length} recordings saved, ${formatMemoTime(memos.reduce((sum, memo) => sum + memo.duration, 0))} captured.`}
        publishTitle="Voice memo progress"
        publishBody={`I captured ${memos.length} voice memos totaling ${formatMemoTime(memos.reduce((sum, memo) => sum + memo.duration, 0))}.`}
      />

      {/* Memo list */}
      {memos.length === 0 ? (
        <MiniEmptyState
          accent={colors.accent}
          icon={<MicrophoneStage color={colors.textMuted} size={48} weight="duotone" />}
          title="No recordings yet"
          subtitle="Record the first thought, meeting, practice run, or proof worth keeping."
        />
      ) : (
        memos.map((memo, i) => (
          <Animated.View key={memo.id} entering={FadeInDown.delay(i * 40).duration(220)} style={{ marginBottom: 10 }}>
            <GlassPanel
              variant="medium"
              borderRadius={18}
              contentStyle={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 }}
              style={{ borderColor: playingId === memo.id ? accent + '44' : colors.glassBorder }}
            >
              {/* Play button */}
              <AnimatedPressable
                onPress={() => playMemo(memo)}
                scaleValue={0.88}
                haptic="medium"
                style={{
                  width: 48, height: 48, borderRadius: 24,
                  backgroundColor: playingId === memo.id ? accent : (colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: playingId === memo.id ? accent : colors.glassBorder,
                }}
              >
                {playingId === memo.id
                  ? <Pause color="#fff" size={20} weight="fill" />
                  : <Play color={accent} size={20} weight="fill" />}
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
                  {formatMemoTime(memo.duration)} · {formatMemoDate(memo.createdAt)}
                </Text>
              </View>

              {/* Delete */}
              <AnimatedPressable onPress={() => confirmDelete(memo)} scaleValue={0.85} haptic="light">
                <Trash color={colors.textMuted} size={18} />
              </AnimatedPressable>
            </GlassPanel>
          </Animated.View>
        ))
      )}
    </MiniAppShell>
  );
}
