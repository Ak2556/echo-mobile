import React, { useState, useRef, useEffect } from 'react';
import { useVoiceScreenActions } from '../lib/voice/useVoiceScreenActions';
import {
  View, Text, TextInput, ScrollView, KeyboardAvoidingView,
  Platform, Pressable, Alert, Modal, StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { MAX_VIDEO_DURATION_MS, videoUploadVerdict } from '../lib/videoUploadGuard';
import { ResponsiveScreen } from '../components/ui/ResponsiveScreen';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { QuotedEchoCard } from '../src/features/feed/ui/QuotedEchoCard';
import { VideoPreview } from '../src/features/feed/ui/VideoPreview';
import { MentionSuggestions, applyMentionPick } from '../src/features/feed/ui/MentionSuggestions';
import { MusicPickerModal, Song } from '../components/ui/MusicPicker';
import Animated, { FadeInDown, FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import {
  PaperPlaneTilt, Hash, MusicNotes,
  VideoCamera, ChartBar, X, Plus, Clock, Camera, Images, CheckCircle, Question,
  Users, MagnifyingGlass, PencilSimple, CaretLeft, CaretRight,
} from 'phosphor-react-native';
import { ActionSheet } from '../components/common/ActionSheet';
import { composerMediaAspect, formatClipDuration, parseTags } from '../lib/composerMedia';
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
import { mayOfferPush, notePushOffered, registerForPush } from '../lib/push';
import { PushPrePrompt } from '../components/onboarding/PushPrePrompt';
import { isSupabaseRemote } from '../lib/remoteConfig';
import { getSessionUserId, uploadEchoImages, uploadEchoVideo, searchRemoteUsers } from '../lib/supabaseEchoApi';
import { publishOrQueue } from '../lib/publishEcho';
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

/**
 * One header style for every optional section of the composer: prompt, poll,
 * tags, co-author, photos, video, music. They used to be five hand-rolled
 * variants with different icon colours, sizes, indents and close-button
 * placement, so the screen changed shape depending on what you added.
 */
function SectionHeader({ icon, label, onRemove, removeLabel }: {
  icon: React.ReactNode;
  label: string;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const { colors, fontSizes, font } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginLeft: 4, minHeight: 24 }}>
      {icon}
      <Text style={[font.bodySemibold, { flex: 1, color: colors.textSecondary, fontSize: fontSizes.caption }]}>{label}</Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel={removeLabel ?? `${ttx('Remove')} ${label}`}>
          <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHover }}>
            <X color={colors.textSecondary} size={13} weight="bold" />
          </View>
        </Pressable>
      )}
    </View>
  );
}

/**
 * A composer add-on chip. Layout sits on the inner View: box props on a
 * Pressable are dropped in release builds. Inactive chips used grey-on-grey
 * (textMuted on surface) and read as disabled; active ones only tinted the
 * border. Now inactive is readable and active is unmistakably filled.
 */
function ToolChip({ label, Icon, active, onPress }: {
  label: string;
  Icon: React.ComponentType<{ color: string; size: number; weight?: 'regular' | 'fill' | 'bold' }>;
  active: boolean;
  onPress: () => void;
}) {
  const { colors, fontSizes, font, radius } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 13,
        borderRadius: radius.full,
        backgroundColor: active ? colors.accent : colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? colors.accent : colors.border,
      }}>
        <Icon color={active ? '#fff' : colors.accent} size={16} weight={active ? 'fill' : 'regular'} />
        <Text style={[font.bodySemibold, { color: active ? '#fff' : colors.text, fontSize: fontSizes.small }]}>{label}</Text>
      </View>
    </Pressable>
  );
}


