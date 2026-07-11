import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import {
  BookmarkSimple,
  CalendarBlank,
  CaretRight,
  Compass,
  Gear,
  PencilSimple,
  SignOut,
  Sparkle,
  SquaresFour,
  X,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { ProfilePhotoPreview } from '../../components/ui/ProfilePhotoPreview';
import { PostsGrid } from '../../components/profile/PostsGrid';
import { FeedCard } from '../../components/social/FeedCard';
import { ThinkingFingerprintCard } from '../../components/social/ThinkingFingerprintCard';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { signOut } from '../../lib/auth';
import { FeedItem } from '../../types';
import { useRemoteProfileBundle } from '../../hooks/queries/useRemoteProfile';
import { buildCreatorProfile } from '../../lib/echoUX';
import { StreakXPBadge } from '../../components/social/StreakXPBadge';
import { features } from '../../lib/featureFlags';
import { useResponsiveLayout } from '../../lib/responsive';

const COMPACT_TEXT_SCALE = 1.15;
const BODY_TEXT_SCALE = 1.25;
const TITLE_TEXT_SCALE = 1.12;

interface CompletionStep { key: string; label: string; done: boolean }

function ProfileCompletionBanner({
  steps,
  onDismiss,
  onPress,
}: {
  steps: CompletionStep[];
  onDismiss: () => void;
  onPress: () => void;
}) {
  const { colors, font } = useTheme();
  const done = steps.filter(s => s.done).length;
  const total = steps.length;
  const pct = Math.round((done / total) * 100);
  const missing = steps.filter(s => !s.done).map(s => s.label);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        marginHorizontal: 16,
        paddingVertical: 10,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={[font.bodySemibold, { color: colors.text, fontSize: 13, flex: 1 }]} numberOfLines={1}>
        Complete your profile{missing.length ? ` — add ${missing[0].toLowerCase()}` : ''}
      </Text>
      <Text style={[font.body, { color: colors.textMuted, fontSize: 12 }]}>{pct}%</Text>
      <Pressable onPress={onDismiss} hitSlop={12}>
        <X color={colors.textMuted} size={14} />
      </Pressable>
    </Pressable>
  );
}

// Library menu — only the two surfaces that are PRIMARY discovery for
// the user's own content. Messages moved into /settings; Settings became
// the gear icon in the header. Apps stays gated behind feature flag.
const SETTINGS_ROWS: { key: string; Icon: React.ComponentType<any>; label: string; route: Href | null }[] = [
  { key: 'bookmarks', Icon: BookmarkSimple, label: 'Bookmarks', route: '/bookmarks' },
  ...(features.miniApps ? [{ key: 'apps', Icon: SquaresFour, label: 'Apps', route: '/(tabs)/apps' as Href }] : []),
];

