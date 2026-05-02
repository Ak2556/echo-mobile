import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Dimensions, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { Compass, Hash, MagnifyingGlass, Sparkle, TrendUp, UserCirclePlus } from 'phosphor-react-native';
import { SearchBar } from '../../components/social/SearchBar';
import { UserRow } from '../../components/social/UserRow';
import { FeedCard } from '../../components/social/FeedCard';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { useFeed } from '../../hooks/queries/useFeed';
import { buildSearchBuckets, deriveTopicFeed, groupDiscovery, inferTopics } from '../../lib/echoUX';

const { width: SW } = Dimensions.get('window');
const CARD_WIDTH = (SW - 48) / 2;

const CATEGORY_FALLBACKS = [
  { label: 'AI', color: '#3B82F6', icon: '✦' },
  { label: 'Design', color: '#F97316', icon: '◌' },
  { label: 'Productivity', color: '#10B981', icon: '↗' },
  { label: 'Startups', color: '#8B5CF6', icon: '◎' },
];

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'people' | 'echoes' | 'topics'>('all');
  const users = useAppStore(s => s.users);
  const interests = useAppStore(s => s.interests);
  const followingIds = useAppStore(s => s.followingIds);
  const { colors, radius } = useTheme();
  const { data: feed = [] } = useFeed();

  const isSearching = query.trim().length > 0;
  const searchBuckets = useMemo(() => buildSearchBuckets(feed, users, query), [feed, query, users]);
  const topics = useMemo(() => deriveTopicFeed(feed), [feed]);
  const discovery = useMemo(() => groupDiscovery(feed, interests, followingIds), [feed, followingIds, interests]);
  const suggestedUsers = users.slice(0, 4);
  const topTopics = topics.length > 0 ? topics : CATEGORY_FALLBACKS.map(item => ({ topic: item.label, count: 0 }));

  const headerHeight = insets.top + 68;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={colors.ambientGradient} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 0.55 }} style={StyleSheet.absoluteFill} pointerEvents="none" />

      {isSearching ? (
        <View style={{ flex: 1, paddingTop: headerHeight }}>
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginTop: 8, marginBottom: 12, gap: 8 }}>
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
              renderItem={({ item }) => <UserRow user={item} onPress={() => router.push(`/user/${item.id}`)} showFollowButton />}
              keyExtractor={item => `user-${item.id}`}
              ListHeaderComponent={activeTab === 'all' ? (
                <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>People</Text>
                </View>
              ) : null}
              ListEmptyComponent={activeTab === 'people' ? <EmptyCopy colors={colors} title="No people found" subtitle="Try a broader username, name, or topic." /> : null}
            />
          )}

          {(activeTab === 'all' || activeTab === 'topics') && searchBuckets.topicMatches.length > 0 && (
            <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Topics</Text>
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
              renderItem={({ item, index }) => <FeedCard item={item} index={index} onPress={() => router.push(`/thread/${item.id}`)} />}
              keyExtractor={item => `echo-${item.id}`}
              ListHeaderComponent={(
                <View style={{ paddingHorizontal: 16, paddingTop: activeTab === 'echoes' ? 0 : 4, marginBottom: 12 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 110 }}>
          <SectionHeader colors={colors} icon={<Sparkle color={colors.accent} size={16} />} label="Search with a path" />
          <View style={{ paddingHorizontal: 16, marginBottom: 24, gap: 12 }}>
            <ReasonCard
              colors={colors}
              radius={radius}
              title="Find people worth following"
              body="Search by topic, not just name. Try AI, design systems, prompts, or productivity."
              icon={<UserCirclePlus color={colors.accent} size={20} />}
            />
            <ReasonCard
              colors={colors}
              radius={radius}
              title="Look for conversation starters"
              body="Use prompt language to find Echoes that are worth replying to or remixing."
              icon={<Compass color={colors.accent} size={20} />}
            />
          </View>

          <SectionHeader colors={colors} icon={<Hash color={colors.accent} size={16} />} label="Topics gaining momentum" />
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {topTopics.slice(0, 6).map((item, index) => {
                const fallback = CATEGORY_FALLBACKS[index % CATEGORY_FALLBACKS.length];
                return (
                  <AnimatedPressable
                    key={item.topic}
                    onPress={() => setQuery(item.topic)}
                    style={{ width: CARD_WIDTH, padding: 14, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <Text style={{ color: fallback.color, fontSize: 22, marginBottom: 10 }}>{fallback.icon}</Text>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>#{item.topic}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>{item.count > 0 ? `${item.count} active Echoes` : 'Tap to explore'}</Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>

          <SectionHeader colors={colors} icon={<TrendUp color={colors.danger} size={16} />} label="Worth opening next" />
          <View style={{ paddingHorizontal: 16, marginBottom: 24, gap: 10 }}>
            {discovery.conversationStarters.slice(0, 4).map(item => (
              <AnimatedPressable
                key={item.id}
                onPress={() => router.push(`/thread/${item.id}`)}
                style={{ padding: 14, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>{item.editorialTitle || item.prompt}</Text>
                <Text style={{ color: colors.textSecondary, marginTop: 6, lineHeight: 20 }} numberOfLines={2}>
                  {item.authorNote || item.response || `Topics: ${inferTopics(item).join(', ')}`}
                </Text>
                <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: 12 }}>Open because it already has discussion energy.</Text>
              </AnimatedPressable>
            ))}
          </View>

          <SectionHeader colors={colors} icon={<MagnifyingGlass color={colors.accent} size={16} />} label="People to start with" />
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            {suggestedUsers.map(user => (
              <UserRow key={user.id} user={user} onPress={() => router.push(`/user/${user.id}`)} showFollowButton />
            ))}
          </View>
        </ScrollView>
      )}

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: headerHeight, zIndex: 10, backgroundColor: colors.bg }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 14, paddingBottom: 8 }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search people, Echoes, prompts, and topics..." />
        </View>
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      </View>
    </View>
  );
}

function SectionHeader({ colors, icon, label }: { colors: any; icon: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 12, marginBottom: 12, gap: 8 }}>
      {icon}
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text>
    </View>
  );
}

function ReasonCard({ colors, radius, title, body, icon }: { colors: any; radius: any; title: string; body: string; icon: React.ReactNode }) {
  return (
    <View style={{ padding: 14, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHover }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{title}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 4 }}>{body}</Text>
      </View>
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
