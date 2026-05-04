import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Switch, StyleSheet, Dimensions, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BookmarkSimple, Bell, CalendarBlank, CaretRight, Compass, Envelope, Gear, Images, NotePencil, SignOut, Sparkle, Users } from 'phosphor-react-native';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { PostsGrid } from '../../components/profile/PostsGrid';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { signOut } from '../../lib/auth';
import { FeedItem } from '../../types';
import { useRemoteProfileBundle } from '../../hooks/queries/useRemoteProfile';
import { buildCreatorProfile } from '../../lib/echoUX';

const { width: SW } = Dimensions.get('window');
const TAB_WIDTH = SW / 2;

const SETTINGS_ROWS = [
  { key: 'edit', Icon: NotePencil, label: 'Edit Profile', route: '/edit-profile' },
  { key: 'bookmarks', Icon: BookmarkSimple, label: 'Bookmarks', route: '/bookmarks' },
  { key: 'messages', Icon: Envelope, label: 'Messages', route: '/messages' },
  { key: 'connections', Icon: Users, label: 'Connections', route: null },
  { key: 'settings', Icon: Gear, label: 'Settings', route: '/settings' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, radius, switchTrack, fontSizes } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    userId,
    username,
    displayName,
    bio,
    avatarColor,
    avatarUrl,
    publishedEchoes,
    notificationsEnabled,
    setNotificationsEnabled,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<'posts' | 'about'>('posts');
  const displayLabel = displayName || username || 'User';
  const { data: remoteBundle } = useRemoteProfileBundle(userId);
  const createdAt = remoteBundle?.user?.createdAt ?? new Date().toISOString();
  const creatorProfile = useMemo(
    () => buildCreatorProfile({ displayName: displayLabel, bio, createdAt }, publishedEchoes),
    [bio, createdAt, displayLabel, publishedEchoes],
  );

  const handlePressEcho = (item: FeedItem) => router.push(`/thread/${item.id}`);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient
        colors={[`${avatarColor || colors.accent}${colors.isDark ? '60' : '24'}`, colors.bg, colors.isDark ? colors.bgPure : colors.bg]}
        locations={[0, 0.36, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>@{username || 'user'}</Text>
          <AnimatedPressable
            onPress={() => router.push('/edit-profile')}
            style={{ position: 'absolute', right: 16, backgroundColor: colors.surfaceHover, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
          >
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>Edit Profile</Text>
          </AnimatedPressable>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <ProfileAvatar displayName={displayLabel} avatarColor={avatarColor || colors.accent} avatarUrl={avatarUrl || undefined} size={78} />
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
            <Stat value={publishedEchoes.length} label="Echoes" />
            <Pressable onPress={() => router.push({ pathname: '/followers', params: { userId, tab: 'followers' } })}>
              <Stat value={remoteBundle?.user?.followerCount ?? 0} label="Followers" />
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/followers', params: { userId, tab: 'following' } })}>
              <Stat value={remoteBundle?.user?.followingCount ?? 0} label="Following" />
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.8 }}>{displayLabel}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 4 }}>@{username || 'user'}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 10 }}>
            {creatorProfile.headline}
          </Text>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <GlassPanel borderRadius={radius.card}>
            <View style={{ padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Sparkle color={colors.accent} size={16} />
                <Text style={{ color: colors.text, fontWeight: '700' }}>Why follow</Text>
              </View>
              <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>
                Posts mostly about {creatorProfile.topics[0]?.toLowerCase() || 'AI conversations'}, with a focus on turning useful prompts into sharable takeaways.
              </Text>
              {creatorProfile.topics.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {creatorProfile.topics.map(topic => (
                    <View key={topic} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.accentMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent + '40' }}>
                      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>#{topic}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </GlassPanel>

          {creatorProfile.pinned.length > 0 ? (
            <GlassPanel borderRadius={radius.card}>
              <View style={{ padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Compass color={colors.accent} size={16} />
                  <Text style={{ color: colors.text, fontWeight: '700' }}>Pinned highlights</Text>
                </View>
                {creatorProfile.pinned.map(item => (
                  <Pressable key={item.id} onPress={() => handlePressEcho(item)} style={{ paddingVertical: 10 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>{item.editorialTitle || item.prompt}</Text>
                    <Text style={{ color: colors.textSecondary, marginTop: 4, lineHeight: 20 }} numberOfLines={2}>
                      {item.authorNote || item.response || 'Open to view the full Echo.'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </GlassPanel>
          ) : null}
        </View>

        <View style={{ marginTop: 20, flexDirection: 'row' }}>
          {(['posts', 'about'] as const).map((tab, index) => {
            const active = activeTab === tab;
            return (
              <Pressable key={tab} onPress={() => setActiveTab(tab)} style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? colors.text : colors.textMuted, textTransform: 'capitalize' }}>{tab}</Text>
                {active ? <View style={{ position: 'absolute', bottom: 0, width: TAB_WIDTH, height: 2, backgroundColor: colors.accent }} /> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.glassBorder }} />

        {activeTab === 'posts' ? (
          publishedEchoes.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32, gap: 12 }}>
              <Images color={colors.textMuted} size={44} weight="duotone" />
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>No Echoes yet</Text>
              <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                Publish one strong conversation or idea so people can understand what you are about.
              </Text>
              <AnimatedPressable onPress={() => router.push('/create-post')} style={{ marginTop: 4, backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Create Echo</Text>
              </AnimatedPressable>
            </View>
          ) : (
            <PostsGrid echoes={publishedEchoes} onPressEcho={handlePressEcho} avatarColor={avatarColor || colors.accent} />
          )
        ) : (
          <View style={{ padding: 16, gap: 12 }}>
            <GlassPanel borderRadius={radius.card}>
              <View style={{ padding: 16 }}>
                <Text style={{ color: colors.text, fontSize: 15, lineHeight: 23 }}>
                  {bio || 'Building a profile around useful Echoes, clear prompts, and conversation-led posts.'}
                </Text>
              </View>
            </GlassPanel>
            <GlassPanel borderRadius={radius.card}>
              <View style={{ padding: 16, gap: 12 }}>
                <InfoRow icon={<CalendarBlank color={colors.textMuted} size={18} />} label={`Joined Echo ${creatorProfile.joinedYear}`} colors={colors} />
                <InfoRow icon={<Sparkle color={colors.textMuted} size={18} />} label={`Best known for ${creatorProfile.topics[0] || 'AI conversations'}`} colors={colors} />
                <InfoRow icon={<Compass color={colors.textMuted} size={18} />} label={creatorProfile.series[0] ? `Current series: ${creatorProfile.series[0]}` : 'No public series yet'} colors={colors} />
              </View>
            </GlassPanel>
          </View>
        )}

        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginLeft: 4 }}>Account</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 16 }}>
            <View style={{ paddingHorizontal: 16 }}>
              {SETTINGS_ROWS.map(({ key, Icon, label, route }, index) => (
                <React.Fragment key={key}>
                  <AnimatedPressable
                    onPress={() => route ? router.push(route as any) : router.push({ pathname: '/followers', params: { userId, tab: 'followers' } })}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13 }}
                  >
                    <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Icon color={colors.textSecondary} size={17} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{label}</Text>
                    <CaretRight color={colors.textMuted} size={16} />
                  </AnimatedPressable>
                  {index < SETTINGS_ROWS.length - 1 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} /> : null}
                </React.Fragment>
              ))}
            </View>
          </GlassPanel>

          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginLeft: 4 }}>Quick controls</Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 16 }}>
            <View style={{ paddingHorizontal: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13 }}>
                <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Bell color={colors.textSecondary} size={17} />
                </View>
                <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>Notifications</Text>
                <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} trackColor={switchTrack} thumbColor="#fff" />
              </View>
            </View>
          </GlassPanel>

          <AnimatedPressable onPress={() => { void signOut(); }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(239,68,68,0.28)', marginBottom: 8 }}>
            <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(239,68,68,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <SignOut color={colors.danger} size={17} />
            </View>
            <Text style={{ color: colors.danger, fontSize: 15, fontWeight: '500' }}>Sign Out</Text>
          </AnimatedPressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.8 }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, colors }: { icon: React.ReactNode; label: string; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {icon}
      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{label}</Text>
    </View>
  );
}
