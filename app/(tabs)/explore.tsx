import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { BookOpen, Brain, Camera, CaretRight, ChartLineUp, Code, Cpu, GameController, MusicNote, PaintBrush, Play, RocketLaunch, Sparkle, UsersThree, VideoCamera } from 'phosphor-react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { SearchBar } from '../../src/features/feed/ui/SearchBar';
import { Avatar } from '../../components/ui/Avatar';
import { UserRow } from '../../src/features/feed/ui/UserRow';
import { FeedCard } from '../../src/features/feed/ui/FeedCard';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { EmptyState } from '../../components/common/EmptyState';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../src/shared/lib/theme';
import { useI18n } from '../../src/shared/lib/i18n';
import { useFeed } from '../../src/features/feed/api/useFeed';
import { buildSearchBuckets, deriveTopicFeed, groupDiscovery } from '../../lib/echoUX';
import { useRemoteSearch } from '../../hooks/queries/useSearch';
import { useSuggestedUsers } from '../../hooks/queries/useSuggestedUsers';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { track } from '../../src/shared/lib/analytics';
import { useResponsiveLayout } from '../../src/shared/lib/responsive';
import { MINI_APP_CATALOG } from '../../lib/miniAppCatalog';
import { MiniAppIcon } from '../../components/mini-apps/MiniAppIcon';

type SearchTab = 'all' | 'people' | 'echoes' | 'topics' | 'tools';


const CATEGORY_FALLBACKS = ['AI', 'Design', 'Productivity', 'Startups'];

/**
 * Icon and colour are chosen by what a topic IS. The previous code indexed a
 * four-entry table by list position, so the first topic always got the AI chip
 * and the second always got the design brush — which is why "Video" shipped
 * wearing a CPU icon and "Ai" a paintbrush.
 */
const TOPIC_VISUALS: { match: RegExp; color: string; Icon: React.ComponentType<any> }[] = [
  { match: /(^|\b)(ai|ml|llm|gpt|machine\s?learning|neural)/i, color: '#4E7A8B', Icon: Cpu },
  { match: /(video|film|movie|reel|clip|cinema)/i, color: '#C6533F', Icon: VideoCamera },
  { match: /(design|ux|ui|art|draw|illustrat)/i, color: '#C65F3F', Icon: PaintBrush },
  { match: /(code|coding|dev|program|software|engineer)/i, color: '#5E7A8B', Icon: Code },
  { match: /(music|song|audio|beat|sound)/i, color: '#8B5E7D', Icon: MusicNote },
  { match: /(photo|camera|picture|shot)/i, color: '#7D8B5E', Icon: Camera },
  { match: /(book|read|writ|story|poem)/i, color: '#8B7A4E', Icon: BookOpen },
  { match: /(game|gaming|play)/i, color: '#6E5E8B', Icon: GameController },
  { match: /(startup|founder|business|money|finance)/i, color: '#8B5E7D', Icon: RocketLaunch },
  { match: /(productiv|habit|focus|growth|goal)/i, color: '#7A8B4E', Icon: ChartLineUp },
];

const NEUTRAL_TOPIC_PALETTE = ['#4E7A8B', '#C65F3F', '#7A8B4E', '#8B5E7D', '#6E5E8B'];

function resolveTopicVisual(topic: string) {
  const hit = TOPIC_VISUALS.find(entry => entry.match.test(topic));
  if (hit) return { color: hit.color, Icon: hit.Icon };
  // Hash rather than index: an unrecognised topic keeps the same colour when
  // the feed reorders it, instead of changing hue on every refresh.
  let hash = 0;
  for (let i = 0; i < topic.length; i += 1) hash = (hash * 31 + topic.charCodeAt(i)) >>> 0;
  return { color: NEUTRAL_TOPIC_PALETTE[hash % NEUTRAL_TOPIC_PALETTE.length], Icon: Sparkle };
}

