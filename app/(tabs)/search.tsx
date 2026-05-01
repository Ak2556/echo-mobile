import React, { useState } from 'react';
import { View, Text, ScrollView, Dimensions, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { TrendUp, Hash } from 'phosphor-react-native';
import { SearchBar } from '../../components/social/SearchBar';
import { UserRow } from '../../components/social/UserRow';
import { FeedCard } from '../../components/social/FeedCard';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { useFeed } from '../../hooks/queries/useFeed';

const { width: SW } = Dimensions.get('window');

const TRENDING_TAGS = ['#AI', '#ReactNative', '#MachineLearning', '#WebDev', '#Design', '#Python', '#Crypto', '#DevOps'];

const CATEGORIES = [
  { label: 'Technology', color: '#3B82F6', icon: '\u{1F4BB}' },
  { label: 'Science',    color: '#10B981', icon: '\u{1F52C}' },
  { label: 'Design',     color: '#F59E0B', icon: '\u{1F3A8}' },
  { label: 'Business',   color: '#8B5CF6', icon: '\u{1F4CA}' },
  { label: 'Health',     color: '#EF4444', icon: '\u{1F3E5}' },
  { label: 'Education',  color: '#06B6D4', icon: '\u{1F4DA}' },
];

const CARD_WIDTH = (SW - 48) / 2;

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'top' | 'users' | 'tags'>('top');
  const { searchUsers } = useAppStore();
  const { colors, radius, reduceAnimations } = useTheme();
  const { data: feed } = useFeed();

  const isSearching = query.trim().length > 0;
  const matchedUsers = isSearching ? searchUsers(query) : [];
  const matchedEchoes = isSearching
    ? (feed || []).filter(item => {
        const q = query.toLowerCase();
        return (
          item.prompt.toLowerCase().includes(q) ||
          item.response.toLowerCase().includes(q) ||
          item.username.toLowerCase().includes(q) ||
          item.hashtags?.some(h => h.toLowerCase().includes(q))
        );
      })
    : [];

  const trendingEchoes = (feed || [])
    .sort((a, b) => (b.likes + b.repostCount + b.commentCount) - (a.likes + a.repostCount + a.commentCount))
    .slice(0, 5);

  const useBlur = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';

  // Header: title row + search bar
  const HEADER_CONTENT_HEIGHT = 110;
  const headerHeight = insets.top + HEADER_CONTENT_HEIGHT;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Ambient gradient */}
      <LinearGradient
        colors={colors.ambientGradient}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 0.55 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Content */}
      {isSearching ? (
        <Animated.View entering={FadeIn.duration(80)} style={{ flex: 1, paddingTop: headerHeight }}>
          {/* Search tabs */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12, gap: 8, marginTop: 8 }}>
            {(['top', 'users', 'tags'] as const).map(tab => (
              <AnimatedPressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 99,
                  backgroundColor: activeTab === tab ? colors.accent : colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: activeTab === tab ? 'transparent' : colors.glassBorder,
                }}
                scaleValue={0.93}
                haptic="light"
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    textTransform: 'capitalize',
                    color: activeTab === tab ? '#fff' : colors.textSecondary,
                  }}
                >
                  {tab}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          {activeTab === 'users' ? (
            <FlashList
              data={matchedUsers}
              renderItem={({ item }) => (
                <UserRow user={item} onPress={() => router.push(`/user/${item.id}`)} />
              )}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 110 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 80 }}>
                  <Text style={{ color: colors.textMuted }}>No users found</Text>
                </View>
              }
            />
          ) : (
            <FlashList
              data={matchedEchoes}
              renderItem={({ item, index }) => (
                <FeedCard item={item} index={index} onPress={() => router.push(`/thread/${item.id}`)} />
              )}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 110 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 80 }}>
                  <Text style={{ color: colors.textMuted }}>No echoes found</Text>
                </View>
              }
            />
          )}
        </Animated.View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 110 }}
        >
          {/* Category Grid */}
          <Animated.View
            entering={FadeInDown.delay(100).springify()}
            style={{ paddingHorizontal: 16, marginBottom: 24, marginTop: 12 }}
          >
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 12,
              }}
            >
              Categories
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              {CATEGORIES.map(cat => (
                <AnimatedPressable
                  key={cat.label}
                  onPress={() => setQuery(cat.label)}
                  style={{
                    width: CARD_WIDTH,
                    height: 80,
                    borderRadius: radius.card,
                    overflow: 'hidden',
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: cat.color + '44',
                  }}
                  scaleValue={0.94}
                  haptic="light"
                >
                  <LinearGradient
                    colors={[cat.color + 'CC', cat.color + '44']}
                    style={{ flex: 1, padding: 12, justifyContent: 'space-between' }}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Text style={{ fontSize: 26 }}>{cat.icon}</Text>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>
                      {cat.label}
                    </Text>
                  </LinearGradient>
                </AnimatedPressable>
              ))}
            </View>
          </Animated.View>

          {/* Trending Tags */}
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            style={{ paddingHorizontal: 16, marginBottom: 24 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Hash color={colors.accent} size={16} />
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 11,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginLeft: 6,
                }}
              >
                Trending Tags
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TRENDING_TAGS.map(tag => (
                <AnimatedPressable
                  key={tag}
                  onPress={() => setQuery(tag.slice(1))}
                  style={{
                    borderRadius: 99,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.glassBorder,
                    flexDirection: 'row',
                    backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  }}
                  scaleValue={0.93}
                  haptic="light"
                >
                  <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 14 }}>#</Text>
                  <Text style={{ color: colors.text, fontWeight: '500', fontSize: 14 }}>
                    {tag.slice(1)}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>
          </Animated.View>

          {/* Trending Echoes */}
          <Animated.View entering={FadeInDown.delay(300).springify()} style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 }}>
              <TrendUp color={colors.danger} size={16} />
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 11,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginLeft: 6,
                }}
              >
                Trending Echoes
              </Text>
            </View>
            {trendingEchoes.map((item, index) => (
              <AnimatedPressable
                key={item.id}
                onPress={() => router.push(`/thread/${item.id}`)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.glassBorder,
                }}
                scaleValue={0.98}
                haptic="light"
              >
                <Text
                  style={{
                    color: colors.textMuted,
                    fontWeight: '700',
                    fontSize: 18,
                    width: 32,
                  }}
                >
                  {index + 1}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '500', fontSize: 14 }} numberOfLines={1}>
                    {item.prompt}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {item.username} · {item.likes} likes
                  </Text>
                </View>
              </AnimatedPressable>
            ))}
          </Animated.View>

          {/* Suggested Users */}
          <Animated.View
            entering={FadeInDown.delay(400).springify()}
            style={{ paddingHorizontal: 16, marginBottom: 32 }}
          >
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 12,
              }}
            >
              Suggested for You
            </Text>
            {useAppStore.getState().users.slice(0, 4).map(user => (
              <UserRow
                key={user.id}
                user={user}
                onPress={() => router.push(`/user/${user.id}`)}
                showFollowButton
              />
            ))}
          </Animated.View>
        </ScrollView>
      )}

      {/* Glass header — fixed at top */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: headerHeight,
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        {useBlur && (
          <BlurView
            intensity={70}
            tint={tint}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.bg, opacity: useBlur ? 0.28 : 0.97 },
          ]}
        />

        <View style={{ paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: 10 }}>
          <Text style={{ color: colors.text, fontSize: 32, fontWeight: '900', letterSpacing: -1.2, marginBottom: 2 }}>
            Explore
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10 }}>
            Discover what's resonating
          </Text>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search users, echoes, hashtags..." />
        </View>

        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.glassBorder,
          }}
        />
      </View>
    </View>
  );
}
