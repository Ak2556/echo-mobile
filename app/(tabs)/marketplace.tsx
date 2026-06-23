import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Books,
  Desktop,
  FunnelSimple,
  Lightbulb,
  MagnifyingGlass,
  PaintBrush,
  Package,
  Plus,
  Tag,
  Wrench,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { track } from '../../lib/analytics';
import { formatPrice } from '../../lib/currency';
import {
  fetchListings,
  LISTING_CATEGORIES,
  ListingCategory,
  ListingWithSeller,
} from '../../lib/marketplaceApi';
import { useTheme } from '../../lib/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_GAP = 10;
const CARD_H_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_H_PADDING * 2 - CARD_GAP) / 2;

const CATEGORY_ICON: Record<string, React.ComponentType<any>> = {
  All: FunnelSimple,
  'Books & Learning': Books,
  'Tech & Gear': Wrench,
  Workspace: Desktop,
  Creative: PaintBrush,
  Services: Lightbulb,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = diff / 3600000;
  if (h < 1) return 'Just now';
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function CategoryPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, fontSizes } = useTheme();
  const Icon = CATEGORY_ICON[label] ?? Package;
  return (
    <AnimatedPressable
      onPress={onPress}
      fadeOnPress
      haptic="light"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active ? colors.accent : colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? colors.accent : colors.border,
      }}
    >
      <Icon color={active ? '#fff' : colors.textMuted} size={13} weight={active ? 'bold' : 'regular'} />
      <Text style={{
        color: active ? '#fff' : colors.textSecondary,
        fontSize: 13,
        fontFamily: 'Inter_600SemiBold',
      }}>
        {label === 'All' ? 'All' : label}
      </Text>
    </AnimatedPressable>
  );
}

function ListingCard({ item, width }: { item: ListingWithSeller; width: number }) {
  const { colors, radius, fontSizes } = useTheme();
  const hasPhoto = item.photoUrls.length > 0;

  return (
    <AnimatedPressable
      onPress={() => {
        track('marketplace_listing_opened', { listing_id: item.id, category: item.category });
        router.push(`/listing/${item.id}` as any);
      }}
      depth="soft"
      fadeOnPress
      haptic="light"
      style={{
        width,
        borderRadius: radius.card,
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      {/* Photo or placeholder */}
      {hasPhoto ? (
        <Image
          source={{ uri: item.photoUrls[0] }}
          style={{ width, height: Math.round(width * 0.72) }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={{
          width,
          height: Math.round(width * 0.72),
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Tag color={colors.border} size={28} />
        </View>
      )}

      {/* Multiple photos indicator */}
      {item.photoUrls.length > 1 && (
        <View style={{
          position: 'absolute',
          top: 8, right: 8,
          backgroundColor: 'rgba(0,0,0,0.55)',
          borderRadius: 6,
          paddingHorizontal: 6,
          paddingVertical: 2,
        }}>
          <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>
            1/{item.photoUrls.length}
          </Text>
        </View>
      )}

      <View style={{ padding: 10, gap: 6 }}>
        <Text
          style={{ color: colors.text, fontSize: 13, fontFamily: 'Inter_600SemiBold', lineHeight: 18 }}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <Text
          style={{ color: colors.accent, fontSize: 15, fontFamily: 'Inter_700Bold' }}
          numberOfLines={1}
        >
          {formatPrice(item.price, item.currency)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <ProfileAvatar
            displayName={item.sellerName}
            avatarColor={item.sellerAvatarColor}
            avatarUrl={item.sellerAvatarUrl ?? undefined}
            size={18}
            showHalo={false}
          />
          <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
            {timeAgo(item.createdAt)}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

export default function MarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const { colors, fontSizes, radius } = useTheme();

  const [listings, setListings] = useState<ListingWithSeller[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ListingCategory | 'All'>('All');

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string, cat: string, refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await fetchListings({ category: cat !== 'All' ? cat : undefined, query: q });
      setListings(data);
    } catch {
      // silently fail — empty list shows
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(query, category);
    track('marketplace_viewed', { category });
  }, [category]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => load(query, category), 350);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [query]);

  // Build 2-column pairs
  const pairs: [ListingWithSeller, ListingWithSeller | null][] = [];
  for (let i = 0; i < listings.length; i += 2) {
    pairs.push([listings[i], listings[i + 1] ?? null]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 12,
        paddingHorizontal: CARD_H_PADDING,
        paddingBottom: 12,
        backgroundColor: colors.bg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        gap: 12,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text, fontSize: fontSizes.title, fontFamily: 'Inter_700Bold' }}>
            Marketplace
          </Text>
          <AnimatedPressable
            onPress={() => router.push('/create-listing' as any)}
            depth="medium"
            fadeOnPress
            haptic="medium"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: colors.accent,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
            }}
          >
            <Plus color="#fff" size={15} weight="bold" />
            <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Sell</Text>
          </AnimatedPressable>
        </View>

        {/* Search */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          paddingHorizontal: 12,
        }}>
          <MagnifyingGlass color={colors.textMuted} size={17} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search listings..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              flex: 1,
              color: colors.text,
              fontSize: fontSizes.body,
              paddingVertical: 10,
              fontFamily: 'Inter_400Regular',
            }}
          />
        </View>

        {/* Category pills */}
        <FlatList
          data={LISTING_CATEGORIES as unknown as string[]}
          keyExtractor={item => item}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <CategoryPill
              label={item}
              active={category === item}
              onPress={() => setCategory(item as any)}
            />
          )}
        />
      </View>

      {/* Grid */}
      {loading && !refreshing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={pairs}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{
            padding: CARD_H_PADDING,
            gap: CARD_GAP,
            paddingBottom: insets.bottom + 80,
          }}
          onRefresh={() => load(query, category, true)}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ paddingTop: 60, alignItems: 'center', gap: 12 }}>
              <Package color={colors.border} size={40} />
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                {query ? 'No listings match your search.' : 'No listings yet.\nBe the first to sell something.'}
              </Text>
              <AnimatedPressable
                onPress={() => router.push('/create-listing' as any)}
                fadeOnPress
                style={{
                  backgroundColor: colors.accent,
                  borderRadius: 999,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  marginTop: 4,
                }}
              >
                <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Post a listing</Text>
              </AnimatedPressable>
            </View>
          }
          renderItem={({ item: [left, right] }) => (
            <View style={{ flexDirection: 'row', gap: CARD_GAP }}>
              <ListingCard item={left} width={CARD_WIDTH} />
              {right
                ? <ListingCard item={right} width={CARD_WIDTH} />
                : <View style={{ width: CARD_WIDTH }} />
              }
            </View>
          )}
        />
      )}
    </View>
  );
}
