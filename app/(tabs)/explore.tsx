import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Brain, CaretRight, ChartLineUp, Cpu, Hash, PaintBrush, RocketLaunch, UsersThree } from 'phosphor-react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { SearchBar } from '../../src/features/feed/ui/SearchBar';
import { Avatar } from '../../components/ui/Avatar';
import { UserRow } from '../../src/features/feed/ui/UserRow';
import { FeedCard } from '../../src/features/feed/ui/FeedCard';
import { VideoPreview } from '../../src/features/feed/ui/VideoPreview';
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


const CATEGORY_FALLBACKS = [
  { label: 'AI', color: '#4E7A8B', Icon: Cpu },
  { label: 'Design', color: '#C65F3F', Icon: PaintBrush },
  { label: 'Productivity', color: '#7A8B4E', Icon: ChartLineUp },
  { label: 'Startups', color: '#8B5E7D', Icon: RocketLaunch },
];

const SEARCH_TABS: SearchTab[] = ['all', 'people', 'echoes', 'topics', 'tools'];

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
  const topTopics = topics.length > 0 ? topics : CATEGORY_FALLBACKS.map(item => ({ topic: item.label, count: 0 }));
  const headerHeight = insets.top + (layout.isDesktop ? 86 : 112);
  const trendingColumns = layout.isDesktop ? 3 : 2;
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
              {topTopics.slice(0, 8).map((item, index) => {
                const fallback = CATEGORY_FALLBACKS[index % CATEGORY_FALLBACKS.length];
                return (
                  <TopicTile
                    key={item.topic}
                    label={item.topic}
                    count={item.count}
                    color={fallback.color}
                    width={tileWidth}
                    Icon={fallback.Icon}
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
        <BlurView intensity={58} tint={colors.isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: 0.78 }]} pointerEvents="none" />
        <View style={[layout.wideContentStyle, { paddingTop: insets.top + (layout.isDesktop ? 14 : 8), paddingHorizontal: layout.gutter, paddingBottom: 10 }]}>
          <Text style={[font.displayBlack, { color: colors.text, fontSize: layout.isPhone ? 34 : 40, lineHeight: layout.isPhone ? 38 : 44, letterSpacing: -0.5, marginBottom: 16 }]}>
            {t('nav.explore')}
          </Text>
          <SearchBar value={query} onChangeText={setQuery} placeholder={t('explore.searchPlaceholder')} />
        </View>
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'transparent' }} />
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
      <View style={{ minHeight: 96, borderRadius: 20, padding: 14, overflow: 'hidden' }}>
        <LinearGradient
          colors={[`${color}22`, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Icon color={color} size={20} weight="bold" />
        </View>
        <Text style={[font.display, { color: colors.text, fontSize: 16 }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 4 }]}>
          {count > 0 ? `${count} Echo${count === 1 ? '' : 'es'}` : 'Start exploring'}
        </Text>
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

function ExploreGridTile({ item, width, onPress }: { item: any; width: number; onPress: () => void }) {
  const { colors, font, radius } = useTheme();
  
  const isVideo = item.postType === 'video' && !!item.videoUri;
  const isPhoto = !!item.mediaUris?.[0];
  const hasMedia = isVideo || isPhoto;
  
  const mediaUri = item.mediaUris?.[0];
  const tint = item.avatarColor || colors.accent;
  
  
  const isTall = item.id.length % 2 === 0;
  const height = hasMedia ? (isTall ? width * 1.5 : width * 1.2) : (isTall ? width * 1.25 : width);

  return (
    <AnimatedPressable onPress={onPress} style={{ width, height, marginBottom: 20 }}>
      <View style={{ width, height, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' }}>
        {hasMedia ? (
          <>
            {isVideo ? (
              <VideoPreview uri={item.videoUri} height={height} borderRadius={0} />
            ) : (
              <ExpoImage source={{ uri: mediaUri }} style={{ width, height }} contentFit="cover" cachePolicy="memory-disk" />
            )}
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.5 }} pointerEvents="none" />
          </>
        ) : (
          <>
            <LinearGradient colors={[`${tint}50`, `${tint}14`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
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
