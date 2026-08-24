import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, KeyboardAvoidingView,
  Platform, TouchableOpacity, Pressable, Alert, Modal, StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ResponsiveScreen } from '../components/ui/ResponsiveScreen';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { QuotedEchoCard } from '../src/features/feed/ui/QuotedEchoCard';
import { VideoPreview } from '../src/features/feed/ui/VideoPreview';
import { MentionSuggestions, applyMentionPick } from '../src/features/feed/ui/MentionSuggestions';
import { MusicPickerModal, Song } from '../components/ui/MusicPicker';
import { MusicNotes } from 'phosphor-react-native';
import Animated, { FadeInDown, FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import {
  PaperPlaneTilt, Hash, Image as ImageIcon,
  VideoCamera, ChartBar, X, Plus, Clock, Camera, Images, CheckCircle, Question,
  Users, MagnifyingGlass, PencilSimple, CaretLeft, CaretRight,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Avatar } from '../components/ui/Avatar';
import { warmAvatarColor } from '../lib/avatarPalette';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../src/shared/lib/theme';
import { useI18n, ttx } from '../src/shared/lib/i18n';
import { FeedItem, PollOption } from '../types';
import { coerceFeedItem } from '../lib/localFeedSeed';
import { prependEchoToFeedCache, removeEchoFromFeedCache } from '../lib/queryCache';
import * as Crypto from 'expo-crypto';
import { playSoundEffect } from '../lib/sound';
import { track } from '../src/shared/lib/analytics';
import { getPushPermissionStatus, registerForPush } from '../lib/push';
import { PushPrePrompt } from '../components/onboarding/PushPrePrompt';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { getSessionUserId, uploadEchoImages, uploadEchoVideo, insertRemoteEcho, searchRemoteUsers } from '../lib/supabaseEchoApi';
import { PhotoEditor } from '../src/features/feed/ui/PhotoEditor';
import { isAppOnline } from '../lib/net';
import { outbox } from '../store/outbox';
import type { LocalImageUpload, LocalVideoUpload, UserSearchHit } from '../lib/supabaseEchoApi';


const MAX_PHOTOS = 6;

type PostType = 'text' | 'photo' | 'video' | 'poll' | 'musing';

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
  const { colors, radius, fontSizes, animation } = useTheme();
  const { t } = useI18n();
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

  // Ultra-simple composer: one text box is the whole post. A prompt, tags, and
  // poll are optional sections revealed from the toolbar; photo/video attach
  // inline. The post type is derived from what's attached, not a picker.
  const [showPrompt, setShowPrompt] = useState(Boolean(params.prefillPrompt || params.prefillTitle));
  const [showTags, setShowTags] = useState(false);
  const [pollActive, setPollActive] = useState(false);
  const [prompt, setPrompt] = useState(
    typeof params.prefillPrompt === 'string' ? params.prefillPrompt
    : typeof params.prefillTitle === 'string' ? params.prefillTitle
    : ''
  );
  const [publishedEchoPreview, setPublishedEchoPreview] = useState<{ title: string } | null>(null);
  const [showPushPrePrompt, setShowPushPrePrompt] = useState(false);
  const ceremonyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Synchronous double-submit guard: `publishing` state updates async, so rapid
  // taps can slip through before the button disables. This closes that window.
  const publishingRef = useRef(false);
  // Cancel the ceremony timer if the user navigates away before it fires
  React.useEffect(() => () => { if (ceremonyTimer.current) clearTimeout(ceremonyTimer.current); }, []);
  const [response, setResponse] = useState(typeof params.prefillBody === 'string' ? params.prefillBody : '');
  const [responseCaret, setResponseCaret] = useState(0);
  const [responseFocused, setResponseFocused] = useState(false);
  const [tagsRaw, setTagsRaw] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Photo state — up to 4 device assets
  const [images, setImages] = useState<LocalImageUpload[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const imageUris = images.map(image => image.uri);

  // Music state
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<Song | null>(null);

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

  // Post type is inferred from what's attached, not chosen from a picker.
  const postType: PostType = videoUri.length > 0 ? 'video'
    : imageUris.length > 0 ? 'photo'
    : pollActive ? 'poll'
    : 'text';

  const canPublish = (() => {
    if (publishing) return false;
    switch (postType) {
      case 'text':
        // The one box (response) is enough; a co-author still needs their take.
        if (coAuthor) return response.trim().length > 0 && coAuthorResponse.trim().length > 0;
        return response.trim().length > 0 || prompt.trim().length > 0;
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
      selectionLimit: MAX_PHOTOS - imageUris.length,
      quality: 0.72,
    });
    if (!result.canceled) {
      setImages(prev => [...prev, ...result.assets.map(asset => ({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      }))].slice(0, MAX_PHOTOS));
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
      }].slice(0, MAX_PHOTOS));
    }
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));

  // Reorder within the thumbnail strip.
  const moveImage = (idx: number, dir: -1 | 1) => setImages(prev => {
    const to = idx + dir;
    if (to < 0 || to >= prev.length) return prev;
    const next = [...prev];
    [next[idx], next[to]] = [next[to], next[idx]];
    return next;
  });

  // Replace an image with its edited version (base64 is now stale — drop it).
  const applyEdit = (uri: string) => {
    setImages(prev => prev.map((img, i) => i === editingIndex ? { ...img, uri, base64: null } : img));
    setEditingIndex(null);
  };

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
    if (!canPublish || publishingRef.current) return;
    
    const isToxic = (text: string | null | undefined) => /swear|toxic|curse|badword/i.test(text || '');
    if (isToxic(prompt) || isToxic(response) || isToxic(pollQuestion) || pollOptions.some(o => isToxic(o))) {
      Alert.alert('Moderation Error', 'Your post contains inappropriate language and cannot be published.');
      return;
    }

    publishingRef.current = true;
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

      // Client-generated id → the publish insert is idempotent (safe retry) and
      // the optimistic feed card shares the real row's id.
      const echoId = remoteAuthorId ? Crypto.randomUUID() : Date.now().toString();
      const base = {
        id: echoId,
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
        musicTitle: selectedMusic?.title,
        musicArtist: selectedMusic?.artist,
        musicUrl: selectedMusic?.url,
      };

      let echo: FeedItem;
      let remoteMediaUrls: string[] | undefined;
      let remoteEchoId: string | undefined;

      switch (postType) {
        case 'text':
          echo = coerceFeedItem({
            ...base,
            postType: 'text',
            prompt: prompt.trim(),
            response: response.trim(),
          });
          if (remoteAuthorId) {
            remoteEchoId = echoId;
            const publishPayload = {
              id: echoId,
              authorId: remoteAuthorId,
              prompt: prompt.trim(),
              response: response.trim(),
              quotedEchoId: quotedId,
              musicTitle: selectedMusic?.title,
              musicArtist: selectedMusic?.artist,
              musicUrl: selectedMusic?.url,
            };
            if (!isAppOnline()) {
              echo.isPending = true;
              outbox.enqueue('publish', publishPayload);
            } else {
              insertRemoteEcho(publishPayload).catch((err: unknown) => {
                qc.setQueriesData({ queryKey: ['feed'] }, (old: unknown) => removeEchoFromFeedCache(old, echoId));
                Alert.alert('Post didn’t go through', (err as Error)?.message ?? 'Please check your connection and try again.');
              });
            }
          }
          break;
        case 'photo': {
          // Upload images to Storage first if remote
          if (remoteAuthorId && imageUris.length > 0 && isAppOnline()) {
            remoteMediaUrls = await uploadEchoImages(images);
          }
          const finalUris = remoteMediaUrls ?? imageUris;
          echo = coerceFeedItem({ ...base, postType: 'photo', prompt: response.trim() || 'Photo post', response: '', mediaUris: finalUris });
          if (remoteAuthorId) {
            const publishPayload = { id: echoId, authorId: remoteAuthorId, prompt: response.trim() || 'Photo post', response: '', mediaUrls: remoteMediaUrls || imageUris, postType: 'photo', musicTitle: selectedMusic?.title, musicArtist: selectedMusic?.artist, musicUrl: selectedMusic?.url };
            if (!isAppOnline()) {
              echo.isPending = true;
              outbox.enqueue('publish', publishPayload);
              remoteEchoId = echoId;
            } else {
              const row = await insertRemoteEcho(publishPayload);
              remoteEchoId = row.id;
            }
          }
          break;
        }
        case 'video': {
          const remoteVideoUrl = remoteAuthorId && video && isAppOnline() ? await uploadEchoVideo(video) : undefined;
          const finalVideoUri = remoteVideoUrl ?? videoUri;
          echo = coerceFeedItem({ ...base, postType: 'video', prompt: response.trim() || 'Video post', response: '', videoUri: finalVideoUri });
          if (remoteAuthorId) {
            const publishPayload = { id: echoId, authorId: remoteAuthorId, prompt: response.trim() || 'Video post', response: '', mediaUrls: remoteVideoUrl ? [remoteVideoUrl] : [videoUri], postType: 'video', musicTitle: selectedMusic?.title, musicArtist: selectedMusic?.artist, musicUrl: selectedMusic?.url };
            if (!isAppOnline()) {
              echo.isPending = true;
              outbox.enqueue('publish', publishPayload);
              remoteEchoId = echoId;
            } else {
              const row = await insertRemoteEcho(publishPayload);
              remoteEchoId = row.id;
            }
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
            const publishPayload = {
              id: echoId,
              authorId: remoteAuthorId,
              prompt: pollQuestion.trim(),
              response: JSON.stringify({ options: options.map(o => o.text), durationHours: pollDurationHours }),
              postType: 'poll'
            };
            if (!isAppOnline()) {
              echo.isPending = true;
              outbox.enqueue('publish', publishPayload);
              remoteEchoId = echoId;
            } else {
              const row = await insertRemoteEcho(publishPayload);
              remoteEchoId = row.id;
            }
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
      publishingRef.current = false;
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
    <ResponsiveScreen>
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
              {ttx("Echo sent.")}
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
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.title }}>{ttx("Pick co-author")}</Text>
              <Pressable onPress={() => setCoAuthorPickerOpen(false)} hitSlop={8}>
                <X color={colors.textMuted} size={20} />
              </Pressable>
            </View>
            <View style={[s.surface, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, marginBottom: 12, gap: 8 }]}>
              <MagnifyingGlass color={colors.textMuted} size={16} />
              <TextInput
                value={coAuthorQuery}
                onChangeText={setCoAuthorQuery}
                placeholder={t('create.searchMention')}
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

      <ScreenHeader
        title={t('nav.newEcho')}
        right={
          <AnimatedPressable
            onPress={() => { void handlePublish(); }} disabled={!canPublish} scaleValue={0.92} haptic="medium"
            style={{ minWidth: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, marginRight: 6, borderRadius: radius.full, backgroundColor: canPublish ? colors.accent : colors.surfaceHover, opacity: canPublish ? 1 : 0.5 }}
          >
            <PaperPlaneTilt color="#fff" size={14} />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small, marginLeft: 6 }}>{publishing ? 'Posting…' : 'Post'}</Text>
          </AnimatedPressable>
        }
      />


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
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600', marginBottom: 6 }}>{ttx("QUOTING")}</Text>
              <QuotedEchoCard echo={quotedEcho} />
            </View>
          )}
          {false && (
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
                  {ttx("A musing is a thought you're still working through — no need for a tidy answer. Think out loud.")}
                </Text>
              </View>
              <Text style={s.label}>{ttx("What's on your mind?")}</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput
                  multiline
                  value={prompt}
                  onChangeText={setPrompt}
                  placeholder={t('create.placeholderWorking')}
                  placeholderTextColor={colors.textMuted}
                  maxLength={500}
                  style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 120 }}
                />
                <Text style={{ color: prompt.length > 470 ? colors.danger : colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 4 }}>{prompt.length}/500</Text>
              </View>
            </Animated.View>
          )}
          {/* The one box — the whole post. Prompt/tags/co-author/media are all
              optional and added from the toolbar below. */}
          {!pollActive && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              {showPrompt && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginLeft: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Question color={colors.accent} size={12} />
                      <Text style={[s.label, { marginBottom: 0 }]}>{ttx("Prompt (optional)")}</Text>
                    </View>
                    <Pressable onPress={() => { setShowPrompt(false); setPrompt(''); }} hitSlop={8}><X color={colors.textMuted} size={16} /></Pressable>
                  </View>
                  <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                    <TextInput multiline value={prompt} onChangeText={setPrompt} placeholder={ttx("What question or prompt started this?")} placeholderTextColor={colors.textMuted} maxLength={280} style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 44 }} />
                  </View>
                </>
              )}
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput
                  multiline
                  value={response}
                  onChangeText={setResponse}
                  onSelectionChange={e => setResponseCaret(e.nativeEvent.selection.start)}
                  onFocus={() => setResponseFocused(true)}
                  onBlur={() => setResponseFocused(false)}
                  placeholder={t('create.placeholderMind')}
                  placeholderTextColor={colors.textMuted}
                  maxLength={1000}
                  style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 130 }}
                />
                <Text style={{ color: response.length > 950 ? colors.danger : response.length > 850 ? colors.accent : colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 4 }}>{response.length}/1000</Text>
              </View>

              {/* Co-author take — only when a co-author is added from the toolbar */}
              {coAuthor && (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 4, gap: 6 }}>
                    <Users color={colors.accent} size={12} />
                    <Text style={[s.label, { marginBottom: 0 }]}>{ttx("Co-author")}</Text>
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
              )}
            </Animated.View>
          )}

          {/* Photo post */}
          {imageUris.length > 0 && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              {/* Picker buttons */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <Pressable
                  onPress={pickImages}
                  disabled={imageUris.length >= MAX_PHOTOS}
                  style={[s.surface, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8, opacity: imageUris.length >= MAX_PHOTOS ? 0.4 : 1 }]}
                >
                  <Images color={colors.accent} size={20} />
                  <Text style={{ color: colors.accent, fontWeight: '700', fontSize: fontSizes.body }}>{ttx("Library")}</Text>
                </Pressable>
                <Pressable
                  onPress={takePhoto}
                  disabled={imageUris.length >= MAX_PHOTOS}
                  style={[s.surface, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8, opacity: imageUris.length >= MAX_PHOTOS ? 0.4 : 1 }]}
                >
                  <Camera color={colors.text} size={20} />
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.body }}>{ttx("Camera")}</Text>
                </Pressable>
              </View>

              {/* Count */}
              <Text style={[s.label, { color: imageUris.length >= MAX_PHOTOS ? colors.accent : colors.textMuted }]}>
                {imageUris.length}/{MAX_PHOTOS} {ttx("selected")}{imageUris.length > 1 ? ' · tap ✎ to edit, arrows to reorder' : ''}
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
                        accessibilityRole="button"
                        accessibilityLabel={ttx("Remove photo")}
                        style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 12, padding: 4 }}
                      >
                        <X color="#fff" size={14} />
                      </Pressable>
                      <Pressable
                        onPress={() => setEditingIndex(idx)}
                        accessibilityRole="button"
                        accessibilityLabel={ttx("Edit photo")}
                        style={{ position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 12, padding: 4 }}
                      >
                        <PencilSimple color="#fff" size={14} weight="bold" />
                      </Pressable>
                      {imageUris.length > 1 && (
                        <View style={{ position: 'absolute', bottom: 6, alignSelf: 'center', flexDirection: 'row', gap: 6 }}>
                          <Pressable
                            onPress={() => moveImage(idx, -1)}
                            disabled={idx === 0}
                            accessibilityRole="button"
                            accessibilityLabel={ttx("Move photo left")}
                            style={{ backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 12, padding: 4, opacity: idx === 0 ? 0.35 : 1 }}
                          >
                            <CaretLeft color="#fff" size={14} weight="bold" />
                          </Pressable>
                          <Pressable
                            onPress={() => moveImage(idx, 1)}
                            disabled={idx === imageUris.length - 1}
                            accessibilityRole="button"
                            accessibilityLabel={ttx("Move photo right")}
                            style={{ backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 12, padding: 4, opacity: idx === imageUris.length - 1 ? 0.35 : 1 }}
                          >
                            <CaretRight color="#fff" size={14} weight="bold" />
                          </Pressable>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={[s.surface, { height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 14, gap: 10 }]}>
                  <ImageIcon color={colors.border} size={40} weight="duotone" />
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>{ttx("No photos selected")}</Text>
                </View>
              )}

            </Animated.View>
          )}

          {/* Video post */}
          {videoUri.length > 0 && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              {/* Picker buttons */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <Pressable
                  onPress={pickVideo}
                  style={[s.surface, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 }]}
                >
                  <Images color={colors.accent} size={20} />
                  <Text style={{ color: colors.accent, fontWeight: '700', fontSize: fontSizes.body }}>{ttx("Library")}</Text>
                </Pressable>
                <Pressable
                  onPress={recordVideo}
                  style={[s.surface, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 }]}
                >
                  <VideoCamera color="#EF4444" size={20} />
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.body }}>{ttx("Record")}</Text>
                </Pressable>
              </View>

              {/* Preview / empty state */}
              {videoUri ? (
                <View style={{ marginBottom: 14, borderRadius: radius.card, overflow: 'hidden' }}>
                  <VideoPreview uri={videoUri} height={200} borderRadius={radius.card} autoplay />
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
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>{ttx("No video selected")}</Text>
                </View>
              )}

            </Animated.View>
          )}

          {/* Poll post */}
          {pollActive && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              <Text style={s.label}>{ttx("Question")}</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 16 }]}>
                <TextInput value={pollQuestion} onChangeText={setPollQuestion} placeholder={ttx("Ask your community something…")} placeholderTextColor={colors.textMuted} maxLength={140} style={{ color: colors.text, fontSize: fontSizes.body }} />
              </View>
              <Text style={s.label}>{ttx("Options")}</Text>
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
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.body }}>{ttx("Add option")}</Text>
                </TouchableOpacity>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                <Clock color={colors.textMuted} size={13} />
                <Text style={[s.label, { marginBottom: 0 }]}>{ttx("Poll Duration")}</Text>
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

          {/* Tags — optional, from the toolbar */}
          {showTags && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Hash color={colors.textMuted} size={13} />
                  <Text style={[s.label, { marginBottom: 0 }]}>{ttx("Tags")}</Text>
                </View>
                <Pressable onPress={() => { setShowTags(false); setTagsRaw(''); }} hitSlop={8}><X color={colors.textMuted} size={16} /></Pressable>
              </View>
              <View style={[s.surface, { padding: 12, marginBottom: 16 }]}>
                <TextInput value={tagsRaw} onChangeText={setTagsRaw} placeholder={ttx("ai, react, tips (comma-separated)")} placeholderTextColor={colors.textMuted} autoCapitalize="none" style={{ color: colors.text, fontSize: fontSizes.body }} />
              </View>
            </Animated.View>
          )}

          {/* Add-on toolbar — everything optional is one tap away */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {[
              { key: 'camera', label: 'Camera', Icon: Camera, active: false, onPress: takePhoto },
              { key: 'photo', label: 'Photo', Icon: Images, active: imageUris.length > 0, onPress: pickImages },
              { key: 'video', label: 'Video', Icon: VideoCamera, active: videoUri.length > 0, onPress: pickVideo },
              { key: 'music', label: 'Music', Icon: MusicNotes, active: !!selectedMusic, onPress: () => { if (selectedMusic) setSelectedMusic(null); else setMusicPickerOpen(true); } },
              { key: 'prompt', label: 'Prompt', Icon: Question, active: showPrompt, onPress: () => setShowPrompt(v => !v) },
              { key: 'poll', label: 'Poll', Icon: ChartBar, active: pollActive, onPress: () => setPollActive(v => !v) },
              { key: 'tags', label: 'Tags', Icon: Hash, active: showTags, onPress: () => setShowTags(v => !v) },
              { key: 'coauthor', label: 'Co-author', Icon: Users, active: !!coAuthor, onPress: () => { if (coAuthor) { setCoAuthor(null); setCoAuthorResponse(''); } else { setCoAuthorPickerOpen(true); setCoAuthorQuery(''); } } },
            ].map(({ key, label, Icon, active, onPress }) => (
              <Pressable key={key} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.full, backgroundColor: active ? colors.accentMuted : colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: active ? colors.accent : colors.border }}>
                <Icon color={active ? colors.accent : colors.textMuted} size={16} weight={active ? 'fill' : 'regular'} />
                <Text style={{ color: active ? colors.accent : colors.textMuted, fontSize: fontSizes.small, fontWeight: '700' }}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>

        {/* @-mentions autocomplete — overlays the one text box */}
        {responseFocused && (
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
      </KeyboardAvoidingView>

      <PhotoEditor
        visible={editingIndex !== null}
        uri={editingIndex !== null ? imageUris[editingIndex] : null}
        onDone={applyEdit}
        onCancel={() => setEditingIndex(null)}
      />

      <MusicPickerModal
        visible={musicPickerOpen}
        onClose={() => setMusicPickerOpen(false)}
        onSelect={(song) => {
          setSelectedMusic(song);
          setMusicPickerOpen(false);
        }}
      />
    </ResponsiveScreen>
  );
}
