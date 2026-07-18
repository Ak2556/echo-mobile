import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, KeyboardAvoidingView,
  Platform, TouchableOpacity, Pressable, Alert, Modal, StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { QuotedEchoCard } from '../components/social/QuotedEchoCard';
import { VideoPreview } from '../components/social/VideoPreview';
import { MentionSuggestions, applyMentionPick } from '../components/social/MentionSuggestions';
import Animated, { FadeInDown, FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import {
  ArrowLeft, PaperPlaneTilt, Lightning, Hash, Image as ImageIcon,
  VideoCamera, ChartBar, X, Plus, Clock, Camera, Images, CheckCircle, Question,
  Users, MagnifyingGlass,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { Avatar } from '../components/ui/Avatar';
import { warmAvatarColor } from '../lib/avatarPalette';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { FeedItem, PollOption } from '../types';
import { coerceFeedItem } from '../lib/localFeedSeed';
import { prependEchoToFeedCache } from '../lib/queryCache';
import { playSoundEffect } from '../lib/sound';
import { track } from '../lib/analytics';
import { getPushPermissionStatus, registerForPush } from '../lib/push';
import { PushPrePrompt } from '../components/onboarding/PushPrePrompt';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { getSessionUserId, uploadEchoImages, uploadEchoVideo, insertRemoteEcho, searchRemoteUsers } from '../lib/supabaseEchoApi';
import type { LocalImageUpload, LocalVideoUpload, UserSearchHit } from '../lib/supabaseEchoApi';

type PostType = 'text' | 'photo' | 'video' | 'poll' | 'musing';

const POST_TYPES: { key: PostType; label: string; Icon: React.ComponentType<any> }[] = [
  // 'Echo' is the brand term for a text post — every other product surface
  // calls them "echoes" so the tab name shouldn't degenerate to "Text".
  { key: 'text', label: 'Echo', Icon: Lightning },
  { key: 'musing', label: 'Musing', Icon: Question },
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

const MAX_VIDEO_DURATION_MS = 60_000;
const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export default function CreatePostScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ quoted?: string; prefillTitle?: string; prefillBody?: string; prefillPrompt?: string; firstEcho?: string }>();
  const isFirstEcho = params.firstEcho === '1';
  const { colors, radius, fontSizes, animation } = useTheme();
  const { username, userId, avatarColor, avatarUrl, profilePhotoVisible, displayName, publishEcho, setUserId, publishedEchoes } = useAppStore();
  const visibleAvatarUrl = profilePhotoVisible ? avatarUrl : '';
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
  const [showPushPrePrompt, setShowPushPrePrompt] = useState(false);
  const ceremonyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cancel the ceremony timer if the user navigates away before it fires
  React.useEffect(() => () => { if (ceremonyTimer.current) clearTimeout(ceremonyTimer.current); }, []);
  const [response, setResponse] = useState(typeof params.prefillBody === 'string' ? params.prefillBody : '');
  const [responseCaret, setResponseCaret] = useState(0);
  const [responseFocused, setResponseFocused] = useState(false);
  const [caption, setCaption] = useState('');
  const [captionCaret, setCaptionCaret] = useState(0);
  const [captionFocused, setCaptionFocused] = useState(false);
  const [tagsRaw, setTagsRaw] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Photo state — up to 4 device assets
  const [images, setImages] = useState<LocalImageUpload[]>([]);
  const imageUris = images.map(image => image.uri);

  // Video state — single device URI
  const [video, setVideo] = useState<LocalVideoUpload | null>(null);
  const videoUri = video?.uri ?? '';

  const setPickedVideo = (asset: ImagePicker.ImagePickerAsset) => {
    if (asset.duration && asset.duration > MAX_VIDEO_DURATION_MS) {
      Alert.alert('Video too long', 'Echo supports videos up to 60 seconds for reliable upload and playback.');
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_VIDEO_UPLOAD_BYTES) {
      Alert.alert('Video too large', `This video is ${formatBytes(asset.fileSize)}. Pick a video under ${formatBytes(MAX_VIDEO_UPLOAD_BYTES)}.`);
      return;
    }
    setVideo({
      uri: asset.uri,
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      fileSize: asset.fileSize,
      duration: asset.duration,
      width: asset.width,
      height: asset.height,
    });
  };

  // Co-echo state — when set, the response field is the author's take and
  // coAuthorResponse is the co-author's take. Only valid for postType === 'text'.
  const [coAuthor, setCoAuthor] = useState<UserSearchHit | null>(null);
  const [coAuthorResponse, setCoAuthorResponse] = useState('');
  const [coAuthorPickerOpen, setCoAuthorPickerOpen] = useState(false);
  const [coAuthorQuery, setCoAuthorQuery] = useState('');
  const [coAuthorHits, setCoAuthorHits] = useState<UserSearchHit[]>([]);

  React.useEffect(() => {
    if (!coAuthorPickerOpen) return;
    const t = setTimeout(async () => {
      const res = await searchRemoteUsers(coAuthorQuery, 8);
      setCoAuthorHits(res);
    }, 180);
    return () => clearTimeout(t);
  }, [coAuthorQuery, coAuthorPickerOpen]);

  // Poll state
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDurationHours, setPollDurationHours] = useState(24);

  const canPublish = (() => {
    if (publishing) return false;
    switch (postType) {
      case 'text':
        if (coAuthor) {
          return prompt.trim().length > 0 && response.trim().length > 0 && coAuthorResponse.trim().length > 0;
        }
        return prompt.trim().length > 0 && response.trim().length > 0;
      case 'musing': return prompt.trim().length > 0;
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
      videoMaxDuration: MAX_VIDEO_DURATION_MS / 1000,
      videoExportPreset: Platform.OS === 'ios'
        ? ImagePicker.VideoExportPreset.H264_1280x720
        : undefined,
      preferredAssetRepresentationMode: Platform.OS === 'ios'
        ? ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible
        : undefined,
    });
    if (!result.canceled) {
      setPickedVideo(result.assets[0]);
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
      videoMaxDuration: MAX_VIDEO_DURATION_MS / 1000,
      videoQuality: Platform.OS === 'ios'
        ? ImagePicker.UIImagePickerControllerQualityType.IFrame1280x720
        : ImagePicker.UIImagePickerControllerQualityType.Medium,
      videoExportPreset: Platform.OS === 'ios'
        ? ImagePicker.VideoExportPreset.H264_1280x720
        : undefined,
    });
    if (!result.canceled) {
      setPickedVideo(result.assets[0]);
    }
  };

  const addPollOption = () => { if (pollOptions.length < 4) setPollOptions(p => [...p, '']); };
  const updatePollOption = (idx: number, t: string) => setPollOptions(p => p.map((o, i) => i === idx ? t : o));
  const removePollOption = (idx: number) => { if (pollOptions.length > 2) setPollOptions(p => p.filter((_, i) => i !== idx)); };

  const handlePublish = async () => {
    if (!canPublish) return;
    setPublishing(true);

    try {
      const hashtags = tagsRaw.split(/[\s,]+/).map(t => t.replace(/^#+/, '').trim()).filter(Boolean);
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
        avatarColor: warmAvatarColor(avatarColor, username ?? displayName ?? 'me'),
        avatarUrl: visibleAvatarUrl || undefined,
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
        case 'musing':
          // A musing is a single in-progress thought. Store it in `prompt`
          // with an empty response; the feed renders it with italic
          // "thinking out loud" treatment.
          echo = coerceFeedItem({ ...base, postType: 'musing', prompt: prompt.trim(), response: '' });
          if (remoteAuthorId) {
            const row = await insertRemoteEcho({
              authorId: remoteAuthorId,
              prompt: prompt.trim(),
              response: '',
              postType: 'musing',
            });
            remoteEchoId = row.id;
          }
          break;
        case 'text':
          echo = coerceFeedItem({
            ...base,
            postType: 'text',
            prompt: prompt.trim(),
            response: response.trim(),
            coAuthor: coAuthor ? {
              id: coAuthor.id,
              username: coAuthor.username,
              displayName: coAuthor.display_name || coAuthor.username,
              avatarColor: coAuthor.avatar_color,
              avatarUrl: coAuthor.avatar_url ?? undefined,
              isVerified: coAuthor.is_verified,
            } : undefined,
            coAuthorResponse: coAuthor ? coAuthorResponse.trim() : undefined,
          });
          if (remoteAuthorId) {
            const row = await insertRemoteEcho({
              authorId: remoteAuthorId,
              prompt: prompt.trim(),
              response: response.trim(),
              quotedEchoId: quotedId,
              coAuthorId: coAuthor?.id,
              coAuthorResponse: coAuthor ? coAuthorResponse.trim() : undefined,
            });
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
      const isFirst = (publishedEchoes?.length ?? 0) === 0;
      publishEcho(publishedEcho);
      if (remoteAuthorId) {
        qc.setQueriesData({ queryKey: ['feed'] }, (old: unknown) => prependEchoToFeedCache(old, publishedEcho));
        qc.setQueryData(['profile', remoteAuthorId], (old: unknown) => {
          if (!old || typeof old !== 'object' || !('echoes' in old)) return old;
          const bundle = old as { echoes?: FeedItem[]; user?: { echoCount?: number } };
          if (!Array.isArray(bundle.echoes)) return old;
          const nextEchoes = [
            publishedEcho,
            ...bundle.echoes.filter(item => item.id !== publishedEcho.id),
          ];
          return {
            ...bundle,
            echoes: nextEchoes,
            user: bundle.user
              ? { ...bundle.user, echoCount: Math.max(bundle.user.echoCount ?? 0, nextEchoes.length) }
              : bundle.user,
          };
        });
        qc.invalidateQueries({ queryKey: ['profile', remoteAuthorId] });
      }
      qc.invalidateQueries({ queryKey: ['feed'] });
      playSoundEffect('success');
      track(isFirst ? 'first_echo_published' : 'echo_published', {
        post_type: postType,
        has_media: postType === 'photo' || postType === 'video',
        is_quote: !!quotedId,
        is_co_echo: !!(coAuthor && coAuthorResponse.trim()),
      });
      const previewTitle = publishedEcho.editorialTitle ?? publishedEcho.prompt ?? 'Your echo is live.';
      setPublishedEchoPreview({ title: previewTitle });
      if (ceremonyTimer.current) clearTimeout(ceremonyTimer.current);
      ceremonyTimer.current = setTimeout(async () => {
        // After the first publish, ask once whether to enable push (pre-prompt
        // before the OS prompt). If permission is already granted/denied we
        // skip straight to the feed.
        if (isFirst) {
          try {
            const status = await getPushPermissionStatus();
            if (status === 'undetermined') {
              setPublishedEchoPreview(null);
              setShowPushPrePrompt(true);
              return;
            }
          } catch { /* fall through to feed */ }
        }
        router.replace('/(tabs)/home');
      }, 1800);
    } catch (e) {
      Alert.alert('Publish failed', (e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const s = {
    surface: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: colors.isDark ? 0.12 : 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    label: { color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '700' as const, letterSpacing: 0, marginBottom: 8, marginLeft: 4 },
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Post-publish push pre-prompt (first echo only, status === undetermined). */}
      <PushPrePrompt
        visible={showPushPrePrompt}
        onAccept={async () => {
          setShowPushPrePrompt(false);
          await registerForPush();
          router.replace('/(tabs)/home');
        }}
        onDecline={() => {
          setShowPushPrePrompt(false);
          router.replace('/(tabs)/home');
        }}
      />

      {/* Publish ceremony overlay */}
      <Modal visible={!!publishedEchoPreview} transparent animationType="none">
        <Animated.View
          entering={FadeIn.duration(280)}
          exiting={FadeOut.duration(200)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
        >
          <Animated.View entering={ZoomIn.duration(220)} style={{ alignItems: 'center' }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(16,185,129,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <CheckCircle color="#10B981" size={38} weight="fill" />
            </View>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: 0, marginBottom: 10, textAlign: 'center' }}>
              Echo sent.
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, textAlign: 'center', lineHeight: 22 }} numberOfLines={2}>
              {publishedEchoPreview?.title}
            </Text>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Co-author picker */}
      <Modal visible={coAuthorPickerOpen} transparent animationType="slide" onRequestClose={() => setCoAuthorPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.title }}>Pick co-author</Text>
              <Pressable onPress={() => setCoAuthorPickerOpen(false)} hitSlop={8}>
                <X color={colors.textMuted} size={20} />
              </Pressable>
            </View>
            <View style={[s.surface, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, marginBottom: 12, gap: 8 }]}>
              <MagnifyingGlass color={colors.textMuted} size={16} />
              <TextInput
                value={coAuthorQuery}
                onChangeText={setCoAuthorQuery}
                placeholder="Search by name or @handle"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, color: colors.text, fontSize: fontSizes.body, paddingVertical: 10 }}
              />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {coAuthorHits.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.small, textAlign: 'center', paddingVertical: 20 }}>
                  {coAuthorQuery ? `No matches for "${coAuthorQuery}"` : 'Type to find a co-author'}
                </Text>
              ) : (
                coAuthorHits.map((u, i) => (
                  // Wrapper View owns layout; Pressable owns press handling.
                  // (Pressable.style function strips flex props in Release.)
                  <View
                    key={u.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, gap: 12,
                      borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: colors.border,
                    }}
                  >
                    <Pressable
                      onPress={() => { setCoAuthor(u); setCoAuthorPickerOpen(false); }}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                    >
                      <Avatar name={u.display_name || u.username} color={u.avatar_color} url={u.avatar_url} size={38} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.body }}>{u.display_name || u.username}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{u.username}</Text>
                      </View>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} style={{ padding: 4 }} scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: colors.text, fontSize: 21, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.4 }}>New Echo</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Distill your take.</Text>
        </View>
        <AnimatedPressable
          onPress={() => { void handlePublish(); }} disabled={!canPublish} scaleValue={0.92} haptic="medium"
          style={{ minWidth: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: canPublish ? colors.accent : colors.surfaceHover, opacity: canPublish ? 1 : 0.5 }}
        >
          <PaperPlaneTilt color="#fff" size={14} />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small, marginLeft: 6 }}>{publishing ? 'Posting…' : 'Post'}</Text>
        </AnimatedPressable>
      </View>

      {/* Type selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, maxHeight: 56 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
      >
        {POST_TYPES.map(({ key, label, Icon }) => {
          const active = postType === key;
          return (
            <Pressable key={key} onPress={() => setPostType(key)} style={{ minWidth: 88, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, gap: 5, borderRadius: radius.full, backgroundColor: active ? colors.accent : colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: active ? colors.accent : colors.border }}>
              <Icon color={active ? '#fff' : colors.textMuted} size={13} />
              <Text style={{ color: active ? '#fff' : colors.textMuted, fontWeight: '600', fontSize: fontSizes.caption }}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Author */}
          <Animated.View entering={animation(FadeInDown.delay(40).duration(220))} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginTop: 4 }}>
            <View style={{ marginRight: 10 }}>
              <Avatar
                name={displayName || username || 'You'}
                color={avatarColor}
                url={visibleAvatarUrl || undefined}
                size={40}
              />
            </View>
            <View>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.body }}>{displayName || username || 'You'}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{username || 'anonymous'}</Text>
            </View>
          </Animated.View>

          {/* Text post */}
          {quotedEcho && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', marginBottom: 6 }}>QUOTING</Text>
              <QuotedEchoCard echo={quotedEcho} />
            </View>
          )}
          {postType === 'musing' && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              <View
                style={{
                  marginBottom: 14,
                  padding: 14,
                  borderRadius: radius.card,
                  backgroundColor: colors.accent + '14',
                  borderWidth: 1,
                  borderColor: colors.accent + '30',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Question color={colors.accent} size={20} weight="duotone" />
                <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19, flex: 1 }}>
                  A musing is a thought you&apos;re still working through — no need for a tidy answer. Think out loud.
                </Text>
              </View>
              <Text style={s.label}>What&apos;s on your mind?</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput
                  multiline
                  value={prompt}
                  onChangeText={setPrompt}
                  placeholder="What are you working through?"
                  placeholderTextColor={colors.textMuted}
                  maxLength={500}
                  style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 120 }}
                />
                <Text style={{ color: prompt.length > 470 ? colors.danger : colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 4 }}>{prompt.length}/500</Text>
              </View>
            </Animated.View>
          )}
          {postType === 'text' && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              {isFirstEcho && (
                <View
                  style={{
                    marginBottom: 14,
                    padding: 14,
                    borderRadius: radius.card,
                    backgroundColor: colors.accent + '14',
                    borderWidth: 1,
                    borderColor: colors.accent + '30',
                  }}
                >
                  <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 11, letterSpacing: 0.6, marginBottom: 4 }}>
                    YOUR FIRST ECHO
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>
                    We picked a question to get you started. Take your time — a one-line take is fine. You can always edit later.
                  </Text>
                </View>
              )}
              <Text style={s.label}>Question</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput multiline value={prompt} onChangeText={setPrompt} placeholder="What question or prompt started this?" placeholderTextColor={colors.textMuted} maxLength={280} style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 56 }} />
                <Text style={{ color: prompt.length > 260 ? colors.danger : prompt.length > 240 ? colors.accent : colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 4 }}>{prompt.length}/280</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 4, gap: 6 }}>
                <Lightning color={colors.accent} size={12} />
                <Text style={[s.label, { marginBottom: 0 }]}>Your Echo</Text>
              </View>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput
                  multiline
                  value={response}
                  onChangeText={setResponse}
                  onSelectionChange={e => setResponseCaret(e.nativeEvent.selection.start)}
                  onFocus={() => setResponseFocused(true)}
                  onBlur={() => setResponseFocused(false)}
                  placeholder="Share the take people should remember."
                  placeholderTextColor={colors.textMuted}
                  maxLength={1000}
                  style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 110 }}
                />
                <Text style={{ color: response.length > 950 ? colors.danger : response.length > 850 ? colors.accent : colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 4 }}>{response.length}/1000</Text>
              </View>

              {/* Co-author */}
              {coAuthor ? (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 4, gap: 6 }}>
                    <Users color={colors.accent} size={12} />
                    <Text style={[s.label, { marginBottom: 0 }]}>Co-author</Text>
                  </View>
                  <View style={[s.surface, { padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                    <Avatar name={coAuthor.display_name || coAuthor.username} color={coAuthor.avatar_color} url={coAuthor.avatar_url} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.small }}>{coAuthor.display_name || coAuthor.username}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{coAuthor.username}</Text>
                    </View>
                    <Pressable onPress={() => { setCoAuthor(null); setCoAuthorResponse(''); }} hitSlop={8}>
                      <X color={colors.textMuted} size={16} />
                    </Pressable>
                  </View>
                  <Text style={s.label}>{`${coAuthor.display_name || coAuthor.username}'s take`}</Text>
                  <View style={[s.surface, { padding: 14, marginBottom: 4 }]}>
                    <TextInput
                      multiline
                      value={coAuthorResponse}
                      onChangeText={setCoAuthorResponse}
                      placeholder={`How would @${coAuthor.username} answer?`}
                      placeholderTextColor={colors.textMuted}
                      maxLength={1000}
                      style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 80 }}
                    />
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 4 }}>{coAuthorResponse.length}/1000</Text>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => { setCoAuthorPickerOpen(true); setCoAuthorQuery(''); }}
                  style={[s.surface, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginBottom: 14, gap: 6, borderStyle: 'dashed' }]}
                >
                  <Users color={colors.textMuted} size={14} />
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.small, fontWeight: '600' }}>Add a co-author</Text>
                </Pressable>
              )}
            </Animated.View>
          )}

          {/* Photo post */}
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
                  <ImageIcon color={colors.border} size={40} weight="duotone" />
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>No photos selected</Text>
                </View>
              )}

              <Text style={s.label}>Caption (optional)</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput
                  multiline
                  value={caption}
                  onChangeText={setCaption}
                  onSelectionChange={e => setCaptionCaret(e.nativeEvent.selection.start)}
                  onFocus={() => setCaptionFocused(true)}
                  onBlur={() => setCaptionFocused(false)}
                  placeholder="Add a caption…"
                  placeholderTextColor={colors.textMuted}
                  maxLength={300}
                  style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 56 }}
                />
              </View>
            </Animated.View>
          )}

          {/* Video post */}
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
                  <VideoCamera color={colors.border} size={44} weight="duotone" />
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>No video selected</Text>
                </View>
              )}

              <Text style={s.label}>Caption (optional)</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput
                  multiline
                  value={caption}
                  onChangeText={setCaption}
                  onSelectionChange={e => setCaptionCaret(e.nativeEvent.selection.start)}
                  onFocus={() => setCaptionFocused(true)}
                  onBlur={() => setCaptionFocused(false)}
                  placeholder="Add a caption…"
                  placeholderTextColor={colors.textMuted}
                  maxLength={300}
                  style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 56 }}
                />
              </View>
            </Animated.View>
          )}

          {/* Poll post */}
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
          <Animated.View entering={animation(FadeInDown.delay(60).duration(220))}>
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

        {/* @-mentions autocomplete — overlays the active input */}
        {responseFocused && postType === 'text' && (
          <MentionSuggestions
            text={response}
            caret={responseCaret}
            onPick={(u) => {
              const { text: nt } = applyMentionPick(response, responseCaret, u.username);
              setResponse(nt);
              setResponseCaret(nt.length);
            }}
          />
        )}
        {captionFocused && (postType === 'photo' || postType === 'video') && (
          <MentionSuggestions
            text={caption}
            caret={captionCaret}
            onPick={(u) => {
              const { text: nt } = applyMentionPick(caption, captionCaret, u.username);
              setCaption(nt);
              setCaptionCaret(nt.length);
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
