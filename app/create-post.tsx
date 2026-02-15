import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, KeyboardAvoidingView,
  Platform, TouchableOpacity, Pressable, Alert, Modal,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { QuotedEchoCard } from '../components/social/QuotedEchoCard';
import { VideoPreview } from '../components/social/VideoPreview';
import Animated, { FadeInDown, FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import {
  ArrowLeft, PaperPlaneTilt, Lightning, Hash, Image as ImageIcon,
  VideoCamera, ChartBar, X, Plus, Clock, Camera, Images, CheckCircle,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { FeedItem, PollOption } from '../types';
import { coerceFeedItem } from '../lib/localFeedSeed';
import { playSoundEffect } from '../lib/sound';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { getSessionUserId, uploadEchoImages, uploadEchoVideo, insertRemoteEcho } from '../lib/supabaseEchoApi';
import type { LocalImageUpload, LocalVideoUpload } from '../lib/supabaseEchoApi';

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
  const params = useLocalSearchParams<{ quoted?: string; prefillTitle?: string; prefillBody?: string; prefillPrompt?: string }>();
  const { colors, radius, fontSizes, animation } = useTheme();
  const { username, userId, avatarColor, avatarUrl, displayName, publishEcho, setUserId, publishedEchoes } = useAppStore() as any;
  const quotedId = typeof params.quoted === 'string' ? params.quoted : undefined;
  const quotedEcho = React.useMemo(() => {
    if (!quotedId) return undefined;
    const e: FeedItem | undefined = (publishedEchoes as FeedItem[] | undefined)?.find(p => p.id === quotedId);
    if (!e) return undefined;
    return {
      id: e.id, username: e.username, displayName: e.displayName,
      avatarColor: e.avatarColor, avatarUrl: e.avatarUrl,
      prompt: e.prompt, response: e.response, isVerified: e.isVerified,
    };
  }, [quotedId, publishedEchoes]);

  const [postType, setPostType] = useState<PostType>('text');
  const [prompt, setPrompt] = useState(
    typeof params.prefillPrompt === 'string' ? params.prefillPrompt
    : typeof params.prefillTitle === 'string' ? params.prefillTitle
    : ''
  );
  const [publishedEchoPreview, setPublishedEchoPreview] = useState<{ title: string } | null>(null);
  const ceremonyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [response, setResponse] = useState(typeof params.prefillBody === 'string' ? params.prefillBody : '');
  const [caption, setCaption] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Photo state — up to 4 device assets
  const [images, setImages] = useState<LocalImageUpload[]>([]);
  const imageUris = images.map(image => image.uri);

  // Video state — single device URI
  const [video, setVideo] = useState<LocalVideoUpload | null>(null);
  const videoUri = video?.uri ?? '';

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
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4 - imageUris.length,
      quality: 0.72,
    });
    if (!result.canceled) {
      setImages(prev => [...prev, ...result.assets.map(asset => ({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      }))].slice(0, 4));
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.72,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setImages(prev => [...prev, {
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      }].slice(0, 4));
    }
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to pick videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.6,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setVideo({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      });
    }
  };

  const recordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to record videos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setVideo({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      });
    }
  };

  const addPollOption = () => { if (pollOptions.length < 4) setPollOptions(p => [...p, '']); };
  const updatePollOption = (idx: number, t: string) => setPollOptions(p => p.map((o, i) => i === idx ? t : o));
  const removePollOption = (idx: number) => { if (pollOptions.length > 2) setPollOptions(p => p.filter((_, i) => i !== idx)); };

  const handlePublish = async () => {
    if (!canPublish) return;
    setPublishing(true);

    try {
      const hashtags = tagsRaw.split(/[\s,]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
      const remoteAuthorId = isSupabaseRemote() ? await getSessionUserId() : null;
      if (isSupabaseRemote() && !remoteAuthorId) {
        Alert.alert(
          'Session expired',
          'Please sign in again to publish your echo.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign In', onPress: () => router.replace('/auth/login') },
          ]
        );
        return;
      }
      if (remoteAuthorId && remoteAuthorId !== userId) {
        setUserId(remoteAuthorId);
      }

      const base = {
        id: Date.now().toString(),
        userId: remoteAuthorId ?? userId, username: username || 'anonymous',
        displayName: displayName || username || 'anonymous',
        avatarColor: avatarColor || colors.accent,
        avatarUrl: avatarUrl || undefined,
        isVerified: false,
        likes: 0, isLiked: false, isBookmarked: false, isReposted: false,
        repostCount: 0, commentCount: 0, viewCount: 0,
        hashtags, createdAt: new Date().toISOString(),
        quotedEchoId: quotedId,
        quotedEcho,
      };

      let echo: FeedItem;
      let remoteMediaUrls: string[] | undefined;
      let remoteEchoId: string | undefined;

      switch (postType) {
        case 'text':
          echo = coerceFeedItem({ ...base, postType: 'text', prompt: prompt.trim(), response: response.trim() });
          if (remoteAuthorId) {
            const row = await insertRemoteEcho({ authorId: remoteAuthorId, prompt: prompt.trim(), response: response.trim(), quotedEchoId: quotedId });
            remoteEchoId = row.id;
          }
          break;
        case 'photo': {
          // Upload images to Storage first if remote
          if (remoteAuthorId && imageUris.length > 0) {
            remoteMediaUrls = await uploadEchoImages(images);
          }
          const finalUris = remoteMediaUrls ?? imageUris;
          echo = coerceFeedItem({ ...base, postType: 'photo', prompt: caption.trim() || 'Photo post', response: '', mediaUris: finalUris });
          if (remoteAuthorId) {
            const row = await insertRemoteEcho({ authorId: remoteAuthorId, prompt: caption.trim() || 'Photo post', response: '', mediaUrls: remoteMediaUrls });
            remoteEchoId = row.id;
          }
          break;
        }
        case 'video': {
          const remoteVideoUrl = remoteAuthorId && video ? await uploadEchoVideo(video) : undefined;
          const finalVideoUri = remoteVideoUrl ?? videoUri;
          echo = coerceFeedItem({ ...base, postType: 'video', prompt: caption.trim() || 'Video post', response: '', videoUri: finalVideoUri });
          if (remoteAuthorId) {
            const row = await insertRemoteEcho({ authorId: remoteAuthorId, prompt: caption.trim() || 'Video post', response: '', mediaUrls: remoteVideoUrl ? [remoteVideoUrl] : undefined });
            remoteEchoId = row.id;
          }
          break;
        }
        case 'poll': {
          const options: PollOption[] = pollOptions.filter(o => o.trim()).map((o, i) => ({ id: `opt_${i}`, text: o.trim(), votes: 0 }));
          echo = coerceFeedItem({
            ...base, postType: 'poll', prompt: pollQuestion.trim(), response: '',
            poll: { question: pollQuestion.trim(), options, totalVotes: 0, endsAt: new Date(Date.now() + pollDurationHours * 3600000).toISOString() },
          });
          if (remoteAuthorId) {
            const row = await insertRemoteEcho({
              authorId: remoteAuthorId,
              prompt: pollQuestion.trim(),
              response: JSON.stringify({ options: options.map(o => o.text), durationHours: pollDurationHours }),
            });
            remoteEchoId = row.id;
          }
          break;
        }
      }

      const publishedEcho = remoteEchoId ? { ...echo!, id: remoteEchoId } : echo!;
      publishEcho(publishedEcho);
      if (remoteAuthorId) {
        qc.setQueriesData<FeedItem[]>({ queryKey: ['feed'] }, old => {
          if (!old) return [publishedEcho];
          return [publishedEcho, ...old.filter(item => item.id !== publishedEcho.id)];
        });
      }
      qc.invalidateQueries({ queryKey: ['feed'] });
      playSoundEffect('success');
      const previewTitle = publishedEcho.editorialTitle ?? publishedEcho.prompt ?? 'Your echo is live.';
      setPublishedEchoPreview({ title: previewTitle });
      if (ceremonyTimer.current) clearTimeout(ceremonyTimer.current);
      ceremonyTimer.current = setTimeout(() => {
        router.replace('/(tabs)/discover');
      }, 1800);
    } catch (e) {
      Alert.alert('Publish failed', (e as Error).message);
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
      {/* Publish ceremony overlay */}
      <Modal visible={!!publishedEchoPreview} transparent animationType="none">
        <Animated.View
          entering={FadeIn.duration(280)}
          exiting={FadeOut.duration(200)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
        >
          <Animated.View entering={ZoomIn.springify().damping(22).stiffness(260)} style={{ alignItems: 'center' }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(16,185,129,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <CheckCircle color="#10B981" size={38} weight="fill" />
            </View>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 10, textAlign: 'center' }}>
              Echo sent.
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, textAlign: 'center', lineHeight: 22 }} numberOfLines={2}>
              {publishedEchoPreview?.title}
            </Text>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} style={{ padding: 4 }} scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.title }}>New Echo</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Distil your take.</Text>
        </View>
        <AnimatedPressable
          onPress={() => { void handlePublish(); }} disabled={!canPublish} scaleValue={0.92} haptic="medium"
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
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={{ width: 40, height: 40, borderRadius: 20, marginRight: 10 }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: avatarColor || colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.body }}>{(username || '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.body }}>{displayName || username || 'You'}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{username || 'anonymous'}</Text>
            </View>
          </Animated.View>

          {/* ── TEXT ── */}
          {quotedEcho && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', marginBottom: 6 }}>QUOTING</Text>
              <QuotedEchoCard echo={quotedEcho} />
            </View>
          )}
          {postType === 'text' && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              <Text style={s.label}>Question</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput multiline value={prompt} onChangeText={setPrompt} placeholder="What question or prompt started this?" placeholderTextColor={colors.textMuted} maxLength={280} style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 56 }} />
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 4 }}>{prompt.length}/280</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 4, gap: 6 }}>
                <Lightning color={colors.accent} size={12} />
                <Text style={[s.label, { marginBottom: 0 }]}>Your Echo</Text>
              </View>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput multiline value={response} onChangeText={setResponse} placeholder="The response, your take, or what made this worth sharing…" placeholderTextColor={colors.textMuted} maxLength={1000} style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 110 }} />
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
                <View style={{ marginBottom: 14, borderRadius: radius.card, overflow: 'hidden' }}>
                  <VideoPreview uri={videoUri} height={200} borderRadius={radius.card} />
                  <Pressable
                    onPress={() => setVideo(null)}
                    style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, padding: 6 }}
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
    </SafeAreaView>
  );
}
