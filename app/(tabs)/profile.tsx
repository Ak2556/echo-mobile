import React, { useMemo } from 'react';
import { View, Text, ScrollView, Switch, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import {
  Gear, BookmarkSimple, ChatTeardropDots, CaretRight, Bell,
  Info, SignOut, Shield, PencilSimple, Users, Envelope, Lightning,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { signOut } from '../../lib/auth';

const { width: SW } = Dimensions.get('window');

const SETTINGS_ROWS = [
  { key: 'edit', Icon: PencilSimple, label: 'Edit Profile', route: '/edit-profile' },
  { key: 'bookmarks', Icon: BookmarkSimple, label: 'Bookmarks', route: '/bookmarks' },
  { key: 'messages', Icon: Envelope, label: 'Messages', route: '/messages' },
  { key: 'connections', Icon: Users, label: 'Connections', route: null },
  { key: 'settings', Icon: Gear, label: 'Settings', route: '/settings' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, radius, switchTrack, animation } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    userId,
    username, displayName, bio, avatarColor,
    sessions, bookmarkedIds, publishedEchoes,
    hapticEnabled, setHapticEnabled,
    notificationsEnabled, setNotificationsEnabled,
  } = useAppStore();

  const savedCount = bookmarkedIds.length;
  const displayLabel = displayName || username || 'User';

  // Extract unique hashtags from user's echoes
  const interestTags = useMemo(() => {
    const tags = publishedEchoes.flatMap(e => e.hashtags ?? []);
    return [...new Set(tags)].slice(0, 6);
  }, [publishedEchoes]);

  // Extract media images from user's echoes
  const mediaImages = useMemo(
    () => publishedEchoes.flatMap(e => e.mediaUris ?? []).slice(0, 5),
    [publishedEchoes]
  );

  // Most recent published echo for activity card
  const recentEcho = publishedEchoes[0];

  const handleSignOut = async () => {
    await signOut();
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

      {/* Large initial watermark */}
      <Text
        style={{
          position: 'absolute',
          top: -30,
          right: -24,
          fontSize: 300,
          fontWeight: '900',
          color: 'rgba(255,255,255,0.025)',
          lineHeight: 300,
        }}
        numberOfLines={1}
      >
        {(username || '?').charAt(0).toUpperCase()}
      </Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
      >
        {/* Nav row */}
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
          <Pressable
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
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Edit Profile</Text>
          </Pressable>
        </View>

        {/* Large display name */}
        <Animated.View
          entering={animation(FadeInUp.delay(60).springify())}
          style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 46,
              fontWeight: '900',
              letterSpacing: -1.8,
              lineHeight: 52,
            }}
            numberOfLines={2}
          >
            {displayLabel}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.48)', fontSize: 14, marginTop: 6 }}>
            @{username || 'user'}
          </Text>
          {(bio || 'Echo member — sharing thoughts and experiences.') ? (
            <Text
              style={{
                color: 'rgba(255,255,255,0.68)',
                fontSize: 13,
                lineHeight: 19,
                marginTop: 10,
              }}
              numberOfLines={3}
            >
              {bio || 'Echo member — sharing thoughts and experiences with the community.'}
            </Text>
          ) : null}
        </Animated.View>

        {/* Stats row */}
        <Animated.View
          entering={animation(FadeInUp.delay(120).springify())}
          style={{
            flexDirection: 'row',
            paddingHorizontal: 16,
            gap: 28,
            marginTop: 20,
            marginBottom: 20,
          }}
        >
          {[
            { value: sessions.length, label: 'Chats' },
            { value: publishedEchoes.length, label: 'Echoes' },
            { value: savedCount, label: 'Saved' },
          ].map(stat => (
            <View key={stat.label}>
              <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', lineHeight: 30 }}>
                {stat.value}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.48)', fontSize: 12, marginTop: 2 }}>
                {stat.label}
              </Text>
            </View>
          ))}
        </Animated.View>

        {/* Interest tags */}
        {interestTags.length > 0 && (
          <Animated.View
            entering={animation(FadeInUp.delay(160).springify())}
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              paddingHorizontal: 16,
              gap: 8,
              marginBottom: 24,
            }}
          >
            {interestTags.map(tag => (
              <View
                key={tag}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.09)',
                  borderRadius: 20,
                  paddingHorizontal: 13,
                  paddingVertical: 5,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: 'rgba(255,255,255,0.18)',
                }}
              >
                <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '500' }}>
                  @{tag}
                </Text>
              </View>
            ))}
          </Animated.View>
        )}

        {/* Image grid */}
        {mediaImages.length > 0 && (
          <Animated.View
            entering={animation(FadeInUp.delay(200).springify())}
            style={{ marginBottom: 26 }}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
            >
              {mediaImages.map((uri, i) => (
                <View
                  key={i}
                  style={{ width: 88, height: 88, borderRadius: 14, overflow: 'hidden' }}
                >
                  <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" />
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Recent echo card */}
        {recentEcho && (
          <Animated.View
            entering={animation(FadeInUp.delay(240).springify())}
            style={{ paddingHorizontal: 16, marginBottom: 28 }}
          >
            <GlassPanel borderRadius={18} intensity={50}>
              <View style={{ padding: 16, flexDirection: 'row', gap: 12 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: avatarColor || colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                    {(username || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 19 }}
                    numberOfLines={3}
                  >
                    {recentEcho.response || recentEcho.prompt}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 8 }}>
                    {username || 'you'} · @{username || 'user'}
                  </Text>
                </View>
              </View>
            </GlassPanel>
          </Animated.View>
        )}

        {/* Settings */}
        <Animated.View
          entering={animation(FadeInUp.delay(280).springify())}
          style={{ paddingHorizontal: 16 }}
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
                      style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.07)' }}
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
