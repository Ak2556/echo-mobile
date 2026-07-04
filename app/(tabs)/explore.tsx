import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Brain, CaretRight, ChartLineUp, Cpu, PaintBrush, RocketLaunch } from 'phosphor-react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { SearchBar } from '../../components/social/SearchBar';
import { UserRow } from '../../components/social/UserRow';
import { FeedCard } from '../../components/social/FeedCard';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { useFeed } from '../../hooks/queries/useFeed';
import { buildSearchBuckets, deriveTopicFeed, groupDiscovery } from '../../lib/echoUX';
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 4 }}
              style={{ marginBottom: 20 }}
            >
              {topTopics.slice(0, 8).map(item => (
                <Pressable key={item.topic} onPress={() => setQuery(item.topic)}>
                  <View
                    style={{
                      paddingHorizontal: 15,
                      paddingVertical: 9,
                      borderRadius: 999,
                      backgroundColor: colors.surfaceHover,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>#{item.topic}</Text>
                    {item.count > 0 && (
                      <Text style={{ color: colors.accent, fontSize: 12, fontFamily: 'Inter_600SemiBold', fontVariant: ['tabular-nums'] }}>{item.count}</Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </ScrollView>

            {discovery.conversationStarters.length > 0 && (
              <>
                <SectionHeader colors={colors} label="Trending now" />
                <View style={{ paddingHorizontal: 12, marginBottom: 28, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {discovery.conversationStarters.slice(0, 6).map((item, idx) => {
                    const tileWidth = Math.floor((layout.wideContentWidth - 24 - 8) / 2);
                    const tall = idx % 3 === 0;
                    const mediaUri = item.mediaUris?.[0];
                    const tint = item.avatarColor || colors.accent;
                    return (
                      <Pressable key={item.id} onPress={() => router.push(`/thread/${item.id}`)}>
                      <View
                        style={{ width: tileWidth, height: tall ? 250 : 190, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface }}
                      >
                        {mediaUri ? (
                          <>
                            <ExpoImage source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                            <LinearGradient
                              colors={['transparent', 'rgba(0,0,0,0.72)']}
                              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 110 }}
                              pointerEvents="none"
                            />
                          </>
                        ) : (
                          <LinearGradient
                            colors={[`${tint}52`, `${tint}17`, 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0.8, y: 1 }}
                            style={StyleSheet.absoluteFill}
                            pointerEvents="none"
                          />
                        )}
                        <View style={{ flex: 1, justifyContent: mediaUri ? 'flex-end' : 'space-between', padding: 13 }}>
                          {!mediaUri && (
                            <Text style={[font.display, { color: colors.text, fontSize: 17, lineHeight: 22 }]} numberOfLines={tall ? 6 : 4}>
                              {item.editorialTitle || item.prompt}
                            </Text>
                          )}
                          <View>
                            {mediaUri && (
                              <Text style={[font.display, { color: '#fff', fontSize: 16, lineHeight: 21, marginBottom: 6 }]} numberOfLines={2}>
                                {item.editorialTitle || item.prompt}
                              </Text>
                            )}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: item.avatarColor || colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                                  {(item.displayName || item.username).charAt(0).toUpperCase()}
                                </Text>
                              </View>
                              <Text style={{ color: mediaUri ? 'rgba(255,255,255,0.85)' : colors.textMuted, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
                                {item.username}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                      </Pressable>
                    );
                  })}
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

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: headerHeight, zIndex: 10, overflow: 'hidden' }}>
        <BlurView intensity={50} tint={colors.isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: 0.72 }]} pointerEvents="none" />
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
