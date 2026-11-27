import React, { useState } from 'react';
import { Text, KeyboardAvoidingView, Platform, View, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveScreen } from '../../components/ui/ResponsiveScreen';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { CommentsPanel } from '../../components/feed/CommentsPanel';
import { useTheme } from '../../lib/ui/theme';
import { ttx } from '../../lib/i18n/i18n';
import { useFeed } from '../../hooks/useFeed';
import { fetchRemoteEchoById } from '../../lib/supabaseEchoApi';
import { isSupabaseRemote } from '../../lib/core/remoteConfig';
import { personName } from '../../lib/social/personName';

/**
 * Full-screen comments — reached from a notification, a deep link, or the
 * feed. Flow opens the same list in a sheet over the video instead; both
 * render CommentsPanel, so the threading, mentions and composer stay in one
 * place.
 */
export default function CommentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, fontSizes, font } = useTheme();
  const [count, setCount] = useState<number | null>(null);

  // Which post these comments are on. The screen showed only "Comments" and a
  // bare count, so from a notification there was no telling (2026-11-27).
  const { data: feed = [] } = useFeed();
  const cached = feed.find(f => f.id === id);
  const { data: fetched } = useQuery({
    queryKey: ['echo', id],
    queryFn: () => fetchRemoteEchoById(id!),
    enabled: isSupabaseRemote() && !cached && !!id,
    staleTime: 60_000,
  });
  const post = cached ?? fetched;
  const postText = (post?.prompt || post?.response || '').trim();

  return (
    <ResponsiveScreen edges={['top', 'bottom']}>
      {/* The count belongs to the title. On its own at the right it read as a stray "0". */}
      <ScreenHeader title={count ? `${ttx('Comments')} · ${count}` : ttx('Comments')} />
      {post ? (
        <Pressable
          onPress={() => router.push(`/thread/${id}`)}
          accessibilityRole="button"
          style={{ paddingHorizontal: 16, paddingBottom: 12 }}
        >
          <View style={{ borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 10 }}>
            <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: fontSizes.small }]} numberOfLines={1}>
              {personName({ displayName: post.displayName, username: post.username })}
            </Text>
            {postText ? (
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.small, marginTop: 1 }} numberOfLines={2}>
                {postText}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ) : null}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <CommentsPanel echoId={id} onCountChange={setCount} />
      </KeyboardAvoidingView>
    </ResponsiveScreen>
  );
}
