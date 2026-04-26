import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, Switch, StyleSheet, Dimensions, Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInUp, FadeIn,
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import {
  Gear, BookmarkSimple, Envelope, Bell, SignOut, PencilSimple,
  Users, CaretRight, CalendarBlank, Images,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { PostsGrid } from '../../components/profile/PostsGrid';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { signOut } from '../../lib/auth';
import { FeedItem } from '../../types';

const { width: SW } = Dimensions.get('window');

const SETTINGS_ROWS = [
  { key: 'edit',        Icon: PencilSimple,   label: 'Edit Profile',  route: '/edit-profile' },
  { key: 'bookmarks',   Icon: BookmarkSimple, label: 'Bookmarks',     route: '/bookmarks' },
  { key: 'messages',    Icon: Envelope,       label: 'Messages',      route: '/messages' },
  { key: 'connections', Icon: Users,          label: 'Connections',   route: null },
  { key: 'settings',    Icon: Gear,           label: 'Settings',      route: '/settings' },
];

const TAB_WIDTH = SW / 2;

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, radius, switchTrack, animation } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    userId,
    username, displayName, bio, avatarColor,
    publishedEchoes,
    notificationsEnabled, setNotificationsEnabled,
    getFollowers, getFollowing,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'posts' | 'about'>('posts');
  const tabIndicatorX = useSharedValue(0);

  const displayLabel = displayName || username || 'User';
  const followers = getFollowers();
  const following = getFollowing();

  const interestTags = useMemo(() => {
    const tags = publishedEchoes.flatMap(e => e.hashtags ?? []);
    return [...new Set(tags)].slice(0, 8);
  }, [publishedEchoes]);

  const joinedYear = useMemo(() => new Date().getFullYear(), []);

  const handleTabPress = (tab: 'posts' | 'about', index: number) => {
    setActiveTab(tab);
    tabIndicatorX.value = withSpring(index * TAB_WIDTH, ANIM.springSnappy);
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabIndicatorX.value }],
  }));

  const handleSignOut = async () => {
    await signOut();
  };

  const handlePressEcho = (item: FeedItem) => {
    router.push(`/thread/${item.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Full-screen gradient background */}
      <LinearGradient
        colors={[`${avatarColor || colors.accent}70`, '#0a0a0f', '#000']}
        locations={[0, 0.42, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        stickyHeaderIndices={[3]}
      >
        {/* 0: Nav Bar */}
        <View
          style={{
            paddingTop: insets.top + 10,
            paddingHorizontal: 16,
            paddingBottom: 6,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' }}>
            @{username || 'user'}
          </Text>
          <AnimatedPressable
            onPress={() => router.push('/edit-profile')}
            style={{
              position: 'absolute',
              right: 16,
              backgroundColor: 'rgba(255,255,255,0.11)',
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: 'rgba(255,255,255,0.22)',
            }}
            scaleValue={0.93}
            haptic="light"
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Edit Profile</Text>
          </AnimatedPressable>
        </View>

        {/* 1: Hero Row — avatar + social stats */}
        <Animated.View
          entering={animation(FadeInUp.delay(40).springify())}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 16,
            gap: 20,
          }}
        >
          <ProfileAvatar
            displayName={displayLabel}
            avatarColor={avatarColor || colors.accent}
            size={78}
          />

          {/* Stats */}
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
            {/* Posts */}
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.8 }}>
                {publishedEchoes.length}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Posts</Text>
            </View>

            {/* Followers */}
            <AnimatedPressable
              onPress={() => router.push({ pathname: '/followers', params: { userId, tab: 'followers' } })}
              style={{ alignItems: 'center' }}
              scaleValue={0.93}
              haptic="light"
            >
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.8 }}>
                {followers.length}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Followers</Text>
            </AnimatedPressable>

            {/* Following */}
            <AnimatedPressable
              onPress={() => router.push({ pathname: '/followers', params: { userId, tab: 'following' } })}
              style={{ alignItems: 'center' }}
              scaleValue={0.93}
              haptic="light"
            >
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.8 }}>
                {following.length}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Following</Text>
            </AnimatedPressable>
          </View>
        </Animated.View>

        {/* 2: Identity Block */}
        <Animated.View
          entering={animation(FadeInUp.delay(80).springify())}
          style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 26,
              fontWeight: '800',
              letterSpacing: -0.8,
            }}
            numberOfLines={1}
          >
            {displayLabel}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 2 }}>
            @{username || 'user'}
          </Text>
          {bio ? (
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 14,
                lineHeight: 21,
                marginTop: 8,
              }}
              numberOfLines={3}
            >
              {bio}
            </Text>
          ) : null}
        </Animated.View>

        {/* 3: Tab Strip (STICKY) */}
        <Animated.View
          entering={animation(FadeIn.delay(100).duration(80))}
          style={{
            backgroundColor: '#000',
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row' }}>
            {(['posts', 'about'] as const).map((tab, i) => (
              <Pressable
                key={tab}
                onPress={() => handleTabPress(tab, i)}
                style={{
                  flex: 1,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: activeTab === tab ? '700' : '500',
                    color: activeTab === tab ? colors.text : colors.textMuted,
                    textTransform: 'capitalize',
                  }}
                >
                  {tab}
                </Text>
              </Pressable>
            ))}
          </View>
          {/* Sliding indicator */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                bottom: 0,
                width: TAB_WIDTH,
                height: 2,
                backgroundColor: colors.accent,
                borderRadius: 1,
              },
              indicatorStyle,
            ]}
          />
        </Animated.View>

        {/* 4: Tab Content */}
        <View>
          {activeTab === 'posts' ? (
            <PostsGrid
              echoes={publishedEchoes}
              onPressEcho={handlePressEcho}
              avatarColor={avatarColor || colors.accent}
            />
          ) : (
            <View style={{ padding: 16, gap: 12 }}>
              {/* Full bio */}
              <GlassPanel borderRadius={radius.card} intensity={40}>
                <View style={{ padding: 16 }}>
                  <Text style={{ color: colors.text, fontSize: 15, lineHeight: 23 }}>
                    {bio || 'Echo member — sharing thoughts and experiences with the community.'}
                  </Text>
                </View>
              </GlassPanel>

              {/* Interest tags */}
              {interestTags.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {interestTags.map(tag => (
                    <View
                      key={tag}
                      style={{
                        backgroundColor: colors.accentMuted,
                        borderRadius: 20,
                        paddingHorizontal: 13,
                        paddingVertical: 5,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: colors.accent + '44',
                      }}
                    >
                      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '500' }}>
                        #{tag}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Joined row */}
              <GlassPanel borderRadius={radius.card} intensity={30}>
                <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <CalendarBlank color={colors.textMuted} size={18} />
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                    Joined Echo {joinedYear}
                  </Text>
                </View>
              </GlassPanel>
            </View>
          )}
        </View>

        {/* 5: Account Section */}
        <Animated.View
          entering={animation(FadeInUp.delay(160).springify())}
          style={{ paddingHorizontal: 16, marginTop: 24 }}
        >
          <Text
            style={{
              color: 'rgba(255,255,255,0.35)',
              fontSize: 11,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 10,
              marginLeft: 4,
            }}
          >
            Account
          </Text>

          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 16 }}>
            <View style={{ paddingHorizontal: 16 }}>
              {SETTINGS_ROWS.map(({ key, Icon, label, route }, i) => (
                <React.Fragment key={key}>
                  <AnimatedPressable
                    onPress={() =>
                      route
                        ? router.push(route as any)
                        : router.push({ pathname: '/followers', params: { userId, tab: 'followers' } })
                    }
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13 }}
                    scaleValue={0.98}
                    haptic="light"
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      <Icon color="rgba(255,255,255,0.65)" size={17} />
                    </View>
                    <Text style={{ color: '#fff', fontSize: 15, flex: 1 }}>{label}</Text>
                    <CaretRight color="rgba(255,255,255,0.3)" size={16} />
                  </AnimatedPressable>
                  {i < SETTINGS_ROWS.length - 1 && (
                    <View
                      style={{
                        height: StyleSheet.hairlineWidth,
                        backgroundColor: 'rgba(255,255,255,0.07)',
                      }}
                    />
                  )}
                </React.Fragment>
              ))}
            </View>
          </GlassPanel>

          {/* Preferences */}
          <Text
            style={{
              color: 'rgba(255,255,255,0.35)',
              fontSize: 11,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 10,
              marginLeft: 4,
            }}
          >
            Preferences
          </Text>
          <GlassPanel borderRadius={radius.card} style={{ marginBottom: 16 }}>
            <View style={{ paddingHorizontal: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13 }}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Bell color="rgba(255,255,255,0.65)" size={17} />
                </View>
                <Text style={{ color: '#fff', fontSize: 15, flex: 1 }}>Notifications</Text>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  trackColor={switchTrack}
                  thumbColor="#fff"
                />
              </View>
            </View>
          </GlassPanel>

          {/* Sign out */}
          <AnimatedPressable
            onPress={() => { void handleSignOut(); }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 13,
              backgroundColor: 'rgba(239,68,68,0.1)',
              borderRadius: radius.card,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: 'rgba(239,68,68,0.28)',
              marginBottom: 8,
            }}
            scaleValue={0.97}
            haptic="medium"
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                backgroundColor: 'rgba(239,68,68,0.12)',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}
            >
              <SignOut color={colors.danger} size={17} />
            </View>
            <Text style={{ color: colors.danger, fontSize: 15, fontWeight: '500' }}>Sign Out</Text>
          </AnimatedPressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
