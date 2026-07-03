import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Brain, CaretRight, ChartLineUp, Cpu, PaintBrush, RocketLaunch } from 'phosphor-react-native';
import { SearchBar } from '../../components/social/SearchBar';
import { UserRow } from '../../components/social/UserRow';
import { FeedCard } from '../../components/social/FeedCard';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { useFeed } from '../../hooks/queries/useFeed';
import { buildSearchBuckets, deriveTopicFeed, groupDiscovery, inferTopics } from '../../lib/echoUX';
import { useRemoteSearch } from '../../hooks/queries/useSearch';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { track } from '../../lib/analytics';
import { useResponsiveLayout } from '../../lib/responsive';

const CATEGORY_FALLBACKS = [
  { label: 'AI', color: '#3B82F6', Icon: Cpu },
  { label: 'Design', color: '#F97316', Icon: PaintBrush },
  { label: 'Productivity', color: '#10B981', Icon: ChartLineUp },
  { label: 'Startups', color: '#8B5CF6', Icon: RocketLaunch },
];

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(typeof params.q === 'string' ? params.q : '');
  const [activeTab, setActiveTab] = useState<'all' | 'people' | 'echoes' | 'topics' | 'mini-apps'>('all');
  const recentSearches = useAppStore(s => s.recentSearches);
  const setRecentSearches = useAppStore(s => s.setRecentSearches);

  useEffect(() => {
    if (typeof params.q === 'string' && params.q !== query) {
      setQuery(params.q);
      setActiveTab(params.q.startsWith('#') ? 'topics' : 'all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(() => {
      const next = [q, ...recentSearches.filter(r => r !== q)].slice(0, 10);
      setRecentSearches(next);
      track('search_executed', { length: q.length, has_hashtag: q.startsWith('#') });
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  const users = useAppStore(s => s.users);
  const interests = useAppStore(s => s.interests);
  const followingIds = useAppStore(s => s.followingIds);
  const { colors, radius, font } = useTheme();
  const layout = useResponsiveLayout();
  const { data: feed = [] } = useFeed();
  const remote = isSupabaseRemote();

  const [debouncedQuery, setDebouncedQuery] = React.useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: remoteResults } = useRemoteSearch(debouncedQuery);

  const isSearching = query.trim().length > 0;
  const searchBuckets = useMemo(
    () => remote && remoteResults
      ? remoteResults
      : buildSearchBuckets(feed, users, query),
    [feed, query, users, remote, remoteResults],
  );
  const topics = useMemo(() => deriveTopicFeed(feed), [feed]);
  const discovery = useMemo(() => groupDiscovery(feed, interests, followingIds), [feed, followingIds, interests]);
  const suggestedUsers = users.slice(0, 4);
  const topTopics = topics.length > 0 ? topics : CATEGORY_FALLBACKS.map(item => ({ topic: item.label, count: 0 }));

  const headerHeight = insets.top + (layout.isDesktop ? 78 : 106);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>

      {isSearching ? (
        <View style={{ flex: 1, paddingTop: headerHeight }}>
          <View style={[layout.wideContentStyle, { flexDirection: 'row', paddingHorizontal: 16, marginTop: 8, marginBottom: 12, gap: 8 }]}>
            {(['all', 'people', 'echoes', 'topics'] as const).map(tab => {
              const selected = activeTab === tab;
              return (
                <AnimatedPressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 99,
                    backgroundColor: selected ? colors.accent : colors.surface,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: selected ? colors.accent : colors.glassBorder,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', textTransform: 'capitalize', color: selected ? '#fff' : colors.textSecondary }}>{tab}</Text>
                </AnimatedPressable>
              );
            })}
          </View>

          {(activeTab === 'all' || activeTab === 'people') && (
            <FlashList
              data={searchBuckets.userMatches}
              renderItem={({ item }) => (
                <View style={layout.contentStyle}>
                  <UserRow user={item} onPress={() => router.push(`/user/${item.id}`)} showFollowButton />
                </View>
              )}
              keyExtractor={item => `user-${item.id}`}
              ListHeaderComponent={activeTab === 'all' ? (
                <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>People</Text>
                </View>
              ) : null}
              ListEmptyComponent={activeTab === 'people' ? <EmptyCopy colors={colors} title="No people found" subtitle="Try a broader username, name, or topic." /> : null}
            />
          )}

          {(activeTab === 'all' || activeTab === 'topics') && searchBuckets.topicMatches.length > 0 && (
            <View style={[layout.wideContentStyle, { paddingHorizontal: 16, marginBottom: 12 }]}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 10 }}>Topics</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {searchBuckets.topicMatches.map(item => (
                  <AnimatedPressable
                    key={item.topic}
                    onPress={() => setQuery(item.topic)}
                    style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>#{item.topic}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{item.count} related Echoes</Text>
                  </AnimatedPressable>
                ))}
              </View>
            </View>
          )}

          {(activeTab === 'all' || activeTab === 'echoes') && (
            <FlashList
              data={activeTab === 'echoes' ? searchBuckets.echoMatches : searchBuckets.echoMatches.slice(0, 12)}
              renderItem={({ item, index }) => (
                <View style={layout.contentStyle}>
                  <FeedCard item={item} index={index} onPress={() => router.push(`/thread/${item.id}`)} />
                </View>
              )}
              keyExtractor={item => `echo-${item.id}`}
              ListHeaderComponent={(
                <View style={{ paddingHorizontal: 16, paddingTop: activeTab === 'echoes' ? 0 : 4, marginBottom: 12 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>
                    {activeTab === 'echoes' ? 'Echoes' : 'Best matches'}
                  </Text>
                </View>
              )}
              ListEmptyComponent={activeTab === 'echoes' ? <EmptyCopy colors={colors} title="No Echoes found" subtitle="Try a topic, prompt phrase, or creator name." /> : null}
              contentContainerStyle={{ paddingBottom: 120 }}
            />
          )}
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: layout.bottomChromePadding }}>
          <View style={layout.wideContentStyle}>
            <SectionHeader colors={colors} label="Trending topics" />
            <View style={{ paddingHorizontal: 16, marginBottom: 36 }}>
              {topTopics.slice(0, 5).map((item, index, arr) => (
                <AnimatedPressable
                  key={item.topic}
                  onPress={() => setQuery(item.topic)}
                  style={{
                    paddingVertical: 13,
                    borderBottomWidth: index < arr.length - 1 ? StyleSheet.hairlineWidth : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 14 }}>
                    <Text style={{ color: colors.accent, fontSize: 13, fontFamily: 'Inter_600SemiBold', fontVariant: ['tabular-nums'], width: 22 }}>
                      {String(index + 1).padStart(2, '0')}
                    </Text>
                    <Text style={{ color: colors.text, fontSize: 16, fontFamily: 'Inter_600SemiBold', flex: 1 }} numberOfLines={1}>
                      #{item.topic}
                    </Text>
                    {item.count > 0 && (
                      <Text style={{ color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                        {item.count} {item.count === 1 ? 'echo' : 'echoes'}
                      </Text>
                    )}
                  </View>
                </AnimatedPressable>
              ))}
            </View>

            {discovery.conversationStarters.length > 0 && (
              <>
                <SectionHeader colors={colors} label="Worth opening" />
                <View style={{ paddingHorizontal: 16, marginBottom: 36 }}>
                  {discovery.conversationStarters.slice(0, 4).map((item, idx, arr) => (
                    <AnimatedPressable
                      key={item.id}
                      onPress={() => router.push(`/thread/${item.id}`)}
                      style={{
                        paddingVertical: 18,
                        borderBottomWidth: idx < arr.length - 1 ? StyleSheet.hairlineWidth : 0,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <Text style={[font.display, { color: colors.text, fontSize: 18, lineHeight: 24 }]} numberOfLines={2}>
                        {item.editorialTitle || item.prompt}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6 }} numberOfLines={1}>
                        {item.authorNote || item.response || inferTopics(item).map(t => `#${t}`).join(' ')}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>
              </>
            )}

            {remote && (
              <View style={{ paddingHorizontal: 16, marginBottom: 36 }}>
                <AnimatedPressable
                  onPress={() => router.push('/thinking-partners')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}>
                    <Brain color={colors.accent} size={20} weight="regular" />
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15, fontFamily: 'Inter_600SemiBold', flex: 1 }}>
                      Thinking partners
                    </Text>
                    <CaretRight color={colors.textMuted} size={15} />
                  </View>
                </AnimatedPressable>
              </View>
            )}

            {suggestedUsers.length > 0 && (
              <>
                <SectionHeader colors={colors} label="People to start with" />
                <View style={{ paddingHorizontal: 16, marginBottom: 36 }}>
                  {suggestedUsers.map(user => (
                    <UserRow key={user.id} user={user} onPress={() => router.push(`/user/${user.id}`)} showFollowButton />
                  ))}
                </View>
              </>
            )}
          </View>
        </ScrollView>
      )}

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: headerHeight, zIndex: 10, backgroundColor: colors.bg }}>
        <View style={[layout.wideContentStyle, { paddingTop: insets.top + (layout.isDesktop ? 16 : 8), paddingHorizontal: layout.gutter, paddingBottom: 8 }]}>
          {!layout.isDesktop && (
            <Text style={{ color: colors.text, fontSize: 26, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.5, marginBottom: 10 }}>
              Explore
            </Text>
          )}
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search people, Echoes, and topics" />
        </View>
        {!isSearching && recentSearches.length > 0 && (
          <View style={[layout.wideContentStyle, { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: layout.gutter, paddingBottom: 8 }]}>
            {recentSearches.slice(0, 5).map(r => (
              <AnimatedPressable
                key={r}
                onPress={() => setQuery(r)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{r}</Text>
              </AnimatedPressable>
            ))}
          </View>
        )}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      </View>
    </View>
  );
}

function SectionHeader({ colors, label }: { colors: any; icon?: React.ReactNode; label: string }) {
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 20, marginBottom: 14 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
    </View>
  );
}

function EmptyCopy({ colors, title, subtitle }: { colors: any; title: string; subtitle: string }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 }}>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{title}</Text>
      <Text style={{ color: colors.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>{subtitle}</Text>
    </View>
  );
}