export default function CreatePostScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ quoted?: string; prefillTitle?: string; prefillBody?: string; prefillPrompt?: string; firstEcho?: string; prefillImages?: string }>();
  const { colors, radius, fontSizes, animation, font } = useTheme();
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
  // One id per draft, kept across retries of it. A retry after "Publish failed"
  // must reuse it: the failed attempt may have landed after its timeout, and a
  // reused id makes the retry find that post instead of creating a second one.
  // Cleared once the post is published or queued.
  const draftEchoIdRef = useRef<string | null>(null);
  // Cancel the ceremony timer if the user navigates away before it fires
  React.useEffect(() => () => { if (ceremonyTimer.current) clearTimeout(ceremonyTimer.current); }, []);
  const [response, setResponse] = useState(typeof params.prefillBody === 'string' ? params.prefillBody : '');

  // Dictation appends to the body rather than replacing it, so a thought can be
  // spoken in pieces. create_post already prefills this field when the command
  // carried its text; this is the same idea once the composer is open.
  useVoiceScreenActions({
    composeText: (spoken) => {
      setResponse((prev) => (prev ? `${prev} ${spoken}` : spoken));
      return true;
    },
  });
  const [responseCaret, setResponseCaret] = useState(0);
  const [responseFocused, setResponseFocused] = useState(false);
  const [tagsRaw, setTagsRaw] = useState('');
  // One parse for the preview chips and the publish payload.
  const parsedTags = parseTags(tagsRaw);
  const [publishing, setPublishing] = useState(false);

  // Photo state — up to 4 device assets
  const [images, setImages] = useState<LocalImageUpload[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const imageUris = images.map(image => image.uri);

  // Photos handed over by a share from another app. Seeded once: re-running on
  // every render would fight the user every time they removed one.
  const seededShare = useRef(false);
  useEffect(() => {
    if (seededShare.current || !params.prefillImages) return;
    seededShare.current = true;
    try {
      const incoming = JSON.parse(params.prefillImages) as LocalImageUpload[];
      if (Array.isArray(incoming) && incoming.length) {
        setImages(incoming.slice(0, MAX_PHOTOS));
      }
    } catch {
      // A malformed param is not worth blocking the composer for.
    }
  }, [params.prefillImages]);

  // Music state
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<Song | null>(null);

  // Video state — single device URI
  const [video, setVideo] = useState<LocalVideoUpload | null>(null);
  // The preview's height follows the clip's shape, so it needs the box width.
  const [videoBoxWidth, setVideoBoxWidth] = useState(0);
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const videoUri = video?.uri ?? '';

  const setPickedVideo = async (asset: ImagePicker.ImagePickerAsset) => {
    // expo-image-picker omits fileSize on some Android providers, and the old
    // check was `asset.fileSize && ...` — so a missing size skipped the limit
    // entirely and the file failed at the end of the upload instead.
    let bytes = asset.fileSize ?? null;
    if (!bytes) {
      try {
        const info = await FileSystem.getInfoAsync(asset.uri);
        if (info.exists && 'size' in info) bytes = Number(info.size ?? 0) || null;
      } catch {
        // Unknowable size is not a reason to block a post; let the upload try.
      }
    }

    const verdict = videoUploadVerdict({ bytes, durationMs: asset.duration });
    if (!verdict.ok) {
      Alert.alert(verdict.code === 'too-long' ? 'Video too long' : 'Video too large', verdict.message);
      return;
    }
    if (verdict.highBitrate) {
      // Under every hard limit but recorded at camera bitrate, which is most of
      // what Android sends: expo-image-picker's videoExportPreset is iOS-only,
      // so nothing re-encodes it. Worth saying once, not worth blocking.
      Alert.alert(
        'This will be a slow upload',
        'That clip is recorded at a very high quality, so it is much larger than it needs to be. It will still post — it will just take a while, and use more of your data.',
        [{ text: 'Post anyway' }],
      );
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
        width: asset.width,
        height: asset.height,
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
        width: asset.width,
        height: asset.height,
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
      void setPickedVideo(result.assets[0]);
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
      void setPickedVideo(result.assets[0]);
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
      const hashtags = parsedTags;
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
      const echoId = remoteAuthorId ? (draftEchoIdRef.current ??= Crypto.randomUUID()) : Date.now().toString();
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
              // Runs after the composer closes. A network failure queues the
              // post (same id) rather than dropping it; only a permanent
              // rejection takes it back out of the feed.
              publishOrQueue(publishPayload).catch((err: unknown) => {
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
              const res = await publishOrQueue(publishPayload);
              remoteEchoId = res.id;
              if (res.status === 'queued') echo.isPending = true;
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
              const res = await publishOrQueue(publishPayload);
              remoteEchoId = res.id;
              if (res.status === 'queued') echo.isPending = true;
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
              const res = await publishOrQueue(publishPayload);
              remoteEchoId = res.id;
              if (res.status === 'queued') echo.isPending = true;
            }
          }
          break;
        }
      }

      // Published or queued: the next draft gets a new id.
      draftEchoIdRef.current = null;
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
        // After the first publish, offer push (pre-prompt before the OS prompt)
        // if the shared offer policy allows it; otherwise straight to the feed.
        if (isFirst) {
          try {
            if (await mayOfferPush()) {
              notePushOffered();
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
          {/* Raised panel + handle: on colors.bg the sheet was the same black as
              the dimmed screen behind it and read as a floating title. */}
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32, maxHeight: '80%' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={[font.bodyBold, { color: colors.text, fontSize: 18 }]}>{ttx("Add a co-author")}</Text>
              <Pressable onPress={() => setCoAuthorPickerOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel={ttx("Close")}>
                <X color={colors.textSecondary} size={20} />
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
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.small, textAlign: 'center', lineHeight: 20, paddingVertical: 20, paddingHorizontal: 12 }}>
                  {coAuthorQuery ? `${ttx('No one matches')} "${coAuthorQuery}"` : ttx('Search by name or @handle to post this together.')}
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
          {/* The one box — the whole post. Prompt/tags/co-author/media are all
              optional and added from the toolbar below. */}
          {!pollActive && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              {showPrompt && (
                <>
                  <SectionHeader
                    icon={<Question color={colors.accent} size={14} weight="bold" />}
                    label={ttx("Prompt (optional)")}
                    onRemove={() => { setShowPrompt(false); setPrompt(''); }}
                  />
                  <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                    <TextInput multiline textAlignVertical="top" value={prompt} onChangeText={setPrompt} placeholder={ttx("What question or prompt started this?")} placeholderTextColor={colors.textMuted} maxLength={280} style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 44 }} />
                  </View>
                </>
              )}
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput
                  multiline
                  // Android centres multiline text vertically by default, so the
                  // placeholder floated in the middle of the box.
                  textAlignVertical="top"
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
                  <SectionHeader
                    icon={<Users color={colors.accent} size={14} weight="bold" />}
                    label={ttx("Co-author")}
                    onRemove={() => { setCoAuthor(null); setCoAuthorResponse(''); }}
                  />
                  <View style={[s.surface, { padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                    <Avatar name={coAuthor.display_name || coAuthor.username} color={coAuthor.avatar_color} url={coAuthor.avatar_url} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text style={[font.bodySemibold, { color: colors.text, fontSize: fontSizes.small }]}>{coAuthor.display_name || coAuthor.username}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{coAuthor.username}</Text>
                    </View>
                  </View>
                  <Text style={s.label}>{`${coAuthor.display_name || coAuthor.username}'s take`}</Text>
                  <View style={[s.surface, { padding: 14, marginBottom: 4 }]}>
                    <TextInput
                      multiline
                      textAlignVertical="top"
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

          {/* Photos. Adding more goes through the Photo / Camera chips below;
              the old Library + Camera bar here repeated them. */}
          {imageUris.length > 0 && (
            <Animated.View entering={animation(FadeIn.duration(80))} style={{ marginBottom: 14 }}>
              <SectionHeader
                icon={<Images color={colors.accent} size={14} weight="bold" />}
                label={`${ttx("Photos")} · ${imageUris.length}/${MAX_PHOTOS}`}
                onRemove={() => setImages([])}
                removeLabel={ttx("Remove all photos")}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {images.map((img, idx) => (
                  <View
                    key={`${img.uri}-${idx}`}
                    style={{
                      width: images.length === 1 ? '100%' : '48.5%',
                      aspectRatio: images.length === 1 ? composerMediaAspect(img.width, img.height) : 1,
                      borderRadius: radius.card, overflow: 'hidden',
                      backgroundColor: colors.surfaceHover,
                    }}
                  >
                    <Image source={{ uri: img.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    <Pressable onPress={() => removeImage(idx)} hitSlop={6} accessibilityRole="button" accessibilityLabel={ttx("Remove photo")} style={{ position: 'absolute', top: 8, right: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}>
                        <X color="#fff" size={14} weight="bold" />
                      </View>
                    </Pressable>
                    <Pressable onPress={() => setEditingIndex(idx)} hitSlop={6} accessibilityRole="button" accessibilityLabel={ttx("Edit photo")} style={{ position: 'absolute', top: 8, left: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}>
                        <PencilSimple color="#fff" size={14} weight="bold" />
                      </View>
                    </Pressable>
                    {images.length > 1 && (
                      <View style={{ position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row', gap: 8 }}>
                        {([[-1, CaretLeft, ttx("Move photo left"), idx === 0], [1, CaretRight, ttx("Move photo right"), idx === images.length - 1]] as const).map(([dir, Caret, a11y, off]) => (
                          <Pressable key={dir} onPress={() => moveImage(idx, dir)} disabled={off} hitSlop={6} accessibilityRole="button" accessibilityLabel={a11y}>
                            <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', opacity: off ? 0.35 : 1 }}>
                              <Caret color="#fff" size={14} weight="bold" />
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
                {images.length < MAX_PHOTOS && (
                  <Pressable onPress={pickImages} accessibilityRole="button" accessibilityLabel={ttx("Add photo")} style={{ width: images.length === 1 ? '100%' : '48.5%' }}>
                    <View style={{
                      height: images.length === 1 ? 52 : undefined, aspectRatio: images.length === 1 ? undefined : 1,
                      borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border,
                      flexDirection: images.length === 1 ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                      <Plus color={colors.accent} size={18} weight="bold" />
                      <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: fontSizes.small }]}>{ttx("Add photo")}</Text>
                    </View>
                  </Pressable>
                )}
              </View>
            </Animated.View>
          )}

          {/* Video */}
          {video && (
            <Animated.View entering={animation(FadeIn.duration(80))} style={{ marginBottom: 14 }}>
              <SectionHeader
                icon={<VideoCamera color={colors.accent} size={14} weight="bold" />}
                label={[ttx("Video"), formatClipDuration(video.duration)].filter(Boolean).join(' · ')}
                onRemove={() => setVideo(null)}
                removeLabel={ttx("Remove video")}
              />
              <View onLayout={e => setVideoBoxWidth(e.nativeEvent.layout.width)} style={{ borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#000' }}>
                {videoBoxWidth > 0 && (
                  <VideoPreview
                    uri={video.uri}
                    height={Math.round(videoBoxWidth / composerMediaAspect(video.width, video.height))}
                    borderRadius={radius.card}
                    autoplay
                  />
                )}
              </View>
            </Animated.View>
          )}

          {/* Music — the song used to be invisible once picked: only the chip
              changed colour, and tapping it again removed the song silently. */}
          {selectedMusic && (
            <Animated.View entering={animation(FadeIn.duration(80))} style={{ marginBottom: 14 }}>
              <SectionHeader
                icon={<MusicNotes color={colors.accent} size={14} weight="bold" />}
                label={ttx("Music")}
                onRemove={() => setSelectedMusic(null)}
                removeLabel={ttx("Remove music")}
              />
              <Pressable onPress={() => setMusicPickerOpen(true)} accessibilityRole="button" accessibilityLabel={`${selectedMusic.title}, ${selectedMusic.artist}. ${ttx("Change song")}`}>
                <View style={[s.surface, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }]}>
                  <View style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center' }}>
                    {selectedMusic.coverArt
                      ? <Image source={{ uri: selectedMusic.coverArt }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      : <MusicNotes color={colors.accent} size={20} weight="fill" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[font.bodySemibold, { color: colors.text, fontSize: fontSizes.body }]} numberOfLines={1}>{selectedMusic.title}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }} numberOfLines={1}>{selectedMusic.artist}</Text>
                  </View>
                  <Text style={[font.bodySemibold, { color: colors.accent, fontSize: fontSizes.caption, paddingRight: 4 }]}>{ttx("Change")}</Text>
                </View>
              </Pressable>
            </Animated.View>
          )}

          {/* Poll post */}
          {pollActive && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              <SectionHeader
                icon={<ChartBar color={colors.accent} size={14} weight="bold" />}
                label={ttx("Poll question")}
                onRemove={() => setPollActive(false)}
                removeLabel={ttx("Remove poll")}
              />
              <View style={[s.surface, { padding: 14, marginBottom: 16 }]}>
                <TextInput value={pollQuestion} onChangeText={setPollQuestion} placeholder={ttx("Ask your community something…")} placeholderTextColor={colors.textMuted} maxLength={140} style={{ color: colors.text, fontSize: fontSizes.body }} />
              </View>
              <SectionHeader icon={<ChartBar color={colors.accent} size={14} />} label={ttx("Options")} />
              {pollOptions.map((opt, idx) => (
                <View key={idx} style={[s.surface, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 2, marginBottom: 8 }]}>
                  <TextInput value={opt} onChangeText={t => updatePollOption(idx, t)} placeholder={`Option ${idx + 1}`} placeholderTextColor={colors.textMuted} maxLength={80} style={{ flex: 1, color: colors.text, fontSize: fontSizes.body, paddingVertical: 12 }} />
                  {pollOptions.length > 2 && (
                    <Pressable onPress={() => removePollOption(idx)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${ttx('Remove option')} ${idx + 1}`}>
                      <View style={{ padding: 4 }}>
                        <X color={colors.textMuted} size={16} />
                      </View>
                    </Pressable>
                  )}
                </View>
              ))}
              {pollOptions.length < 4 && (
                <Pressable onPress={addPollOption} accessibilityRole="button" accessibilityLabel={ttx("Add option")}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 46, marginBottom: 16, gap: 6, borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border }}>
                    <Plus color={colors.accent} size={16} weight="bold" />
                    <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: fontSizes.small }]}>{ttx("Add option")}</Text>
                  </View>
                </Pressable>
              )}
              <SectionHeader icon={<Clock color={colors.accent} size={14} />} label={ttx("Runs for")} />
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {POLL_DURATIONS.map(d => {
                  const active = pollDurationHours === d.hours;
                  return (
                    <Pressable key={d.hours} onPress={() => setPollDurationHours(d.hours)} style={{ flex: 1 }} accessibilityRole="button" accessibilityState={{ selected: active }}>
                      {/* Same look as the add-on chips below; layout on the inner View. */}
                      <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 38, borderRadius: radius.full, backgroundColor: active ? colors.accent : colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: active ? colors.accent : colors.border }}>
                        <Text style={[font.bodySemibold, { color: active ? '#fff' : colors.text, fontSize: fontSizes.small }]}>{d.label}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          )}

          {/* Tags — optional, from the toolbar */}
          {showTags && (
            <Animated.View entering={animation(FadeIn.duration(80))}>
              <SectionHeader
                icon={<Hash color={colors.accent} size={14} weight="bold" />}
                label={ttx("Tags")}
                onRemove={() => { setShowTags(false); setTagsRaw(''); }}
              />
              <View style={[s.surface, { padding: 12, marginBottom: parsedTags.length ? 8 : 16 }]}>
                <TextInput value={tagsRaw} onChangeText={setTagsRaw} placeholder={ttx("travel food ai")} placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} style={{ color: colors.text, fontSize: fontSizes.body }} />
              </View>
              {/* What will actually be posted, so a stray comma or space is visible now. */}
              {parsedTags.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16, marginLeft: 4 }}>
                  {parsedTags.map(tag => (
                    <View key={tag} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.accentMuted }}>
                      <Text style={[font.bodySemibold, { color: colors.accent, fontSize: fontSizes.caption }]}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Animated.View>
          )}

          {/* Add-on toolbar — everything optional is one tap away */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {[
              // Camera offers photo or video: recording used to live only in a
              // second button bar that appeared after a video was attached.
              { key: 'camera', label: ttx('Camera'), Icon: Camera, active: false, onPress: () => setCameraMenuOpen(true) },
              { key: 'photo', label: ttx('Photo'), Icon: Images, active: imageUris.length > 0, onPress: pickImages },
              { key: 'video', label: ttx('Video'), Icon: VideoCamera, active: videoUri.length > 0, onPress: pickVideo },
              { key: 'music', label: ttx('Music'), Icon: MusicNotes, active: !!selectedMusic, onPress: () => setMusicPickerOpen(true) },
              { key: 'prompt', label: ttx('Prompt'), Icon: Question, active: showPrompt, onPress: () => setShowPrompt(v => !v) },
              { key: 'poll', label: ttx('Poll'), Icon: ChartBar, active: pollActive, onPress: () => setPollActive(v => !v) },
              { key: 'tags', label: ttx('Tags'), Icon: Hash, active: showTags, onPress: () => setShowTags(v => !v) },
              { key: 'coauthor', label: ttx('Co-author'), Icon: Users, active: !!coAuthor, onPress: () => { if (coAuthor) { setCoAuthor(null); setCoAuthorResponse(''); } else { setCoAuthorPickerOpen(true); setCoAuthorQuery(''); } } },
            ]
              // A poll replaces the text body, and the prompt and co-author live
              // in that body, so their chips showed "on" with nothing on screen.
              .filter(({ key }) => !(pollActive && (key === 'prompt' || key === 'coauthor')))
              .map(({ key, label, Icon, active, onPress }) => (
                <ToolChip key={key} label={label} Icon={Icon} active={active} onPress={onPress} />
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

      <ActionSheet
        visible={cameraMenuOpen}
        onClose={() => setCameraMenuOpen(false)}
        title={ttx('Camera')}
        actions={[
          { key: 'photo', label: ttx('Take a photo'), icon: <Camera color={colors.accent} size={18} />, disabled: images.length >= MAX_PHOTOS || !!video, onPress: () => { setCameraMenuOpen(false); void takePhoto(); } },
          { key: 'video', label: ttx('Record a video'), icon: <VideoCamera color={colors.accent} size={18} />, disabled: images.length > 0, onPress: () => { setCameraMenuOpen(false); void recordVideo(); } },
        ]}
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
