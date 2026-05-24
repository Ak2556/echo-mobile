import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Switch, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  BookmarkSimple,
  Bell,
  CalendarBlank,
  CaretRight,
  Compass,
  Envelope,
  FilmStrip,
  Gear,
  Images,
  PencilSimple,
  SignOut,
  Sparkle,
  SquaresFour,
  Users,
} from 'phosphor-react-native';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { PostsGrid } from '../../components/profile/PostsGrid';
import { FeedCard } from '../../components/social/FeedCard';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { signOut } from '../../lib/auth';
import { FeedItem } from '../../types';
import { useRemoteProfileBundle } from '../../hooks/queries/useRemoteProfile';
import { buildCreatorProfile } from '../../lib/echoUX';
import { StreakXPBadge } from '../../components/social/StreakXPBadge';
import { features } from '../../lib/featureFlags';

const COMPACT_TEXT_SCALE = 1.15;
const BODY_TEXT_SCALE = 1.25;
const TITLE_TEXT_SCALE = 1.12;

const SETTINGS_ROWS = [
  { key: 'myechoes', Icon: FilmStrip, label: 'My Echoes', route: '/(tabs)/echoes' },
  ...(features.miniApps ? [{ key: 'apps', Icon: SquaresFour, label: 'Apps', route: '/(tabs)/apps' }] : []),
  { key: 'bookmarks', Icon: BookmarkSimple, label: 'Bookmarks', route: '/bookmarks' },
  { key: 'messages', Icon: Envelope, label: 'Messages', route: '/messages' },
  { key: 'connections', Icon: Users, label: 'Connections', route: null },
  { key: 'settings', Icon: Gear, label: 'Settings', route: '/settings' },
];

