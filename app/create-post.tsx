import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, KeyboardAvoidingView,
  Platform, TouchableOpacity, Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import {
  ArrowLeft, PaperPlaneTilt, Lightning, Hash, Image as ImageIcon,
  VideoCamera, ChartBar, X, Plus, Clock, Camera, Images,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { FeedItem, PollOption } from '../types';
import { coerceFeedItem } from '../lib/localFeedSeed';
import { playSoundEffect } from '../lib/sound';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { insertRemoteEcho, uploadMediaFile } from '../lib/supabaseEchoApi';

// Stable for the lifetime of the app — env vars are set at build time
const IS_REMOTE = isSupabaseRemote();

type PostType = 'text' | 'photo' | 'video' | 'poll';

const POST_TYPES: { key: PostType; label: string; Icon: React.ComponentType<any> }[] = [
  { key: 'text', label: 'Text', Icon: Lightning },
  { key: 'photo', label: 'Photo', Icon: ImageIcon },
  { key: 'video', label: 'Video', Icon: VideoCamera },
  { key: 'poll', label: 'Poll', Icon: ChartBar },
];

const POLL_DURATIONS = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

export default function CreatePostScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors, radius, fontSizes, animation } = useTheme();
  const username    = useAppStore(s => s.username);
  const userId      = useAppStore(s => s.userId);
  const avatarColor = useAppStore(s => s.avatarColor);
  const displayName = useAppStore(s => s.displayName);
  const publishEcho = useAppStore(s => s.publishEcho);

  const [postType, setPostType] = useState<PostType>('text');
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [caption, setCaption] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Photo state — up to 4 device URIs
  const [imageUris, setImageUris] = useState<string[]>([]);

  // Video state — single device URI
  const [videoUri, setVideoUri] = useState('');

  // Poll state
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDurationHours, setPollDurationHours] = useState(24);

  const canPublish = (() => {
    if (publishing) return false;
    switch (postType) {
      case 'text': return prompt.trim().length > 0 && response.trim().length > 0;
      case 'photo': return imageUris.length > 0;
      case 'video': return videoUri.length > 0;
      case 'poll': return pollQuestion.trim().length > 0 && pollOptions.filter(o => o.trim()).length >= 2;
    }
  })();

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to pick images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 4 - imageUris.length,
      quality: 0.88,
    });
    if (!result.canceled) {
      setImageUris(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 4));
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.88,
    });
    if (!result.canceled) {
      setImageUris(prev => [...prev, result.assets[0].uri].slice(0, 4));
    }
  };

  const removeImage = (idx: number) => setImageUris(prev => prev.filter((_, i) => i !== idx));

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to pick videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 120,
      quality: 1,
    });
    if (!result.canceled) setVideoUri(result.assets[0].uri);
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
    if (!result.canceled) setVideoUri(result.assets[0].uri);
  };

  const addPollOption = () => { if (pollOptions.length < 4) setPollOptions(p => [...p, '']); };
  const updatePollOption = (idx: number, t: string) => setPollOptions(p => p.map((o, i) => i === idx ? t : o));
  const removePollOption = (idx: number) => { if (pollOptions.length > 2) setPollOptions(p => p.filter((_, i) => i !== idx)); };

  const handlePublish = async () => {
    if (!canPublish) return;
    setPublishing(true);
    try {
      const remote = IS_REMOTE;
      const hashtags = tagsRaw.split(/[\s,]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);

      const base = {
        id: Date.now().toString(),
        userId, username: username || 'anonymous',
        displayName: displayName || username || 'anonymous',
        avatarColor: avatarColor || colors.accent,
        isVerified: false,
        likes: 0, isLiked: false, isBookmarked: false, isReposted: false,
        repostCount: 0, commentCount: 0, viewCount: 0,
        hashtags, createdAt: new Date().toISOString(),
      };

      let remoteImageUris: string[] | undefined;
      let remoteVideoUri: string | undefined;

      if (remote) {
        if (postType === 'photo' && imageUris.length > 0) {
          remoteImageUris = await Promise.all(
            imageUris.map(uri => uploadMediaFile(uri, 'image/jpeg'))
          );
        }
        if (postType === 'video' && videoUri) {
          remoteVideoUri = await uploadMediaFile(videoUri, 'video/mp4');
        }
      }

      let echo: FeedItem;
      switch (postType) {
        case 'text':
          echo = coerceFeedItem({ ...base, postType: 'text', prompt: prompt.trim(), response: response.trim() });
          break;
        case 'photo':
          echo = coerceFeedItem({ ...base, postType: 'photo', prompt: caption.trim() || 'Photo post', response: '', mediaUris: remoteImageUris ?? imageUris });
          break;
        case 'video':
          echo = coerceFeedItem({ ...base, postType: 'video', prompt: caption.trim() || 'Video post', response: '', videoUri: remoteVideoUri ?? videoUri });
          break;
        case 'poll': {
          const options: PollOption[] = pollOptions.filter(o => o.trim()).map((o, i) => ({ id: `opt_${i}`, text: o.trim(), votes: 0 }));
          echo = coerceFeedItem({
            ...base, postType: 'poll', prompt: pollQuestion.trim(), response: '',
            poll: { question: pollQuestion.trim(), options, totalVotes: 0, endsAt: new Date(Date.now() + pollDurationHours * 3600000).toISOString() },
          });
          break;
        }
      }

      if (remote) {
        await insertRemoteEcho({
          authorId: userId,
          prompt: echo!.prompt,
          response: echo!.response,
          mediaUris: echo!.mediaUris,
          videoUri: echo!.videoUri,
        });
        await qc.invalidateQueries({ queryKey: ['feed'] });
      } else {
        publishEcho(echo!);
        qc.invalidateQueries({ queryKey: ['feed'] });
      }

      playSoundEffect('success');
      showToast('Echo published!', '✨');
      router.back();
    } catch {
      showToast('Failed to publish. Try again.', '❌');
    } finally {
      setPublishing(false);
    }
  };

  const s = {
    surface: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border },
    label: { color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} style={{ padding: 4 }} scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.title }}>New Echo</Text>
        <AnimatedPressable
          onPress={handlePublish} disabled={!canPublish} scaleValue={0.92} haptic="medium"
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: canPublish ? colors.accent : colors.surfaceHover, opacity: canPublish ? 1 : 0.5 }}
        >
          <PaperPlaneTilt color="#fff" size={14} />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small, marginLeft: 6 }}>{publishing ? 'Posting…' : 'Post'}</Text>
        </AnimatedPressable>
      </View>

      {/* Type selector */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
        {POST_TYPES.map(({ key, label, Icon }) => {
          const active = postType === key;
          return (
            <Pressable key={key} onPress={() => setPostType(key)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 4, borderRadius: radius.full, backgroundColor: active ? colors.accent : colors.surface, borderWidth: 1, borderColor: active ? colors.accent : colors.border }}>
              <Icon color={active ? '#fff' : colors.textMuted} size={13} />
              <Text style={{ color: active ? '#fff' : colors.textMuted, fontWeight: '600', fontSize: fontSizes.caption }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Author */}
          <Animated.View entering={animation(FadeInDown.delay(40).springify())} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginTop: 4 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: avatarColor || colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.body }}>{(username || '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.body }}>{displayName || username || 'You'}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{username || 'anonymous'}</Text>
            </View>
          </Animated.View>

          {/* ── TEXT ── */}
          {postType === 'text' && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              <Text style={s.label}>Prompt</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput multiline value={prompt} onChangeText={setPrompt} placeholder="What did you ask Echo?" placeholderTextColor={colors.textMuted} maxLength={280} style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 56 }} />
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 4 }}>{prompt.length}/280</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 4, gap: 6 }}>
                <Lightning color={colors.accent} size={12} />
                <Text style={[s.label, { marginBottom: 0 }]}>Echo Response</Text>
              </View>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput multiline value={response} onChangeText={setResponse} placeholder="Share what the AI said, your insights, or anything worth echoing…" placeholderTextColor={colors.textMuted} maxLength={1000} style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 110 }} />
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 4 }}>{response.length}/1000</Text>
              </View>
            </Animated.View>
          )}

          {/* ── PHOTO ── */}
          {postType === 'photo' && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              {/* Picker buttons */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <Pressable
                  onPress={pickImages}
                  disabled={imageUris.length >= 4}
                  style={[s.surface, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8, opacity: imageUris.length >= 4 ? 0.4 : 1 }]}
                >
                  <Images color={colors.accent} size={20} />
                  <Text style={{ color: colors.accent, fontWeight: '700', fontSize: fontSizes.body }}>Library</Text>
                </Pressable>
                <Pressable
                  onPress={takePhoto}
                  disabled={imageUris.length >= 4}
                  style={[s.surface, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8, opacity: imageUris.length >= 4 ? 0.4 : 1 }]}
                >
                  <Camera color={colors.text} size={20} />
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.body }}>Camera</Text>
                </Pressable>
              </View>

              {/* Count */}
              <Text style={[s.label, { color: imageUris.length >= 4 ? colors.accent : colors.textMuted }]}>
                {imageUris.length}/4 selected
              </Text>

              {/* Thumbnail grid */}
              {imageUris.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {imageUris.map((uri, idx) => (
                    <View
                      key={idx}
                      style={{
                        width: imageUris.length === 1 ? '100%' : '48%',
                        aspectRatio: imageUris.length === 1 ? 16 / 9 : 1,
                        borderRadius: radius.card, overflow: 'hidden',
                        backgroundColor: colors.surfaceHover,
                      }}
                    >
                      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      <Pressable
                        onPress={() => removeImage(idx)}
                        style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 12, padding: 4 }}
                      >
                        <X color="#fff" size={14} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={[s.surface, { height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 14, gap: 10 }]}>
                  <ImageIcon color={colors.border} size={40} weight="thin" />
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>No photos selected</Text>
                </View>
              )}

              <Text style={s.label}>Caption (optional)</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput multiline value={caption} onChangeText={setCaption} placeholder="Add a caption…" placeholderTextColor={colors.textMuted} maxLength={300} style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 56 }} />
              </View>
            </Animated.View>
          )}

          {/* ── VIDEO ── */}
          {postType === 'video' && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              {/* Picker buttons */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <Pressable
                  onPress={pickVideo}
                  style={[s.surface, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 }]}
                >
                  <Images color={colors.accent} size={20} />
                  <Text style={{ color: colors.accent, fontWeight: '700', fontSize: fontSizes.body }}>Library</Text>
                </Pressable>
                <Pressable
                  onPress={recordVideo}
                  style={[s.surface, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 }]}
                >
                  <VideoCamera color="#EF4444" size={20} />
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.body }}>Record</Text>
                </Pressable>
              </View>

              {/* Preview / empty state */}
              {videoUri ? (
                <View style={{ marginBottom: 14, borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#000', height: 180, alignItems: 'center', justifyContent: 'center' }}>
                  <VideoCamera color="#fff" size={40} weight="thin" />
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: fontSizes.small, marginTop: 8 }}>
                    Video selected ✓
                  </Text>
                  <Pressable
                    onPress={() => setVideoUri('')}
                    style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 6 }}
                  >
                    <X color="#fff" size={16} />
                  </Pressable>
                </View>
              ) : (
                <View style={[s.surface, { height: 160, alignItems: 'center', justifyContent: 'center', marginBottom: 14, gap: 10 }]}>
                  <VideoCamera color={colors.border} size={44} weight="thin" />
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>No video selected</Text>
                </View>
              )}

              <Text style={s.label}>Caption (optional)</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput multiline value={caption} onChangeText={setCaption} placeholder="Add a caption…" placeholderTextColor={colors.textMuted} maxLength={300} style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 56 }} />
              </View>
            </Animated.View>
          )}

          {/* ── POLL ── */}
          {postType === 'poll' && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              <Text style={s.label}>Question</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 16 }]}>
                <TextInput value={pollQuestion} onChangeText={setPollQuestion} placeholder="Ask your community something…" placeholderTextColor={colors.textMuted} maxLength={140} style={{ color: colors.text, fontSize: fontSizes.body }} />
              </View>
              <Text style={s.label}>Options</Text>
              {pollOptions.map((opt, idx) => (
                <View key={idx} style={[s.surface, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 2, marginBottom: 8 }]}>
                  <TextInput value={opt} onChangeText={t => updatePollOption(idx, t)} placeholder={`Option ${idx + 1}`} placeholderTextColor={colors.textMuted} maxLength={80} style={{ flex: 1, color: colors.text, fontSize: fontSizes.body, paddingVertical: 12 }} />
                  {pollOptions.length > 2 && (
                    <Pressable onPress={() => removePollOption(idx)} style={{ padding: 4 }}>
                      <X color={colors.textMuted} size={16} />
                    </Pressable>
                  )}
                </View>
              ))}
              {pollOptions.length < 4 && (
                <TouchableOpacity onPress={addPollOption} style={[s.surface, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginBottom: 16, gap: 6, borderStyle: 'dashed' }]}>
                  <Plus color={colors.textMuted} size={16} />
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.body }}>Add option</Text>
                </TouchableOpacity>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                <Clock color={colors.textMuted} size={13} />
                <Text style={[s.label, { marginBottom: 0 }]}>Poll Duration</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {POLL_DURATIONS.map(d => {
                  const active = pollDurationHours === d.hours;
                  return (
                    <Pressable key={d.hours} onPress={() => setPollDurationHours(d.hours)} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.full, backgroundColor: active ? colors.accent : colors.surface, borderWidth: 1, borderColor: active ? colors.accent : colors.border }}>
                      <Text style={{ color: active ? '#fff' : colors.textMuted, fontWeight: '600', fontSize: fontSizes.small }}>{d.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          )}

          {/* Shared tags */}
          <Animated.View entering={animation(FadeInDown.delay(60).springify())}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
              <Hash color={colors.textMuted} size={13} />
              <Text style={[s.label, { marginBottom: 0 }]}>Tags</Text>
            </View>
            <View style={[s.surface, { padding: 12, marginBottom: 16 }]}>
              <TextInput value={tagsRaw} onChangeText={setTagsRaw} placeholder="ai, react, tips (comma-separated)" placeholderTextColor={colors.textMuted} autoCapitalize="none" style={{ color: colors.text, fontSize: fontSizes.body }} />
            </View>
          </Animated.View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {publishing && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: '#fff', marginTop: 14, fontWeight: '600', fontSize: 15 }}>
            {(postType === 'photo' || postType === 'video') && IS_REMOTE
              ? 'Uploading media…'
              : 'Publishing…'}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