/** Hashtags arrive in whatever case the author typed, so "ai" rendered as "Ai". */
const TOPIC_INITIALISMS = new Set(['ai', 'ui', 'ux', 'ml', 'api', 'diy', 'ceo', 'nba', 'nfl', 'vr', 'ar']);
function formatTopicLabel(topic: string) {
  if (TOPIC_INITIALISMS.has(topic.toLowerCase())) return topic.toUpperCase();
  return topic.charAt(0).toUpperCase() + topic.slice(1);
}

const SEARCH_TABS: SearchTab[] = ['all', 'people', 'echoes', 'topics', 'tools'];

const HEADER_SEARCH_HEIGHT = 52;
const HEADER_TITLE_GAP = 12;
const HEADER_BOTTOM_PAD = 14;

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(typeof params.q === 'string' ? params.q : '');
  const [activeTab, setActiveTab] = useState<SearchTab>('all');
  const recentSearches = useAppStore(s => s.recentSearches);
  const setRecentSearches = useAppStore(s => s.setRecentSearches);
  const users = useAppStore(s => s.users);
  const interests = useAppStore(s => s.interests);
  const followingIds = useAppStore(s => s.followingIds);
  const { colors, radius, font } = useTheme();
  const { t } = useI18n();
  const layout = useResponsiveLayout();
  const { data: feed = [], refetch: refetchFeed, isRefetching: isRefetchingFeed } = useFeed();
  const remote = isSupabaseRemote();
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    if (typeof params.q === 'string' && params.q !== query) {
      setQuery(params.q);
      setActiveTab(params.q.startsWith('#') ? 'topics' : 'all');
    }
    
  }, [params.q, query]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(() => {
      const next = [q, ...recentSearches.filter(r => r !== q)].slice(0, 10);
      setRecentSearches(next);
      track('search_executed', { length: q.length, has_hashtag: q.startsWith('#') });
    }, 800);
    return () => clearTimeout(t);
  }, [query, recentSearches, setRecentSearches]);

  const { data: remoteResults } = useRemoteSearch(debouncedQuery);
  const isSearching = query.trim().length > 0;
  const normalizedQuery = query.trim().replace(/^#/, '').toLowerCase();
  const searchBuckets = useMemo(
    () => remote && remoteResults
      ? remoteResults
      : buildSearchBuckets(feed, users, query),
    [feed, query, users, remote, remoteResults],
  );
  const toolMatches = useMemo(() => {
    if (!normalizedQuery) return [];
    return MINI_APP_CATALOG.filter(app =>
      app.name.toLowerCase().includes(normalizedQuery) ||
      app.description.toLowerCase().includes(normalizedQuery) ||
      app.id.includes(normalizedQuery),
    ).slice(0, 8);
  }, [normalizedQuery]);
  const topics = useMemo(() => deriveTopicFeed(feed), [feed]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const discovery = useMemo(() => groupDiscovery(feed, interests, followingIds), [feed, followingIds, interests]);
  const { data: remoteSuggested } = useSuggestedUsers();
  const suggestedUsers = (remote ? (remoteSuggested ?? []) : users).slice(0, layout.isWide ? 6 : 4);
  const topTopics = topics.length > 0 ? topics : CATEGORY_FALLBACKS.map(label => ({ topic: label, count: 0 }));
  // Derived from the pieces the header actually contains rather than guessed.
  // The old constants (112, or 86 on desktop) were smaller than their own
  // content — ~130pt of title plus a 52pt search field inside a 112pt box with
  // overflow:'hidden' — so the search bar was clipped along its bottom edge on
  // every platform. onLayout then corrects the estimate, which matters when
  // Dynamic Type grows the title beyond its nominal line height.
  const headerTopPad = insets.top + (layout.isDesktop ? 14 : 10);
  const headerTitleLine = layout.isPhone ? 38 : 44;
  const estimatedHeaderHeight = headerTopPad + headerTitleLine + HEADER_TITLE_GAP + HEADER_SEARCH_HEIGHT + HEADER_BOTTOM_PAD;
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(0);
  const headerHeight = measuredHeaderHeight || estimatedHeaderHeight;
  // iPad is not `isDesktop` (that flag is web-only), so it was falling through
  // to the phone's 2-up grid and rendering ~660pt-wide tiles holding one glyph.
  const trendingColumns = layout.isDesktop ? 4 : layout.isWide ? 3 : 2;
  const tileGap = 10;
  const tileWidth = Math.floor((layout.wideContentWidth - layout.gutter * 2 - tileGap * (trendingColumns - 1)) / trendingColumns);
  const hasAnyResult = searchBuckets.userMatches.length > 0 ||
    searchBuckets.echoMatches.length > 0 ||
    searchBuckets.topicMatches.length > 0 ||
    toolMatches.length > 0;

  const { width: windowWidth } = useWindowDimensions();
  const gridGap = 6;
  const gridColumns = layout.isDesktop ? 4 : 2;
  const gridContainerWidth = layout.isWide ? layout.wideContentWidth - (layout.gutter * 2) : windowWidth - (layout.gutter * 2);
  const gridTileWidth = (gridContainerWidth - (gridGap * (gridColumns - 1))) / gridColumns;

  const masonryColumns = useMemo(() => {
    const cols: any[][] = Array.from({ length: gridColumns }, () => []);
    [...feed]
      .sort((a, b) => (b.likes + b.repostCount + b.commentCount) - (a.likes + a.repostCount + a.commentCount))
      .slice(0, 30)
      .forEach((item, index) => {
        cols[index % gridColumns].push(item);
      });
    return cols;
  }, [feed, gridColumns]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {isSearching ? (
        <SearchResults
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          colors={colors}
          radius={radius}
          font={font}
          layout={layout}
          headerHeight={headerHeight}
          query={query}
          hasAnyResult={hasAnyResult}
          userMatches={searchBuckets.userMatches}
          echoMatches={searchBuckets.echoMatches}
          topicMatches={searchBuckets.topicMatches}
          toolMatches={toolMatches}
          router={router}
          setQuery={setQuery}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: layout.bottomChromePadding }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetchingFeed}
              onRefresh={refetchFeed}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        >
          <View style={layout.wideContentStyle}>
            {recentSearches.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <SectionHeader label={t('explore.recent')} actionLabel={t('explore.clear')} onAction={() => setRecentSearches([])} />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: 8, paddingBottom: 2 }}
                >
                  {recentSearches.slice(0, 8).map(item => (
                    <PillButton key={item} label={item} onPress={() => setQuery(item)} />
                  ))}
                </ScrollView>
              </View>
            )}

            <SectionHeader label={t('explore.browseTopics')} />
            <View style={{ paddingHorizontal: layout.gutter, flexDirection: 'row', flexWrap: 'wrap', gap: tileGap, marginBottom: 18 }}>
              {topTopics.slice(0, 8).map(item => {
                const visual = resolveTopicVisual(item.topic);
                return (
                  <TopicTile
                    key={item.topic}
                    label={formatTopicLabel(item.topic)}
                    count={item.count}
                    color={visual.color}
                    width={tileWidth}
                    Icon={visual.Icon}
                    onPress={() => setQuery(item.topic)}
                  />
                );
              })}
            </View>

            {remote && (
              <View style={{ paddingHorizontal: layout.gutter, marginBottom: 30 }}>
                <ActionRow
                  icon={<Brain color={colors.accent} size={20} weight="regular" />}
                  title={t('explore.thinkingPartners')}
                  subtitle={t('explore.thinkingPartnersSub')}
                  onPress={() => router.push('/thinking-partners' as Href)}
                />
              </View>
            )}

            {suggestedUsers.length > 0 && (
              <>
                <SectionHeader label={t('explore.peopleToStart')} />
                <View style={{ paddingHorizontal: layout.gutter, marginBottom: 36 }}>
                  {suggestedUsers.map(user => (
                    <UserRow key={user.id} user={user} onPress={() => router.push(`/user/${user.id}`)} showFollowButton />
                  ))}
                </View>
              </>
            )}

            {feed.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <SectionHeader label="Explore Posts" />
                <View style={{ 
                  flexDirection: 'row', 
                  gap: gridGap, 
                  paddingHorizontal: layout.gutter, 
                  paddingBottom: 20 
                }}>
                  {masonryColumns.map((col, colIndex) => (
                    <View key={`col-${colIndex}`} style={{ flex: 1, gap: gridGap }}>
                      {col.map(item => (
                        <ExploreGridTile key={item.id} item={item} width={gridTileWidth} onPress={() => router.push(`/thread/${item.id}`)} />
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: headerHeight, zIndex: 10, overflow: 'hidden' }}>
        <GlassPanel borderRadius={0} style={StyleSheet.absoluteFill as any}>
          <View
            onLayout={event => {
              const next = Math.ceil(event.nativeEvent.layout.height);
              if (next > 0 && Math.abs(next - headerHeight) > 1) setMeasuredHeaderHeight(next);
            }}
            style={[layout.wideContentStyle, { paddingTop: headerTopPad, paddingHorizontal: layout.gutter, paddingBottom: HEADER_BOTTOM_PAD }]}
          >
            <Text style={[font.displayBlack, { color: colors.text, fontSize: layout.isPhone ? 34 : 40, lineHeight: headerTitleLine, letterSpacing: -0.5, marginBottom: HEADER_TITLE_GAP }]}>
              {t('nav.explore')}
            </Text>
            <SearchBar value={query} onChangeText={setQuery} placeholder={t('explore.searchPlaceholder')} />
          </View>
          {/* Was backgroundColor:'transparent' — an invisible divider, so the
              glass simply stopped dead against the page and read as a seam. */}
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
        </GlassPanel>
      </View>
    </View>
  );
}

function SearchResults({
  activeTab,
  setActiveTab,
  colors,
  radius,
  font,
  layout,
  headerHeight,
  query,
  hasAnyResult,
  userMatches,
  echoMatches,
  topicMatches,
  toolMatches,
  router,
  setQuery,
}: {
  activeTab: SearchTab;
  setActiveTab: (tab: SearchTab) => void;
  colors: any;
  radius: any;
  font: any;
  layout: ReturnType<typeof useResponsiveLayout>;
  headerHeight: number;
  query: string;
  hasAnyResult: boolean;
  userMatches: any[];
  echoMatches: any[];
  topicMatches: { topic: string; count: number }[];
  toolMatches: typeof MINI_APP_CATALOG;
  router: ReturnType<typeof useRouter>;
  setQuery: (value: string) => void;
}) {
  const { t } = useI18n();
  const tabCount: Record<SearchTab, number | undefined> = {
    all: undefined,
    people: userMatches.length,
    echoes: echoMatches.length,
    topics: topicMatches.length,
    tools: toolMatches.length,
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[layout.wideContentStyle, {
        paddingTop: headerHeight + 12,
        paddingHorizontal: layout.gutter,
        paddingBottom: layout.bottomChromePadding,
      }]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
        {SEARCH_TABS.map(tab => {
          const selected = activeTab === tab;
          return (
            <AnimatedPressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                minHeight: 36,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: selected ? colors.accent : colors.surface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: selected ? colors.accent : colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: selected ? '#fff' : colors.textSecondary, fontSize: 13, fontFamily: 'Inter_600SemiBold', textTransform: 'capitalize' }}>
                {(tab === 'all' ? t('notif.filterAll') : tab === 'people' ? t('explore.people') : tab === 'echoes' ? t('explore.echoes') : tab === 'topics' ? t('explore.topics') : t('explore.tools'))}{tabCount[tab] !== undefined ? ` ${tabCount[tab]}` : ''}
              </Text>
            </AnimatedPressable>
          );
        })}
      </ScrollView>

      {!hasAnyResult ? (
        <EmptyCopy
          title={t('explore.noMatches')}
          subtitle={t('explore.noMatchesSub', { query: query.trim() })}
        />
      ) : null}

      {(activeTab === 'all' || activeTab === 'people') && userMatches.length > 0 && (
        <ResultSection label={t('explore.people')}>
          {userMatches.slice(0, activeTab === 'all' ? 4 : 24).map(user => (
            <UserRow key={user.id} user={user} onPress={() => router.push(`/user/${user.id}`)} showFollowButton />
          ))}
        </ResultSection>
      )}

      {(activeTab === 'all' || activeTab === 'topics') && topicMatches.length > 0 && (
        <ResultSection label={t('explore.topics')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {topicMatches.slice(0, activeTab === 'all' ? 8 : 24).map(item => (
              <AnimatedPressable
                key={item.topic}
                onPress={() => setQuery(item.topic)}
                style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
              >
                <Text style={[font.bodyBold, { color: colors.text, fontSize: 13 }]}>#{item.topic}</Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 11, marginTop: 2 }]}>
                  {item.count} Echo{item.count === 1 ? '' : 'es'}
                </Text>
              </AnimatedPressable>
            ))}
          </View>
        </ResultSection>
      )}

      {(activeTab === 'all' || activeTab === 'tools') && toolMatches.length > 0 && (
        <ResultSection label={t('explore.tools')}>
          <View style={{ gap: 10 }}>
            {toolMatches.map(tool => (
              <ActionRow
                key={tool.id}
                icon={<MiniAppIcon id={tool.id} color={tool.color} size={34} />}
                title={tool.name}
                subtitle={tool.description}
                onPress={() => router.push(tool.route)}
              />
            ))}
          </View>
        </ResultSection>
      )}

      {(activeTab === 'all' || activeTab === 'echoes') && echoMatches.length > 0 && (
        <ResultSection label={activeTab === 'echoes' ? t('explore.echoes') : t('explore.bestMatches')}>
          {echoMatches.slice(0, activeTab === 'all' ? 8 : 24).map((item, index) => (
            <FeedCard key={item.id} item={item} index={index} onPress={() => router.push(`/thread/${item.id}`)} />
          ))}
        </ResultSection>
      )}

      {activeTab !== 'all' && tabCount[activeTab] === 0 ? (
        <EmptyCopy title={t('explore.noFound')} subtitle={t('explore.broaden')} />
      ) : null}
    </ScrollView>
  );
}

function TopicTile({
  label,
  count,
  color,
  width,
  Icon,
  onPress,
}: {
  label: string;
  count: number;
  color: string;
  width: number;
  Icon: React.ComponentType<any>;
  onPress: () => void;
}) {
  const { colors, font } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ width }}>
      {/* A background and a border: the tile used to be a tint fading to
          transparent, which on a black ground gave it no bottom edge at all —
          it dissolved into the page instead of reading as a card. */}
      <View style={{
        minHeight: 104,
        borderRadius: 20,
        padding: 14,
        overflow: 'hidden',
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        justifyContent: 'space-between',
      }}>
        <LinearGradient
          colors={[`${color}2E`, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill as any}
          pointerEvents="none"
        />
        <View style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${color}26`,
        }}>
          <Icon color={color} size={19} weight="bold" />
        </View>
        <View style={{ marginTop: 14 }}>
          <Text style={[font.display, { color: colors.text, fontSize: 16 }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 3 }]}>
            {count > 0 ? `${count} Echo${count === 1 ? '' : 'es'}` : 'Start exploring'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}


function SectionHeader({ label, actionLabel, onAction }: { label: string; actionLabel?: string; onAction?: () => void }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
      <Text style={[font.bodySemibold, { color: colors.textMuted, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', flex: 1 }]}>
        {label}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[font.bodySemibold, { color: colors.accent, fontSize: 12 }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ResultSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <SectionHeader label={label} />
      {children}
    </View>
  );
}

function ActionRow({ icon, title, subtitle, onPress }: { icon: React.ReactNode; title: string; subtitle: string; onPress: () => void }) {
  const { colors, font } = useTheme();
  return (
    <AnimatedPressable onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <View style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.accent}18` }}>
          {icon}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]} numberOfLines={1}>{title}</Text>
          <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]} numberOfLines={1}>{subtitle}</Text>
        </View>
        <CaretRight color={colors.textMuted} size={15} />
      </View>
    </AnimatedPressable>
  );
}

function PillButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, font } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.surfaceHover, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
    >
      <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 12 }]} numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/**
 * A video in the explore grid — a still tile, not a player.
 *
 * The grid used to mount a real VideoPreview per tile. Because none of them
 * passed echoId, every one decided it was the active video, so opening Explore
 * started every visible video at once and their audio played over each other.
 *
 * Nothing here can play: no player is mounted at all, which is a stronger
 * guarantee than a paused one and costs no video decoders — Android has a small
 * fixed number of those, and a grid can exhaust them. Tapping the tile opens
 * the echo, which is where playback belongs.
 *
 * Echo does not store a poster frame for uploaded video, so this is a styled
 * placeholder rather than a still from the video itself. Real thumbnails need
 * generating at upload time.
 */
function ExploreVideoTile({ item, width, height, colors }: { item: any; width: number; height: number; colors: any }) {
  const tint = item.avatarColor || colors.accent;
  return (
    <View
      style={{ width, height, backgroundColor: colors.surface }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Video by ${item.username}. Open to play.`}
    >
      <LinearGradient
        colors={[`${tint}55`, `${tint}18`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill as any}
        pointerEvents="none"
      />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.45)',
          }}
        >
          <Play size={20} color="#fff" weight="fill" />
        </View>
      </View>
    </View>
  );
}

function ExploreGridTile({ item, width, onPress }: { item: any; width: number; onPress: () => void }) {
  const { colors, font, radius } = useTheme();
  
  const isVideo = item.postType === 'video' && !!item.videoUri;
  const isPhoto = !!item.mediaUris?.[0];
  const hasMedia = isVideo || isPhoto;
  
  const mediaUri = item.mediaUris?.[0];
  const tint = item.avatarColor || colors.accent;
  
  
  // One tile shape for every card. Height used to come from
  // `item.id.length % 2`, so whether a tile was tall depended on the parity
  // of a UUID's length — visually random, and it left the masonry columns
  // ragged because the round-robin fill assumes equal heights. A single 4:5
  // ratio makes the columns line up and the page read as a grid.
  const isTall = false;
  const height = width * 1.25;

  return (
    <AnimatedPressable onPress={onPress} style={{ width, height, marginBottom: 20 }}>
      <View style={{ width, height, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' }}>
        {hasMedia ? (
          <>
            {isVideo ? (
              <ExploreVideoTile item={item} width={width} height={height} colors={colors} />
            ) : (
              <ExpoImage source={{ uri: mediaUri }} style={{ width, height }} contentFit="cover" cachePolicy="memory-disk" />
            )}
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.5 }} pointerEvents="none" />
          </>
        ) : (
          <>
            <LinearGradient colors={[`${tint}50`, `${tint}14`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill as any} pointerEvents="none" />
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 }}>
              <Text style={[font.display, { color: colors.text, fontSize: 14, lineHeight: 19, textAlign: 'center', marginBottom: 4 }]} numberOfLines={isTall ? 3 : 2}>
                {item.editorialTitle || item.prompt}
              </Text>
              {!!item.response && (
                <Text style={[font.body, { color: colors.textSecondary, fontSize: 11, lineHeight: 16, textAlign: 'center' }]} numberOfLines={isTall ? 3 : 2}>
                  {item.response}
                </Text>
              )}
            </View>
          </>
        )}

        <View style={{ position: 'absolute', bottom: 8, left: 8, right: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Avatar name={item.username} url={item.avatarUrl} color={item.avatarColor} size={18} />
            <Text style={[font.bodySemibold, { color: hasMedia ? '#fff' : colors.text, fontSize: 11 }]} numberOfLines={1}>
              {item.username}
            </Text>
          </View>
          <Text style={[font.bodyBold, { color: mediaUri ? 'rgba(255,255,255,0.85)' : colors.textMuted, fontSize: 11 }]}>
            {item.likes}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function EmptyCopy({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors } = useTheme();
  return (
    <EmptyState
      icon={<UsersThree color={colors.accent} size={30} weight="bold" />}
      title={title}
      subtitle={subtitle}
    />
  );
}
