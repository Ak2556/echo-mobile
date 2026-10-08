import React, { useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { UserPlus } from 'phosphor-react-native';
import { ResponsiveScreen } from '../components/ui/ResponsiveScreen';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Avatar } from '../components/ui/Avatar';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { UserRowSkeleton } from '../components/ui/Skeleton';
import { showToast } from '../components/ui/Toast';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState, classifyError } from '../components/common/ErrorState';
import { useIncomingFollowRequests, useRespondFollowRequest } from '../hooks/queries/useFollowRequests';
import type { IncomingFollowRequest } from '../lib/supabaseEchoApi';
import { listIsCatchingUp } from '../lib/social/followRequestsView';
import { useVoiceScreenActions } from '../lib/voice/useVoiceScreenActions';
import { useTheme } from '../lib/ui/theme';
import { ttx } from '../lib/i18n/i18n';

/**
 * Who has asked to follow this (private) account. Approving makes them a
 * follower, so they can see your echoes; declining removes the request and tells
 * them nothing.
 */
export default function FollowRequestsScreen() {
  const router = useRouter();
  const { colors, fontSizes, radius } = useTheme();
  const requests = useIncomingFollowRequests();
  const respond = useRespondFollowRequest();
  const visitStartedAt = useRef(Date.now()).current;

  useVoiceScreenActions({ refresh: () => { void requests.refetch(); } });

  const answer = (r: IncomingFollowRequest, accept: boolean) => {
    respond.mutate(
      { requesterId: r.requesterId, accept },
      {
        onSuccess: (existed) => {
          if (!existed) showToast('That request is no longer there', '');
          else showToast(accept ? `@${r.username} can now see your echoes` : `Request from @${r.username} declined`, accept ? 'Approved' : '');
        },
      },
    );
  };

  const data = requests.data ?? [];
  // An empty list left over from an earlier visit is not an answer until this visit has checked.
  const catchingUp = listIsCatchingUp(requests, data.length, visitStartedAt);

  return (
    <ResponsiveScreen>
      <ScreenHeader title={ttx('Follow requests')} />
      {requests.isPending || catchingUp ? (
        <View style={{ paddingTop: 8 }}>
          <UserRowSkeleton />
          <UserRowSkeleton />
          <UserRowSkeleton />
        </View>
      ) : requests.isError && data.length === 0 ? (
        <ErrorState kind={classifyError(requests.error)} onRetry={() => requests.refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={<UserPlus color={colors.accent} size={32} />}
          title={ttx('No requests right now')}
          subtitle={ttx('When someone asks to follow your private account, you can approve or decline them here.')}
        />
      ) : (
        <FlashList
          data={data}
          keyExtractor={r => r.requesterId}
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
              {/* A plain Pressable: AnimatedPressable splits `flex` from the row layout, and the
                  name column collapsed to zero width inside it. */}
              <Pressable
                onPress={() => router.push(`/user/${item.requesterId}`)}
                style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                accessibilityRole="button"
                accessibilityLabel={`${item.displayName}, @${item.username}`}
              >
                <Avatar name={item.displayName} color={item.avatarColor} url={item.avatarUrl} size={44} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.body }}>{item.displayName}</Text>
                  <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: fontSizes.small }}>@{item.username}</Text>
                </View>
              </Pressable>
              <AnimatedPressable
                onPress={() => answer(item, true)}
                accessibilityRole="button"
                accessibilityLabel={`Approve ${item.username}`}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.lg, backgroundColor: colors.accent }}
                scaleValue={0.95}
                haptic="light"
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small }}>{ttx('Approve')}</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => answer(item, false)}
                accessibilityRole="button"
                accessibilityLabel={`Decline ${item.username}`}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.lg, backgroundColor: colors.surfaceHover, borderWidth: 1, borderColor: colors.border }}
                scaleValue={0.95}
                haptic="light"
              >
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.small }}>{ttx('Decline')}</Text>
              </AnimatedPressable>
            </View>
          )}
        />
      )}
    </ResponsiveScreen>
  );
}
