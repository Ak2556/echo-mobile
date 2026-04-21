import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, KeyboardAvoidingView,
  Platform, Alert, TouchableOpacity, Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft, Send, Sparkles, Hash, Image as ImageIcon,
  Video, BarChart2, X, Plus, Play, Clock,
} from 'lucide-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { showToast } from '../components/ui/Toast';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../lib/theme';
import { FeedItem, PollOption } from '../types';
import { coerceFeedItem } from '../lib/localFeedSeed';
import { playSoundEffect } from '../lib/sound';

type PostType = 'text' | 'photo' | 'video' | 'poll';

const POST_TYPES: { key: PostType; label: string; Icon: React.ComponentType<any> }[] = [
  { key: 'text', label: 'Text', Icon: Sparkles },
  { key: 'photo', label: 'Photo', Icon: ImageIcon },
  { key: 'video', label: 'Video', Icon: Video },
  { key: 'poll', label: 'Poll', Icon: BarChart2 },
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
  const { username, userId, avatarColor, displayName, publishEcho } = useAppStore();

  const [postType, setPostType] = useState<PostType>('text');
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [caption, setCaption] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Photo / video state
  const [mediaUris, setMediaUris] = useState<string[]>([]);
  const [videoUri, setVideoUri] = useState<string | null>(null);

  // Poll state
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDurationHours, setPollDurationHours] = useState(24);

  const canPublish = (() => {
    if (publishing) return false;
    switch (postType) {
      case 'text': return prompt.trim().length > 0 && response.trim().length > 0;
      case 'photo': return mediaUris.length > 0;
      case 'video': return !!videoUri;
      case 'poll': return pollQuestion.trim().length > 0 && pollOptions.filter(o => o.trim()).length >= 2;
    }
  })();

  const pickImages = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to add images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.85,
    });
    if (!result.canceled) {
      setMediaUris(result.assets.map(a => a.uri).slice(0, 4));
    }
  }, []);

  const pickVideo = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to add a video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setVideoUri(result.assets[0].uri);
    }
  }, []);

  const addPollOption = () => {
    if (pollOptions.length < 4) setPollOptions(prev => [...prev, '']);
  };

  const updatePollOption = (idx: number, text: string) => {
    setPollOptions(prev => prev.map((o, i) => i === idx ? text : o));
  };

  const removePollOption = (idx: number) => {
    if (pollOptions.length <= 2) return;
    setPollOptions(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePublish = () => {
    if (!canPublish) return;

    const hashtags = tagsRaw
      .split(/[\s,]+/)
      .map(t => t.replace(/^#/, '').trim())
      .filter(Boolean);

    const base = {
      id: Date.now().toString(),
      userId,
      username: username || 'anonymous',
      displayName: displayName || username || 'anonymous',
      avatarColor: avatarColor || colors.accent,
      isVerified: false,
      likes: 0,
      isLiked: false,
      isBookmarked: false,
      isReposted: false,
      repostCount: 0,
      commentCount: 0,
      viewCount: 0,
      hashtags,
      createdAt: new Date().toISOString(),
    };

    let echo: FeedItem;

    switch (postType) {
      case 'text':
        echo = coerceFeedItem({ ...base, postType: 'text', prompt: prompt.trim(), response: response.trim() });
        break;
      case 'photo':
        echo = coerceFeedItem({
          ...base,
          postType: 'photo',
          prompt: caption.trim() || 'Photo',
          response: '',
          mediaUris,
        });
        break;
      case 'video':
        echo = coerceFeedItem({
          ...base,
          postType: 'video',
          prompt: caption.trim() || 'Video',
          response: '',
          videoUri: videoUri!,
        });
        break;
      case 'poll': {
        const options: PollOption[] = pollOptions
          .filter(o => o.trim())
          .map((o, i) => ({ id: `opt_${i}`, text: o.trim(), votes: 0 }));
        const endsAt = new Date(Date.now() + pollDurationHours * 3600 * 1000).toISOString();
        echo = coerceFeedItem({
          ...base,
          postType: 'poll',
          prompt: pollQuestion.trim(),
          response: '',
          poll: { question: pollQuestion.trim(), options, totalVotes: 0, endsAt },
        });
        break;
      }
    }

    setPublishing(true);
    setTimeout(() => {
      publishEcho(echo!);
      qc.invalidateQueries({ queryKey: ['feed'] });
      playSoundEffect('success');
      showToast('Echo published!', '✨');
      setPublishing(false);
      router.back();
    }, 300);
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
          onPress={handlePublish}
          disabled={!canPublish}
          scaleValue={0.92}
          haptic="medium"
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 14, paddingVertical: 8,
            borderRadius: radius.full,
            backgroundColor: canPublish ? colors.accent : colors.surfaceHover,
            opacity: canPublish ? 1 : 0.5,
          }}
        >
          <Send color="#fff" size={14} />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small, marginLeft: 6 }}>
            {publishing ? 'Posting…' : 'Post'}
          </Text>
        </AnimatedPressable>
      </View>

      {/* Post-type selector */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
        {POST_TYPES.map(({ key, label, Icon }) => {
          const active = postType === key;
          return (
            <Pressable
              key={key}
              onPress={() => setPostType(key)}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                paddingVertical: 8, gap: 4,
                borderRadius: radius.full,
                backgroundColor: active ? colors.accent : colors.surface,
                borderWidth: 1,
                borderColor: active ? colors.accent : colors.border,
              }}
            >
              <Icon color={active ? '#fff' : colors.textMuted} size={13} />
              <Text style={{ color: active ? '#fff' : colors.textMuted, fontWeight: '600', fontSize: fontSizes.caption }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Author row */}
          <Animated.View entering={animation(FadeInDown.delay(40).springify())} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginTop: 4 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: avatarColor || colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.body }}>{(username || '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.body }}>{displayName || username || 'You'}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{username || 'anonymous'}</Text>
            </View>
          </Animated.View>

          {/* ── TEXT panel ── */}
          {postType === 'text' && (
            <Animated.View entering={animation(FadeIn.duration(200))}>
              <Text style={s.label}>Prompt</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput
                  multiline value={prompt} onChangeText={setPrompt}
                  placeholder="What did you ask Echo?" placeholderTextColor={colors.textMuted}
                  maxLength={280} style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 56 }}
                />
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 4 }}>{prompt.length}/280</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 4, gap: 6 }}>
                <Sparkles color={colors.accent} size={12} />
                <Text style={[s.label, { marginBottom: 0 }]}>Echo Response</Text>
              </View>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput
                  multiline value={response} onChangeText={setResponse}
                  placeholder="Share what the AI said, your insights, or anything worth echoing…"
                  placeholderTextColor={colors.textMuted} maxLength={1000}
                  style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 110 }}
                />
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, textAlign: 'right', marginTop: 4 }}>{response.length}/1000</Text>
              </View>
            </Animated.View>
          )}

          {/* ── PHOTO panel ── */}
          {postType === 'photo' && (
            <Animated.View entering={animation(FadeIn.duration(200))}>
              <Text style={s.label}>Photos (up to 4)</Text>
              {mediaUris.length === 0 ? (
                <TouchableOpacity
                  onPress={pickImages}
                  style={[s.surface, { height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: 14, gap: 10 }]}
                >
                  <ImageIcon color={colors.textMuted} size={36} />
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.body }}>Tap to pick photos</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {mediaUris.map((uri, idx) => (
                      <View key={uri} style={{ width: '48%', aspectRatio: 1, borderRadius: radius.card, overflow: 'hidden', position: 'relative' }}>
                        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                        <Pressable
                          onPress={() => setMediaUris(prev => prev.filter((_, i) => i !== idx))}
                          style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: 3 }}
                        >
                          <X color="#fff" size={14} />
                        </Pressable>
                      </View>
                    ))}
                    {mediaUris.length < 4 && (
                      <TouchableOpacity
                        onPress={pickImages}
                        style={{ width: '48%', aspectRatio: 1, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Plus color={colors.textMuted} size={28} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
              <Text style={s.label}>Caption (optional)</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput
                  multiline value={caption} onChangeText={setCaption}
                  placeholder="Add a caption…" placeholderTextColor={colors.textMuted}
                  maxLength={300} style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 60 }}
                />
              </View>
            </Animated.View>
          )}

          {/* ── VIDEO panel ── */}
          {postType === 'video' && (
            <Animated.View entering={animation(FadeIn.duration(200))}>
              <Text style={s.label}>Video</Text>
              {!videoUri ? (
                <TouchableOpacity
                  onPress={pickVideo}
                  style={[s.surface, { height: 200, alignItems: 'center', justifyContent: 'center', marginBottom: 14, gap: 10 }]}
                >
                  <Video color={colors.textMuted} size={40} />
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.body }}>Tap to pick a video</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ marginBottom: 14, borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.surface, height: 200, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  <Video color={colors.textMuted} size={48} />
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 8 }}>Video selected</Text>
                  <Pressable
                    onPress={() => setVideoUri(null)}
                    style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 14, padding: 5 }}
                  >
                    <X color="#fff" size={15} />
                  </Pressable>
                </View>
              )}
              <Text style={s.label}>Caption (optional)</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 14 }]}>
                <TextInput
                  multiline value={caption} onChangeText={setCaption}
                  placeholder="Add a caption…" placeholderTextColor={colors.textMuted}
                  maxLength={300} style={{ color: colors.text, fontSize: fontSizes.body, minHeight: 60 }}
                />
              </View>
            </Animated.View>
          )}

          {/* ── POLL panel ── */}
          {postType === 'poll' && (
            <Animated.View entering={animation(FadeIn.duration(200))}>
              <Text style={s.label}>Question</Text>
              <View style={[s.surface, { padding: 14, marginBottom: 16 }]}>
                <TextInput
                  value={pollQuestion} onChangeText={setPollQuestion}
                  placeholder="Ask your community something…" placeholderTextColor={colors.textMuted}
                  maxLength={140} style={{ color: colors.text, fontSize: fontSizes.body }}
                />
              </View>
              <Text style={s.label}>Options</Text>
              {pollOptions.map((opt, idx) => (
                <View key={idx} style={[s.surface, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 2, marginBottom: 8 }]}>
                  <TextInput
                    value={opt} onChangeText={t => updatePollOption(idx, t)}
                    placeholder={`Option ${idx + 1}`} placeholderTextColor={colors.textMuted}
                    maxLength={80} style={{ flex: 1, color: colors.text, fontSize: fontSizes.body, paddingVertical: 12 }}
                  />
                  {pollOptions.length > 2 && (
                    <Pressable onPress={() => removePollOption(idx)} style={{ padding: 4 }}>
                      <X color={colors.textMuted} size={16} />
                    </Pressable>
                  )}
                </View>
              ))}
              {pollOptions.length < 4 && (
                <TouchableOpacity
                  onPress={addPollOption}
                  style={[s.surface, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginBottom: 16, gap: 6, borderStyle: 'dashed' }]}
                >
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
                    <Pressable
                      key={d.hours}
                      onPress={() => setPollDurationHours(d.hours)}
                      style={{
                        flex: 1, alignItems: 'center', paddingVertical: 10,
                        borderRadius: radius.full,
                        backgroundColor: active ? colors.accent : colors.surface,
                        borderWidth: 1, borderColor: active ? colors.accent : colors.border,
                      }}
                    >
                      <Text style={{ color: active ? '#fff' : colors.textMuted, fontWeight: '600', fontSize: fontSizes.small }}>{d.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          )}

          {/* Shared tags field */}
          <Animated.View entering={animation(FadeInDown.delay(60).springify())}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
              <Hash color={colors.textMuted} size={13} />
              <Text style={[s.label, { marginBottom: 0 }]}>Tags</Text>
            </View>
            <View style={[s.surface, { padding: 12, marginBottom: 16 }]}>
              <TextInput
                value={tagsRaw} onChangeText={setTagsRaw}
                placeholder="ai, react, tips (comma-separated)"
                placeholderTextColor={colors.textMuted} autoCapitalize="none"
                style={{ color: colors.text, fontSize: fontSizes.body }}
              />
            </View>
          </Animated.View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
