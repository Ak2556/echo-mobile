import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BookOpen,
  Briefcase,
  CheckCircle,
  DotsThree,
  House,
  MagnifyingGlass,
  Monitor,
  Package,
  Palette,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Storefront,
  Tag,
  Truck,
  TShirt,
  Wrench,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { ListingCardSkeleton } from '../../components/ui/Skeleton';
import { ErrorState, classifyError } from '../../components/common/ErrorState';
import { track } from '../../lib/analytics';
import { formatPrice, type CurrencyCode } from '../../lib/currency';
import {
  fetchListings,
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  ListingCondition,
  ListingWithSeller,
} from '../../lib/marketplaceApi';
import { useTheme } from '../../lib/theme';
import { useResponsiveLayout } from '../../lib/responsive';
import { useAppStore } from '../../store/useAppStore';
import { getTargetCategory } from '../../lib/targetCategories';
import { clearRecentListings, getRecentListings, recordListingView, type RecentListing } from '../../lib/marketplaceRecents';

const CARD_GAP = 12;
const CARD_H_PADDING = 16;

type SortMode = 'newest' | 'price-low' | 'price-high';
type MarketMode = 'all' | 'services' | 'local' | 'digital';
type ConditionFilter = ListingCondition | 'All';

// Warm editorial palette (lib/avatarPalette.ts) mapped by category.
const CATEGORY_META: Record<string, { color: string; Icon: React.ComponentType<any> }> = {
  All: { color: '#E06030', Icon: Storefront },
  'Books & Learning': { color: '#4E7A8B', Icon: BookOpen },
  'Tech & Gear': { color: '#4E8B7A', Icon: Monitor },
  Workspace: { color: '#7A8B4E', Icon: Briefcase },
  Creative: { color: '#B35D6B', Icon: Palette },
  Services: { color: '#8B5E7D', Icon: Wrench },
  Clothing: { color: '#C65F3F', Icon: TShirt },
  Home: { color: '#B08536', Icon: House },
  Other: { color: '#8B6F4E', Icon: DotsThree },
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

function categoryMeta(label: string) {
  return CATEGORY_META[label] ?? CATEGORY_META.Other;
}

function matchesTarget(listing: ListingWithSeller, terms: string[]): boolean {
  if (!terms.length) return false;
  const searchable = [
    listing.title,
    listing.description,
    listing.category,
    listing.fulfillment,
    listing.locationLabel,
    ...listing.tags,
  ].join(' ').toLowerCase();
  return terms.some(term => term && searchable.includes(term));
}

function CategoryPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, font } = useTheme();
  const meta = categoryMeta(label);
  const Icon = meta.Icon;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <View
        style={{
          minHeight: 40,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 13,
          borderRadius: 999,
          backgroundColor: active ? meta.color : colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: active ? meta.color : colors.border,
        }}
      >
        <Icon color={active ? '#fff' : meta.color} size={16} weight="bold" />
        <Text style={[font.bodySemibold, { color: active ? '#fff' : colors.textSecondary, fontSize: 13 }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, font } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <View style={{
        minHeight: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? colors.accent : colors.surfaceHover,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? colors.accent : colors.border,
      }}>
        <Text style={[font.bodySemibold, { color: active ? '#fff' : colors.textSecondary, fontSize: 12 }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function ListingCard({ item, width, featured = false }: { item: ListingWithSeller; width: number; featured?: boolean }) {
  const { colors, radius, font } = useTheme();
  const hasPhoto = item.photoUrls.length > 0;
  const meta = categoryMeta(item.category);
  const imageHeight = featured ? Math.round(width * 0.66) : Math.round(width * 0.78);

  return (
    <AnimatedPressable
      onPress={() => {
        track('marketplace_listing_opened', { listing_id: item.id, category: item.category });
        void recordListingView({
          id: item.id,
          title: item.title,
          price: item.price,
          currency: item.currency,
          photo: item.photoUrls[0] ?? null,
          category: item.category,
          condition: item.condition,
        });
        router.push(`/listing/${item.id}` as Href);
      }}
      depth={featured ? 'medium' : 'soft'}
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
      <View style={{ width, height: imageHeight, backgroundColor: colors.bg }}>
        {hasPhoto ? (
          <Image
            source={{ uri: item.photoUrls[0] }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <LinearGradient
            colors={[`${meta.color}35`, `${meta.color}0D`, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
          >
            <Tag color={meta.color} size={32} weight="bold" />
          </LinearGradient>
        )}

        <LinearGradient
          colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.62)']}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 78 }}
          pointerEvents="none"
        />

        <View style={{ position: 'absolute', left: 9, right: 9, bottom: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.56)', paddingHorizontal: 8, paddingVertical: 4, maxWidth: '72%' }}>
            <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'Inter_700Bold' }} numberOfLines={1}>
              {item.condition}
            </Text>
          </View>
          {item.photoUrls.length > 1 ? (
            <View style={{ borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.56)', paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'Inter_700Bold' }}>
                1/{item.photoUrls.length}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={{ padding: featured ? 13 : 11, gap: 7 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Text
            style={[font.bodyBold, { flex: 1, color: colors.text, fontSize: featured ? 15 : 13, lineHeight: featured ? 20 : 18 }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <Text
            style={[font.bodyBold, { color: colors.accent, fontSize: featured ? 16 : 14 }]}
            numberOfLines={1}
          >
            {formatPrice(item.price, item.currency)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <MiniBadge icon={<Package color={meta.color} size={12} weight="bold" />} text={item.category} />
          {item.fulfillment ? <MiniBadge icon={<Truck color={colors.textMuted} size={12} weight="bold" />} text={item.fulfillment} /> : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 3 }}>
          <ProfileAvatar
            displayName={item.sellerName}
            avatarColor={item.sellerAvatarColor}
            avatarUrl={item.sellerAvatarUrl ?? undefined}
            size={20}
            showHalo={false}
          />
          <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 11, flex: 1 }]} numberOfLines={1}>
            @{item.sellerUsername}
          </Text>
          <Text style={[font.body, { color: colors.textMuted, fontSize: 11 }]}>
            {timeAgo(item.createdAt)}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function MiniBadge({ icon, text }: { icon: React.ReactNode; text: string }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, backgroundColor: colors.surfaceHover, paddingHorizontal: 7, paddingVertical: 4, maxWidth: '100%' }}>
      {icon}
      <Text style={[font.bodySemibold, { color: colors.textMuted, fontSize: 10 }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function MarketHero({ total, services, targetLabel, onSell }: { total: number; services: number; targetLabel: string; onSell: () => void }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: colors.surface, marginBottom: 14 }}>
      <LinearGradient
        colors={[`${colors.accent}42`, `${colors.accent}14`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ padding: 18, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: `${colors.accent}22`, alignItems: 'center', justifyContent: 'center' }}>
            <Storefront color={colors.accent} size={25} weight="bold" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[font.display, { color: colors.text, fontSize: 28, lineHeight: 33 }]}>
              Market for builders, creators, and focused people.
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <HeroStat value={String(total)} label="active" />
          <HeroStat value={String(services)} label="services" />
          <HeroStat value={targetLabel} label="target" />
        </View>
        <AnimatedPressable
          onPress={onSell}
          depth="medium"
          haptic="medium"
          style={{
            minHeight: 46,
            borderRadius: 16,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
          }}
        >
          <Plus color="#fff" size={18} weight="bold" />
          <Text style={[font.bodyBold, { color: '#fff', fontSize: 14 }]}>Sell something</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ minWidth: 86, flex: 1, borderRadius: 16, backgroundColor: colors.surfaceHover, paddingHorizontal: 12, paddingVertical: 10 }}>
      <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[font.body, { color: colors.textMuted, fontSize: 11, marginTop: 2 }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function SectionHeader({ title, caption, actionLabel, onAction }: { title: string; caption?: string; actionLabel?: string; onAction?: () => void }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[font.bodySemibold, { color: colors.textMuted, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' }]}>
          {title}
        </Text>
        {caption ? (
          <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]} numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
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

function TrustRow() {
  const { colors, font } = useTheme();
  const rows = [
    { icon: <ShieldCheck color="#10B981" size={17} weight="bold" />, label: 'Profile-first sellers' },
    { icon: <CheckCircle color="#3B82F6" size={17} weight="bold" />, label: 'DM before deal' },
    { icon: <Truck color="#F59E0B" size={17} weight="bold" />, label: 'Pickup or shipping' },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {rows.map(row => (
        <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 7 }}>
          {row.icon}
          <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 11 }]}>
            {row.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SpotlightRail({ items, width }: { items: ListingWithSeller[]; width: number }) {
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: 18 }}>
      <SectionHeader title="Spotlight" caption="Useful listings worth checking first" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {items.map(item => (
          <ListingCard key={`spotlight-${item.id}`} item={item} width={width} featured />
        ))}
      </ScrollView>
    </View>
  );
}

/** Compact "jump back in" thumbnail for a recently viewed listing. */
function RecentListingChip({ item }: { item: RecentListing }) {
  const { colors, font } = useTheme();
  const meta = categoryMeta(item.category);
  return (
    <AnimatedPressable
      onPress={() => router.push(`/listing/${item.id}` as Href)}
      fadeOnPress
      haptic="light"
      style={{ width: 132 }}
      accessibilityLabel={`Open ${item.title}`}
    >
      <View style={{ width: 132, height: 100, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
        {item.photo ? (
          <Image source={{ uri: item.photo }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <LinearGradient colors={[`${meta.color}35`, `${meta.color}0D`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <Tag color={meta.color} size={24} weight="bold" />
          </LinearGradient>
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 46 }} pointerEvents="none" />
        <Text style={{ position: 'absolute', left: 8, bottom: 7, color: '#fff', fontSize: 12.5, fontFamily: 'Inter_700Bold' }} numberOfLines={1}>
          {formatPrice(item.price, item.currency as CurrencyCode)}
        </Text>
      </View>
      <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 11.5, marginTop: 5 }]} numberOfLines={1}>
        {item.title}
      </Text>
    </AnimatedPressable>
  );
}

function RecentlyViewedRail({ items, onClear }: { items: RecentListing[]; onClear: () => void }) {
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: 18 }}>
      <SectionHeader title="Recently viewed" actionLabel="Clear" onAction={onClear} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {items.map(item => <RecentListingChip key={`recent-${item.id}`} item={item} />)}
      </ScrollView>
    </View>
  );
}

export default function MarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const { colors, font, fontSizes } = useTheme();
  const layout = useResponsiveLayout();
  const { width: windowWidth } = useWindowDimensions();
  const targetCategoryId = useAppStore(s => s.targetCategory);
  const targetOutcome = useAppStore(s => s.targetOutcome);
  const targetCategory = getTargetCategory(targetCategoryId);

  const [listings, setListings] = useState<ListingWithSeller[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [condition, setCondition] = useState<ConditionFilter>('All');
  const [mode, setMode] = useState<MarketMode>('all');
  const [sort, setSort] = useState<SortMode>('newest');
  const [recentViewed, setRecentViewed] = useState<RecentListing[]>([]);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refresh "recently viewed" each time the tab regains focus (i.e. after
  // returning from a listing detail).
  useFocusEffect(
    useCallback(() => {
      getRecentListings().then(setRecentViewed).catch(() => setRecentViewed([]));
    }, []),
  );

  const clearRecents = useCallback(() => {
    void clearRecentListings();
    setRecentViewed([]);
  }, []);

  const load = useCallback(async (q: string, cat: string, refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await fetchListings({ category: cat !== 'All' ? cat : undefined, query: q });
      setListings(data);
      setLoadError(null);
    } catch (e) {
      setListings([]);
      setLoadError(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    track('marketplace_viewed', { category });
  }, [category]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => load(query, category), 350);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [category, load, query]);

  const gridOuterWidth = Math.min(windowWidth, layout.isDesktop ? 1120 : layout.wideMaxWidth);
  const columns = layout.isDesktop ? 3 : layout.isTablet ? 3 : 2;
  const gridWidth = gridOuterWidth - CARD_H_PADDING * 2;
  const cardWidth = Math.floor((gridWidth - CARD_GAP * (columns - 1)) / columns);
  const spotlightWidth = Math.min(layout.isPhone ? gridWidth * 0.82 : 330, 360);

  const targetTerms = useMemo(() => {
    const outcomeTerms = targetOutcome.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 3);
    return [
      targetCategory.label.toLowerCase(),
      targetCategory.id.toLowerCase(),
      ...targetCategory.apps,
      ...targetCategory.metrics.map(metric => metric.toLowerCase()),
      ...outcomeTerms,
    ];
  }, [targetCategory, targetOutcome]);

  const sortedListings = useMemo(() => {
    const filtered = listings.filter(item => {
      if (condition !== 'All' && item.condition !== condition) return false;
      if (mode === 'services' && item.condition !== 'Service') return false;
      if (mode === 'local' && !/pickup|local|near/i.test(`${item.fulfillment} ${item.locationLabel}`)) return false;
      if (mode === 'digital' && !/digital|remote|dm|download|online/i.test(`${item.fulfillment} ${item.locationLabel} ${item.category}`)) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sort === 'price-low') return a.price - b.price;
      if (sort === 'price-high') return b.price - a.price;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [condition, listings, mode, sort]);

  const targetMatches = useMemo(
    () => sortedListings.filter(item => matchesTarget(item, targetTerms)).slice(0, 8),
    [sortedListings, targetTerms],
  );
  const spotlight = useMemo(() => {
    const source = targetMatches.length ? targetMatches : sortedListings;
    return source.slice(0, 5);
  }, [sortedListings, targetMatches]);

  const serviceCount = listings.filter(item => item.condition === 'Service').length;
  const header = (
    <View style={{ paddingHorizontal: CARD_H_PADDING, paddingTop: 12 }}>
      <MarketHero
        total={listings.length}
        services={serviceCount}
        targetLabel={targetCategory.label}
        onSell={() => router.push('/create-listing' as Href)}
      />
      <TrustRow />
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: colors.surface,
        borderRadius: 18,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        paddingHorizontal: 13,
        marginBottom: 12,
      }}>
        <MagnifyingGlass color={colors.textMuted} size={18} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search gear, services, books, creators..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: fontSizes.body,
            paddingVertical: 13,
            fontFamily: 'Inter_400Regular',
          }}
        />
        <SlidersHorizontal color={colors.textMuted} size={18} weight="bold" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        {(LISTING_CATEGORIES as readonly string[]).map(item => (
          <CategoryPill
            key={item}
            label={item}
            active={category === item}
            onPress={() => setCategory(item)}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
        {([
          ['all', 'All deals'],
          ['services', 'Services'],
          ['local', 'Local pickup'],
          ['digital', 'Remote/digital'],
        ] as const).map(([value, label]) => (
          <FilterChip key={value} label={label} active={mode === value} onPress={() => setMode(value)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
        <FilterChip label="Newest" active={sort === 'newest'} onPress={() => setSort('newest')} />
        <FilterChip label="Lowest price" active={sort === 'price-low'} onPress={() => setSort('price-low')} />
        <FilterChip label="Highest price" active={sort === 'price-high'} onPress={() => setSort('price-high')} />
        {(['All', ...LISTING_CONDITIONS] as ConditionFilter[]).map(item => (
          <FilterChip key={item} label={item === 'All' ? 'Any condition' : item} active={condition === item} onPress={() => setCondition(item)} />
        ))}
      </ScrollView>

      {!query.trim() && category === 'All' ? <RecentlyViewedRail items={recentViewed} onClear={clearRecents} /> : null}

      <SpotlightRail items={spotlight} width={spotlightWidth} />

      {targetMatches.length > 0 ? (
        <View style={{ marginBottom: 18 }}>
          <SectionHeader
            title="For Your Target"
            caption={targetOutcome.trim() || targetCategory.outcome}
            actionLabel="Progress"
            onAction={() => router.push('/target-progress' as Href)}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {targetMatches.slice(0, 6).map(item => (
              <ListingCard key={`target-${item.id}`} item={item} width={spotlightWidth} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <SectionHeader title="Latest Listings" caption={`${sortedListings.length} result${sortedListings.length === 1 ? '' : 's'}`} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{
        paddingTop: insets.top + 10,
        paddingBottom: 10,
        backgroundColor: colors.bg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}>
        <View style={{ width: '100%', maxWidth: gridOuterWidth, alignSelf: 'center', paddingHorizontal: CARD_H_PADDING, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: `${colors.accent}20`, alignItems: 'center', justifyContent: 'center' }}>
              <Storefront color={colors.accent} size={21} weight="bold" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[font.displayBlack, { color: colors.text, fontSize: 25, lineHeight: 30 }]}>
                Market
              </Text>
              <Text style={[font.body, { color: colors.textMuted, fontSize: 12 }]} numberOfLines={1}>
                Buy, sell, and hire inside Echo
              </Text>
            </View>
          </View>
          <AnimatedPressable
            onPress={() => router.push('/create-listing' as Href)}
            depth="medium"
            fadeOnPress
            haptic="medium"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              backgroundColor: colors.accent,
              paddingHorizontal: 14,
              minHeight: 38,
              borderRadius: 999,
            }}
          >
            <Plus color="#fff" size={15} weight="bold" />
            <Text style={[font.bodyBold, { color: '#fff', fontSize: 13 }]}>Sell</Text>
          </AnimatedPressable>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={{ flex: 1, paddingHorizontal: CARD_H_PADDING, paddingTop: 8 }}>
          {Array.from({ length: Math.ceil(6 / columns) }).map((_, row) => (
            <View key={row} style={{ flexDirection: 'row', gap: CARD_GAP, marginBottom: CARD_GAP }}>
              {Array.from({ length: columns }).map((__, col) => (
                <ListingCardSkeleton key={col} />
              ))}
            </View>
          ))}
        </View>
      ) : loadError && listings.length === 0 ? (
        <ErrorState kind={classifyError(loadError)} onRetry={() => load(query, category)} />
      ) : (
        <FlatList
          key={columns}
          data={sortedListings}
          keyExtractor={item => item.id}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: CARD_GAP } : undefined}
          ListHeaderComponent={header}
          contentContainerStyle={{
            width: '100%',
            maxWidth: gridOuterWidth,
            alignSelf: 'center',
            paddingHorizontal: CARD_H_PADDING,
            paddingBottom: layout.bottomChromePadding,
            gap: CARD_GAP,
          }}
          onRefresh={() => load(query, category, true)}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ paddingTop: 44, paddingHorizontal: 24, alignItems: 'center', gap: 12 }}>
              <View style={{ width: 58, height: 58, borderRadius: 22, backgroundColor: `${colors.accent}18`, alignItems: 'center', justifyContent: 'center' }}>
                <Package color={colors.accent} size={30} weight="bold" />
              </View>
              <Text style={[font.bodyBold, { color: colors.text, fontSize: 16, textAlign: 'center' }]}>
                No listings found
              </Text>
              <Text style={[font.body, { color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' }]}>
                Change filters or create the first listing for this lane.
              </Text>
              <Pressable
                onPress={() => router.push('/create-listing' as Href)}
                accessibilityRole="button"
                accessibilityLabel="Post a listing"
                style={{
                  width: '100%',
                  maxWidth: 260,
                  minHeight: 48,
                  backgroundColor: colors.accent,
                  borderRadius: 18,
                  marginTop: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  shadowColor: colors.accent,
                  shadowOpacity: 0.28,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 8 },
                }}
              >
                <Plus color="#fff" size={16} weight="bold" />
                <Text style={[font.bodyBold, { color: '#fff', fontSize: 14 }]}>Post a listing</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ width: cardWidth }}>
              <ListingCard item={item} width={cardWidth} />
            </View>
          )}
        />
      )}
    </View>
  );
}