type ProfileColors = ReturnType<typeof useTheme>['colors'];
type ProfileRadius = ReturnType<typeof useTheme>['radius'];
type ProfileFont = ReturnType<typeof useTheme>['font'];

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, radius, switchTrack, font } = useTheme();
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
  const handle = username || 'user';
  const { data: remoteBundle } = useRemoteProfileBundle(userId);
  const createdAt = remoteBundle?.user?.createdAt ?? new Date().toISOString();
  const creatorProfile = useMemo(
    () => buildCreatorProfile({ displayName: displayLabel, bio, createdAt }, publishedEchoes),
    [bio, createdAt, displayLabel, publishedEchoes],
  );

  const followerCount = remoteBundle?.user?.followerCount ?? 0;
  const followingCount = remoteBundle?.user?.followingCount ?? 0;
  const profileAccent = avatarColor || colors.accent;

  const handlePressEcho = (item: FeedItem) => router.push(`/thread/${item.id}`);
  const openFollowers = (tab: 'followers' | 'following') => {
    router.push({ pathname: '/followers', params: { userId, tab } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 120,
        }}
      >
        <View style={styles.screenHeader}>
          <View style={styles.headerCopy}>
            <Text
              style={[font.bodySemibold, styles.headerEyebrow, { color: colors.textMuted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
            >
              @{handle}
            </Text>
            <Text
              style={[font.displayBlack, styles.headerTitle, { color: colors.text, letterSpacing: 0 }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TITLE_TEXT_SCALE}
            >
              Profile
            </Text>
          </View>
          <View style={styles.headerActions}>
            <IconButton
              icon={<Gear color={colors.textSecondary} size={18} />}
              label="Settings"
              colors={colors}
              radius={radius}
              onPress={() => router.push('/settings')}
            />
            <Pressable
              onPress={() => router.push('/edit-profile')}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
              style={({ pressed }) => [
                styles.editButton,
                {
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceHover : colors.surface,
                  borderRadius: radius.full,
                },
              ]}
            >
              <PencilSimple color={colors.accent} size={15} weight="bold" />
              <Text
                style={[font.bodySemibold, styles.editButtonText, { color: colors.text }]}
                numberOfLines={1}
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              >
                Edit
              </Text>
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.card,
            },
          ]}
        >
          <View style={styles.identityRow}>
            <ProfileAvatar
              displayName={displayLabel}
              avatarColor={profileAccent}
              avatarUrl={avatarUrl || undefined}
              size={82}
            />
            <View style={styles.identityCopy}>
              <Text
                style={[font.displayBlack, styles.displayName, { color: colors.text, letterSpacing: 0 }]}
                numberOfLines={2}
                maxFontSizeMultiplier={TITLE_TEXT_SCALE}
              >
                {displayLabel}
              </Text>
              <Text
                style={[font.bodySemibold, styles.username, { color: colors.textMuted }]}
                numberOfLines={1}
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              >
                @{handle}
              </Text>
            </View>
          </View>

          <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />

          <View style={styles.statsRow}>
            <StatButton value={publishedEchoes.length} label="Echoes" colors={colors} font={font} />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <StatButton value={followerCount} label="Followers" colors={colors} font={font} onPress={() => openFollowers('followers')} />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <StatButton value={followingCount} label="Following" colors={colors} font={font} onPress={() => openFollowers('following')} />
          </View>

          {bio ? (
            <Text
              style={[font.body, styles.bioText, { color: colors.textSecondary }]}
              maxFontSizeMultiplier={BODY_TEXT_SCALE}
            >
              {bio}
            </Text>
          ) : (
            <Pressable
              onPress={() => router.push('/edit-profile')}
              accessibilityRole="button"
              accessibilityLabel="Add a bio"
              style={({ pressed }) => [
                styles.addBioButton,
                {
                  backgroundColor: pressed ? colors.accentMuted : colors.glassLightFill,
                  borderColor: colors.border,
                  borderRadius: radius.md,
                },
              ]}
            >
              <PencilSimple color={colors.accent} size={16} />
              <Text
                style={[font.bodySemibold, styles.addBioText, { color: colors.accent }]}
                numberOfLines={1}
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              >
                Add a bio
              </Text>
            </Pressable>
          )}
        </View>

        <StreakXPBadge />

        {creatorProfile.topics.length > 0 && (
          <View style={styles.sectionBlock}>
            <SectionLabel label="Expertise" colors={colors} font={font} icon={<Sparkle color={colors.accent} size={15} />} />
            <View style={styles.topicWrap}>
              {creatorProfile.topics.slice(0, 8).map(topic => (
                <View
                  key={topic}
                  style={[
                    styles.topicChip,
                    {
                      backgroundColor: colors.accentMuted,
                      borderColor: colors.accent + '40',
                      borderRadius: radius.full,
                    },
                  ]}
                >
                  <Text
                    style={[font.bodySemibold, styles.topicText, { color: colors.accent }]}
                    numberOfLines={1}
                    maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                  >
                    #{topic}
                  </Text>
                </View>
              ))}
              {creatorProfile.topics.length > 8 && (
                <View
                  style={[
                    styles.topicChip,
                    { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.full },
                  ]}
                >
                  <Text
                    style={[font.bodySemibold, styles.topicText, { color: colors.textMuted }]}
                    maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                  >
                    +{creatorProfile.topics.length - 8} more
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {creatorProfile.pinned.length > 0 ? (
          <View style={styles.sectionBlock}>
            <SectionLabel label="Signature Echo" colors={colors} font={font} icon={<Compass color={colors.accent} size={15} />} />
            <FeedCard item={creatorProfile.pinned[0]} index={0} onPress={() => handlePressEcho(creatorProfile.pinned[0])} />
          </View>
        ) : null}

        <ProfileTabBar activeTab={activeTab} onChange={setActiveTab} colors={colors} radius={radius} font={font} />

        {activeTab === 'posts' ? (
          publishedEchoes.length === 0 ? (
            <ProfileEmptyPosts
              colors={colors}
              radius={radius}
              font={font}
              onCreate={() => router.push('/create-post')}
            />
          ) : (
            <PostsGrid echoes={publishedEchoes} onPressEcho={handlePressEcho} avatarColor={profileAccent} />
          )
        ) : (
          <AboutPanel
            bio={bio}
            creatorProfile={creatorProfile}
            colors={colors}
            radius={radius}
            font={font}
            onEdit={() => router.push('/edit-profile')}
          />
        )}

        <View style={styles.accountArea}>
          <SectionLabel label="Account" colors={colors} font={font} />
          <View
            style={[
              styles.menuPanel,
              { borderRadius: radius.card, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            {SETTINGS_ROWS.map(({ key, Icon, label, route }, index) => (
              <React.Fragment key={key}>
                <MenuRow
                  icon={<Icon color={colors.textSecondary} size={19} />}
                  label={label}
                  colors={colors}
                  font={font}
                  onPress={() => route ? router.push(route as any) : openFollowers('followers')}
                />
                {index < SETTINGS_ROWS.length - 1 ? <View style={[styles.menuDivider, { backgroundColor: colors.border }]} /> : null}
              </React.Fragment>
            ))}
          </View>

          <SectionLabel label="Quick Controls" colors={colors} font={font} />
          <View
            style={[
              styles.menuPanel,
              { borderRadius: radius.card, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <View style={styles.switchRow}>
              <Bell color={colors.textSecondary} size={19} />
              <Text
                style={[font.bodySemibold, styles.switchLabel, { color: colors.text }]}
                numberOfLines={1}
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              >
                Notifications
              </Text>
              <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} trackColor={switchTrack} thumbColor="#fff" />
            </View>
          </View>

          <Pressable
            onPress={() => { void signOut(); }}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            style={({ pressed }) => [
              styles.signOutButton,
              {
                borderRadius: radius.full,
                borderColor: 'rgba(239,68,68,0.32)',
                backgroundColor: pressed ? colors.dangerMuted : 'transparent',
              },
            ]}
          >
            <SignOut color={colors.danger} size={16} />
            <Text
              style={[font.bodySemibold, styles.signOutText, { color: colors.danger }]}
              numberOfLines={1}
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
            >
              Sign Out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function IconButton({
  icon,
  label,
  colors,
  radius,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  colors: ProfileColors;
  radius: ProfileRadius;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconButton,
        {
          borderRadius: radius.full,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceHover : colors.surface,
        },
      ]}
    >
      {icon}
    </Pressable>
  );
}

function StatButton({
  value,
  label,
  colors,
  font,
  onPress,
}: {
  value: number;
  label: string;
  colors: ProfileColors;
  font: ProfileFont;
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${formatCount(value)}`}
      style={styles.statButton}
    >
      <Text
        style={[font.display, styles.statValue, { color: colors.text, letterSpacing: 0 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
      >
        {formatCount(value)}
      </Text>
      <Text
        style={[font.bodySemibold, styles.statLabel, { color: colors.textMuted }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ProfileTabBar({
  activeTab,
  onChange,
  colors,
  radius,
  font,
}: {
  activeTab: 'posts' | 'about';
  onChange: (tab: 'posts' | 'about') => void;
  colors: ProfileColors;
  radius: ProfileRadius;
  font: ProfileFont;
}) {
  return (
    <View style={[styles.tabShell, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.full }]}>
      {(['posts', 'about'] as const).map(tab => {
        const active = activeTab === tab;
        return (
          <Pressable
            key={tab}
            onPress={() => onChange(tab)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab === 'posts' ? 'Show Echoes' : 'Show About'}
            style={[
              styles.tabButton,
              {
                backgroundColor: active ? colors.accent : 'transparent',
                borderRadius: radius.full,
              },
            ]}
          >
            <Text
              style={[
                font.bodySemibold,
                styles.tabText,
                { color: active ? '#fff' : colors.textMuted },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
            >
              {tab === 'posts' ? 'Echoes' : 'About'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ProfileEmptyPosts({
  colors,
  radius,
  font,
  onCreate,
}: {
  colors: ProfileColors;
  radius: ProfileRadius;
  font: ProfileFont;
  onCreate: () => void;
}) {
  return (
    <View
      style={[
        styles.emptyPanel,
        { borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.card },
      ]}
    >
      <Images color={colors.accent} size={26} weight="duotone" />
      <Text
        style={[font.display, styles.emptyTitle, { color: colors.text, letterSpacing: 0 }]}
        numberOfLines={2}
        maxFontSizeMultiplier={TITLE_TEXT_SCALE}
      >
        No Echoes yet
      </Text>
      <Text
        style={[font.body, styles.emptySubtitle, { color: colors.textMuted }]}
        maxFontSizeMultiplier={BODY_TEXT_SCALE}
      >
        Publish one strong conversation or idea so people can understand what you are about.
      </Text>
      <Pressable
        onPress={onCreate}
        accessibilityRole="button"
        accessibilityLabel="Create Echo"
        style={({ pressed }) => [
          styles.createButton,
          {
            borderRadius: radius.full,
            backgroundColor: pressed ? colors.accentMuted : colors.accent,
          },
        ]}
      >
        <PencilSimple color="#fff" size={15} weight="bold" />
        <Text
          style={[font.bodySemibold, styles.createButtonText]}
          numberOfLines={1}
          maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
        >
          Create Echo
        </Text>
      </Pressable>
    </View>
  );
}

function AboutPanel({
  bio,
  creatorProfile,
  colors,
  radius,
  font,
  onEdit,
}: {
  bio: string;
  creatorProfile: ReturnType<typeof buildCreatorProfile>;
  colors: ProfileColors;
  radius: ProfileRadius;
  font: ProfileFont;
  onEdit: () => void;
}) {
  return (
    <View style={styles.aboutArea}>
      <View style={[styles.aboutCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card }]}>
        {bio ? (
          <Text
            style={[font.body, styles.aboutBio, { color: colors.textSecondary }]}
            maxFontSizeMultiplier={BODY_TEXT_SCALE}
          >
            {bio}
          </Text>
        ) : (
          <Pressable
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel="Add a profile bio"
            style={styles.aboutEmpty}
          >
            <PencilSimple color={colors.accent} size={17} />
            <Text
              style={[font.bodySemibold, styles.aboutEmptyText, { color: colors.accent }]}
              numberOfLines={1}
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
            >
              Add a profile bio
            </Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.aboutCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card }]}>
        <InfoRow icon={<CalendarBlank color={colors.textMuted} size={18} />} label={`Joined Echo ${creatorProfile.joinedYear}`} colors={colors} font={font} />
        {creatorProfile.topics[0] ? (
          <InfoRow icon={<Sparkle color={colors.textMuted} size={18} />} label={`Best known for ${creatorProfile.topics[0]}`} colors={colors} font={font} />
        ) : null}
        <InfoRow
          icon={<Compass color={colors.textMuted} size={18} />}
          label={creatorProfile.series[0] ? `Current series: ${creatorProfile.series[0]}` : 'No public series yet'}
          colors={colors}
          font={font}
        />
      </View>
    </View>
  );
}

function SectionLabel({
  label,
  colors,
  font,
  icon,
}: {
  label: string;
  colors: ProfileColors;
  font: ProfileFont;
  icon?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionLabelRow}>
      {icon}
      <Text
        style={[font.bodySemibold, styles.sectionLabel, { color: colors.textMuted }]}
        numberOfLines={1}
        maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
      >
        {label}
      </Text>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  colors,
  font,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  colors: ProfileColors;
  font: ProfileFont;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.menuTouchable,
        { backgroundColor: pressed ? colors.surfaceHover : 'transparent' },
      ]}
    >
      <View style={styles.menuRowContent}>
        <View style={styles.menuIcon}>{icon}</View>
        <Text
          style={[font.bodySemibold, styles.menuLabel, { color: colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
        >
          {label}
        </Text>
        <CaretRight color={colors.textMuted} size={17} />
      </View>
    </Pressable>
  );
}

function InfoRow({
  icon,
  label,
  colors,
  font,
}: {
  icon: React.ReactNode;
  label: string;
  colors: ProfileColors;
  font: ProfileFont;
}) {
  return (
    <View style={styles.infoRow}>
      {icon}
      <Text
        style={[font.body, styles.infoText, { color: colors.textSecondary }]}
        numberOfLines={2}
        maxFontSizeMultiplier={BODY_TEXT_SCALE}
      >
        {label}
      </Text>
    </View>
  );
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${trimCount(value / 1_000_000)}M`;
  if (value >= 1_000) return `${trimCount(value / 1_000)}K`;
  return `${value}`;
}

function trimCount(value: number) {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, '');
}

const styles = StyleSheet.create({
  screenHeader: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerEyebrow: {
    fontSize: 12,
    lineHeight: 16,
  },
  headerTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    minWidth: 72,
    height: 40,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  editButtonText: {
    fontSize: 13,
    lineHeight: 16,
  },
  heroCard: {
    marginHorizontal: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    fontSize: 27,
    lineHeight: 32,
  },
  username: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 14,
    marginBottom: 12,
  },
  statsRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  statButton: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  statValue: {
    fontSize: 21,
    lineHeight: 25,
  },
  statLabel: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  bioText: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  addBioButton: {
    marginTop: 12,
    minHeight: 42,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addBioText: {
    fontSize: 13,
    lineHeight: 17,
  },
  sectionBlock: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionLabelRow: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginLeft: 4,
    marginBottom: 9,
  },
  sectionLabel: {
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  topicWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  topicChip: {
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  topicText: {
    fontSize: 12,
    lineHeight: 16,
  },
  tabShell: {
    marginHorizontal: 16,
    marginTop: 18,
    padding: 4,
    minHeight: 48,
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  tabText: {
    fontSize: 13,
    lineHeight: 17,
  },
  emptyPanel: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 28,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 23,
    lineHeight: 29,
    marginTop: 14,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  createButton: {
    marginTop: 18,
    minHeight: 42,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 17,
  },
  aboutArea: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  aboutCard: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 13,
  },
  aboutBio: {
    fontSize: 15,
    lineHeight: 23,
  },
  aboutEmpty: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aboutEmptyText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  accountArea: {
    paddingHorizontal: 16,
    marginTop: 22,
  },
  menuPanel: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  menuTouchable: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuRowContent: {
    minHeight: 28,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuIcon: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 50,
  },
  switchRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  switchLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  signOutButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  signOutText: {
    fontSize: 14,
    lineHeight: 18,
  },
});