type ProfileColors = ReturnType<typeof useTheme>['colors'];
type ProfileRadius = ReturnType<typeof useTheme>['radius'];
type ProfileFont = ReturnType<typeof useTheme>['font'];

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, radius, font } = useTheme();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const {
    userId,
    username,
    displayName,
    bio,
    avatarUrl,
    profilePhotoVisible,
    publishedEchoes,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<'posts' | 'about'>('posts');
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const completionSteps: CompletionStep[] = useMemo(() => [
    { key: 'name',   label: 'display name', done: !!(displayName && displayName !== username) },
    { key: 'bio',    label: 'bio',          done: !!(bio && bio.trim().length > 0) },
    { key: 'photo',  label: 'photo',        done: !!(avatarUrl && profilePhotoVisible) },
  ], [displayName, username, bio, avatarUrl, profilePhotoVisible]);

  const profileComplete = completionSteps.every(s => s.done);
  const showCompletionBanner = !bannerDismissed && !profileComplete && publishedEchoes.length < 10;
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
  // Own profile rings with the brand accent — stored avatarColors are
  // legacy indigo defaults that fight the warm palette.
  const profileAccent = colors.accent;
  const visibleAvatarUrl = profilePhotoVisible ? (avatarUrl || undefined) : undefined;

  const handlePressEcho = (item: FeedItem) => router.push(`/thread/${item.id}`);
  const openFollowers = (tab: 'followers' | 'following') => {
    router.push({ pathname: '/followers', params: { userId, tab } });
  };

  // Status-bar fade — solid background block fixed to the top, sized to
  // the iOS safe-area inset. Scrolled content (streak chip, level card,
  // etc.) glides UNDER this instead of colliding with the time / dynamic
  // island.
  const statusFadeHeight = insets.top + 8;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: insets.top + (layout.isDesktop ? 28 : 10),
          paddingBottom: insets.bottom + layout.bottomChromePadding,
        }}
      >
        <View style={layout.contentStyle}>
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
              style={[font.displayBlack, styles.headerTitle, { color: colors.text }]}
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

        <View style={styles.heroCard}>
          <View style={styles.identityRow}>
            <Pressable
              onPress={() => visibleAvatarUrl ? setPhotoPreviewOpen(true) : undefined}
              disabled={!visibleAvatarUrl}
              accessibilityRole={visibleAvatarUrl ? 'button' : undefined}
              accessibilityLabel={visibleAvatarUrl ? 'Open profile photo' : undefined}
              style={({ pressed }) => [
                styles.avatarPressable,
                { opacity: pressed ? 0.82 : 1 },
              ]}
            >
              <ProfileAvatar
                displayName={displayLabel}
                avatarColor={profileAccent}
                avatarUrl={visibleAvatarUrl}
                size={72}
              />
            </Pressable>
            <View style={styles.identityCopy}>
              <Text
                style={[font.displayBlack, styles.displayName, { color: colors.text }]}
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
              {!profilePhotoVisible && (
                <Text
                  style={[font.bodySemibold, styles.photoHiddenText, { color: colors.textMuted }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                >
                  Photo hidden
                </Text>
              )}
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

          {/* Missing bio is handled by the completion banner below — a second
              "Add a bio" affordance here just doubled the same action. */}
          {bio ? (
            <Text
              style={[font.body, styles.bioText, { color: colors.textSecondary }]}
              maxFontSizeMultiplier={BODY_TEXT_SCALE}
            >
              {bio}
            </Text>
          ) : null}
        </View>

        {showCompletionBanner && (
          <ProfileCompletionBanner
            steps={completionSteps}
            onDismiss={() => setBannerDismissed(true)}
            onPress={() => router.push('/edit-profile')}
          />
        )}

        <StreakXPBadge />

        {creatorProfile.topics.length > 0 && (
          <View style={styles.sectionBlock}>
            <SectionLabel label="Expertise" colors={colors} font={font} />
            <View style={[styles.topicWrap, { columnGap: 12, rowGap: 4 }]}>
              {creatorProfile.topics.slice(0, 8).map(topic => (
                <Text
                  key={topic}
                  style={[font.body, styles.topicText, { color: colors.accent, fontWeight: '500' }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                >
                  #{topic}
                </Text>
              ))}
              {creatorProfile.topics.length > 8 && (
                <Text
                  style={[font.body, styles.topicText, { color: colors.textMuted }]}
                  maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
                >
                  +{creatorProfile.topics.length - 8} more
                </Text>
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

        <View style={styles.accountArea}>
          <SectionLabel label="Account" colors={colors} font={font} />
          <View style={styles.menuPanel}>
            {SETTINGS_ROWS.map(({ key, Icon, label, route }, index) => (
              <React.Fragment key={key}>
                <ProfileListRow
                  icon={<Icon color={colors.textSecondary} size={18} />}
                  label={label}
                  colors={colors}
                  radius={radius}
                  font={font}
                  onPress={() => route ? router.push(route) : openFollowers('followers')}
                />
                {index < SETTINGS_ROWS.length - 1 ? <View style={[styles.menuDivider, { backgroundColor: colors.border }]} /> : null}
              </React.Fragment>
            ))}
          </View>

          {/* QUICK CONTROLS removed — notifications toggle lives in
              /settings now (single source of truth for app prefs, reached
              via the gear icon in the screen header). */}
        </View>

        {userId ? <ThinkingFingerprintCard userId={userId} isSelf /> : null}

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
            <PostsGrid
              echoes={publishedEchoes}
              onPressEcho={handlePressEcho}
              avatarColor={profileAccent}
              containerWidth={layout.contentWidth}
            />
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

        <View style={styles.sessionArea}>
          <Pressable
            onPress={() => { void signOut(); }}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            accessibilityHint="Signs you out of Echo"
          >
            <View style={[styles.signOutButton, { borderRadius: radius.full, backgroundColor: colors.dangerMuted }]}>
              <SignOut color={colors.danger} size={16} />
              <Text
                style={[font.bodySemibold, styles.signOutText, { color: colors.danger }]}
                numberOfLines={1}
                maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
              >
                Sign Out
              </Text>
            </View>
          </Pressable>
        </View>
        </View>
      </ScrollView>

      {/* Status-bar mask — solid background block fixed to the top of the
          screen, sized to the iOS safe-area inset. Scrolled content glides
          UNDER it instead of colliding with the time / dynamic island. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: statusFadeHeight,
          backgroundColor: colors.bg,
        }}
      />
      <ProfilePhotoPreview
        visible={photoPreviewOpen}
        imageUrl={visibleAvatarUrl}
        displayName={displayLabel}
        onClose={() => setPhotoPreviewOpen(false)}
      />
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
        style={[font.display, styles.statValue, { color: colors.text }]}
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
    <View style={[styles.tabShell, { borderBottomColor: colors.border }]}>
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
                borderBottomWidth: 2,
                borderBottomColor: active ? colors.accent : 'transparent',
                paddingBottom: 6,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: active ? colors.accent : colors.textMuted, fontWeight: active ? '700' : '400' },
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
    <View style={styles.emptyPanel}>
      <Text
        style={[font.display, styles.emptyTitle, { color: colors.text }]}
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
      >
        {/* Layout + fill live on the inner View — pressable style callbacks
            returning arrays drop layout props (see AnimatedPressable note). */}
        <View style={[styles.createButton, { borderRadius: radius.full, backgroundColor: colors.accent }]}>
          <PencilSimple color="#fff" size={15} weight="bold" />
          <Text
            style={[font.bodySemibold, styles.createButtonText]}
            numberOfLines={1}
            maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
          >
            Create Echo
          </Text>
        </View>
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
      <View style={styles.aboutCard}>
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

      <View style={styles.aboutCard}>
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
        style={[font.bodySemibold, styles.sectionLabel, { color: colors.textMuted, letterSpacing: 1.4, textTransform: 'uppercase', fontSize: 12 }]}
        numberOfLines={1}
        maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
      >
        {label}
      </Text>
    </View>
  );
}

function ProfileListRow({
  icon,
  label,
  colors,
  radius,
  font,
  onPress,
  right,
  accessibilityLabel,
}: {
  icon: React.ReactNode;
  label: string;
  colors: ProfileColors;
  radius: ProfileRadius;
  font: ProfileFont;
  onPress?: () => void;
  right?: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const rowContent = (
    <>
      <View style={styles.listRowIconTile}>
        {icon}
      </View>
      <Text
        style={[font.bodySemibold, styles.listRowLabel, { color: colors.text }]}
        numberOfLines={1}
        maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
      >
        {label}
      </Text>
      {right ?? (onPress ? <CaretRight color={colors.textMuted} size={18} /> : null)}
    </>
  );

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={styles.listRowTouchable}
        scaleValue={0.98}
        haptic="light"
      >
        {rowContent}
      </AnimatedPressable>
    );
  }

  return <View style={styles.listRowTouchable}>{rowContent}</View>;
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
    paddingBottom: 10,
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
    fontSize: 24,
    lineHeight: 30,
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
    minWidth: 66,
    height: 38,
    paddingHorizontal: 12,
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
    paddingTop: 14,
    paddingBottom: 4,
  },
  heroAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    opacity: 0.92,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarPressable: {
    flexShrink: 0,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    fontSize: 22,
    lineHeight: 28,
  },
  username: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  photoHiddenText: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 5,
  },
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 12,
    marginBottom: 10,
  },
  statsRow: {
    minHeight: 48,
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
    fontSize: 18,
    lineHeight: 22,
  },
  statLabel: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
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
    marginTop: 10,
    minHeight: 38,
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
    marginTop: 28,
  },
  sectionLabelRow: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginLeft: 4,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    lineHeight: 14,
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
    marginTop: 14,
    minHeight: 42,
    flexDirection: 'row',
    gap: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
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
    marginTop: 24,
    paddingHorizontal: 18,
    paddingBottom: 8,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    textAlign: 'center',
  },
  createButton: {
    marginTop: 14,
    minHeight: 38,
    paddingHorizontal: 14,
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
    paddingVertical: 8,
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
    marginTop: 14,
  },
  sessionArea: {
    paddingHorizontal: 16,
    marginTop: 28,
    alignItems: 'center',
  },
  menuPanel: {
    marginBottom: 12,
  },
  menuPanelCompact: {
    marginBottom: 0,
  },
  listRowTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 2,
    paddingVertical: 10,
    gap: 12,
  },
  listRowIconTile: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  listRowLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 46,
  },
  signOutButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
  },
  signOutText: {
    fontSize: 14,
    lineHeight: 18,
  },
});
