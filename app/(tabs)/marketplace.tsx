import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowRight,
  Books,
  PaintBrush,
  ChatCircleText,
  CheckCircle,
  Desktop,
  FunnelSimple,
  Lightbulb,
  MagnifyingGlass,
  MapPin,
  Package,
  SealCheck,
  Sparkle,
  Star,
  Wrench,
} from 'phosphor-react-native';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { track } from '../../lib/analytics';
import {
  buildMarketplaceMatches,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_LISTINGS,
  MarketplaceCategory,
  MarketplaceMatch,
} from '../../lib/marketplace';
import { getPersonaStatus, loadPersonaProfile } from '../../lib/persona';
import { useResponsiveLayout } from '../../lib/responsive';
import { useTheme } from '../../lib/theme';
import { useAppStore } from '../../store/useAppStore';

type CategoryFilter = MarketplaceCategory | 'All';

function formatListedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const days = Math.max(1, Math.round((Date.now() - date.getTime()) / 86400000));
  return days === 1 ? 'Today' : `${days}d ago`;
}

const CATEGORY_ICON: Record<MarketplaceCategory | 'All', React.ComponentType<any>> = {
  All: FunnelSimple,
  Gear: Wrench,
  Workspace: Desktop,
  Learning: Books,
  Creative: PaintBrush,
  Services: Lightbulb,
};

function CategoryPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, font } = useTheme();
  const Icon = CATEGORY_ICON[label as MarketplaceCategory | 'All'] ?? Package;
  return (
    <AnimatedPressable
      onPress={onPress}
      depth="soft"
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
      <Icon
        color={active ? '#fff' : colors.textMuted}
        size={13}
        weight={active ? 'bold' : 'regular'}
      />
      <Text style={[font.bodySemibold, { color: active ? '#fff' : colors.textSecondary, fontSize: 13 }]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function ListingCard({ listing, selected, onPress }: {
  listing: MarketplaceMatch;
  selected?: boolean;
  onPress: () => void;
}) {
  const { colors, radius, font } = useTheme();
  const Icon = CATEGORY_ICON[listing.category] ?? Package;

  return (
    <AnimatedPressable
      onPress={onPress}
      depth="soft"
      fadeOnPress
      haptic="light"
      style={{
        borderRadius: radius.card,
        backgroundColor: selected ? colors.accentMuted : colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: selected ? colors.accent : colors.border,
        overflow: 'hidden',
      }}
    >
      {/* Colored accent strip */}
      <View style={{ height: 3, backgroundColor: selected ? colors.accent : 'transparent' }} />

      <View style={{ padding: 16, gap: 10 }}>
        {/* Header row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            backgroundColor: colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Icon color={colors.accent} size={20} weight="duotone" />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[font.bodySemibold, { color: colors.text, fontSize: 15, lineHeight: 20 }]} numberOfLines={1}>
              {listing.title}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              {listing.category} · {formatListedAt(listing.listedAt)}
            </Text>
          </View>

          <Text style={[font.bodyBold, { color: colors.text, fontSize: 17 }]}>
            {listing.priceLabel}
          </Text>
        </View>

        {/* Description */}
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }} numberOfLines={2}>
          {listing.description}
        </Text>

        {/* Footer: seller + match score */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ProfileAvatar
              displayName={listing.sellerName}
              avatarColor={listing.sellerAvatarColor}
              size={20}
              showHalo={false}
            />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>@{listing.sellerUsername}</Text>
          </View>
          {listing.matchScore >= 60 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Star color={colors.accent} size={12} weight="fill" />
              <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>
                {listing.matchScore}% match
              </Text>
            </View>
          )}
        </View>
      </View>
    </AnimatedPressable>
  );
}

function ListingPreview({ listing }: { listing: MarketplaceMatch }) {
  const router = useRouter();
  const { colors, radius, font } = useTheme();
  const Icon = CATEGORY_ICON[listing.category] ?? Package;

  return (
    <View style={{
      borderRadius: radius.card,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    }}>
      {/* Category header band */}
      <View style={{
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}>
        <View style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: colors.accentMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Icon color={colors.accent} size={18} weight="duotone" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
            {listing.category.toUpperCase()} · {listing.condition.toUpperCase()}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
            {listing.locationLabel} · {listing.fulfillment}
          </Text>
        </View>
        {listing.matchScore >= 60 && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '800' }}>{listing.matchScore}%</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '600' }}>match</Text>
          </View>
        )}
      </View>

      <View style={{ padding: 18, gap: 16 }}>
        {/* Title + price */}
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 20, lineHeight: 26, flex: 1 }]}>
              {listing.title}
            </Text>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>
              {listing.priceLabel}
            </Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }}>
            {listing.description}
          </Text>
        </View>

        {/* Tags */}
        {listing.tags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {listing.tags.slice(0, 4).map(tag => (
              <View key={tag} style={{
                borderRadius: 6,
                paddingHorizontal: 9,
                paddingVertical: 4,
                backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Seller row */}
        <AnimatedPressable
          onPress={() => router.push(`/user/${listing.sellerId}`)}
          depth="soft"
          fadeOnPress
          haptic="light"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 12,
            borderRadius: 12,
            backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
          }}
        >
          <ProfileAvatar displayName={listing.sellerName} avatarColor={listing.sellerAvatarColor} size={36} showHalo={false} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={[font.bodySemibold, { color: colors.text, fontSize: 14 }]}>{listing.sellerName}</Text>
              <SealCheck color={colors.accent} size={13} weight="fill" />
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>@{listing.sellerUsername}</Text>
          </View>
          <ArrowRight color={colors.textMuted} size={16} />
        </AnimatedPressable>

        {/* Trust signals — minimal, no heading */}
        {listing.trustSignals.length > 0 && (
          <View style={{ gap: 6 }}>
            {listing.trustSignals.map(signal => (
              <View key={signal} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <CheckCircle color={colors.success} size={14} weight="fill" />
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{signal}</Text>
              </View>
            ))}
          </View>
        )}

        {/* CTA */}
        <AnimatedPressable
          onPress={() => {
            track('marketplace_inquiry_started', { listing_id: listing.id, category: listing.category, match_score: listing.matchScore });
            router.push('/messages');
          }}
          depth="medium"
          fadeOnPress
          haptic="medium"
          style={{
            minHeight: 50,
            borderRadius: 14,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
          }}
        >
          <ChatCircleText color="#fff" size={18} weight="bold" />
          <Text style={[font.bodyBold, { color: '#fff', fontSize: 15 }]}>Message seller</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

export default function MarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const { colors, radius, font } = useTheme();
  const layout = useResponsiveLayout();
  const userId = useAppStore(s => s.userId);
  const interests = useAppStore(s => s.interests);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');
  const persona = useMemo(() => loadPersonaProfile(userId), [userId]);
  const personaStatus = useMemo(() => getPersonaStatus(persona), [persona]);
  const matches = useMemo(
    () => buildMarketplaceMatches(MARKETPLACE_LISTINGS, { interests, persona, query, category }),
    [category, interests, persona, query],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = matches.find(item => item.id === selectedId) ?? matches[0] ?? null;
  const isDesktop = layout.isDesktop;
  const topPadding = insets.top + (isDesktop ? 30 : 18);

  useEffect(() => {
    track('marketplace_viewed', { persona_stage: personaStatus.stage, interests: interests.length });
  }, [interests.length, personaStatus.stage]);

  useEffect(() => {
    if (matches.length > 0 && !matches.some(item => item.id === selectedId)) {
      setSelectedId(matches[0].id);
    }
  }, [matches, selectedId]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: topPadding,
          paddingBottom: layout.bottomChromePadding,
          paddingHorizontal: layout.gutter,
        }}
      >
        <View style={layout.wideContentStyle}>

          {/* Header */}
          <View style={{ marginBottom: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Sparkle color={colors.accent} size={14} weight="fill" />
              <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>Peer marketplace</Text>
            </View>
            <Text style={[font.displayBlack, {
              color: colors.text,
              fontSize: isDesktop ? 32 : 26,
              lineHeight: isDesktop ? 38 : 32,
              marginBottom: 6,
            }]}>
              Things from people who think like you.
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
              Gear, services, and knowledge — ranked by how well they fit your interests.
            </Text>
          </View>

          {/* Search */}
          <View style={{
            borderRadius: radius.card,
            backgroundColor: colors.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            paddingHorizontal: 14,
            minHeight: 46,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
          }}>
            <MagnifyingGlass color={colors.textMuted} size={17} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search listings"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 11 }}
            />
          </View>

          {/* Category pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
            style={{ marginBottom: 20 }}
          >
            {MARKETPLACE_CATEGORIES.map(item => (
              <CategoryPill
                key={item}
                label={item}
                active={category === item}
                onPress={() => setCategory(item)}
              />
            ))}
          </ScrollView>

          {/* Listings + Preview */}
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: layout.cardGap, alignItems: 'flex-start' }}>
            <View style={{ width: isDesktop ? 420 : '100%', gap: 10 }}>
              {/* List header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={[font.bodySemibold, { color: colors.textMuted, fontSize: 12 }]}>
                  {matches.length} {matches.length === 1 ? 'listing' : 'listings'}
                </Text>
                {personaStatus.stage !== 'off' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <SealCheck color={colors.accent} size={12} weight="fill" />
                    <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>
                      Personalised
                    </Text>
                  </View>
                )}
              </View>

              {matches.map(item => (
                <ListingCard
                  key={item.id}
                  listing={item}
                  selected={selected?.id === item.id && isDesktop}
                  onPress={() => {
                    setSelectedId(item.id);
                    track('marketplace_listing_opened', { listing_id: item.id, category: item.category, match_score: item.matchScore });
                  }}
                />
              ))}

              {matches.length === 0 && (
                <View style={{
                  borderRadius: radius.card,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: 24,
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <Package color={colors.textMuted} size={28} weight="duotone" />
                  <Text style={[font.bodySemibold, { color: colors.text, fontSize: 15, marginTop: 4 }]}>
                    Nothing here yet
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
                    Try a different category or clear your search.
                  </Text>
                </View>
              )}
            </View>

            {selected && (
              <View style={{ flex: 1, width: isDesktop ? undefined : '100%', minWidth: 0 }}>
                {!isDesktop && (
                  <Text style={[font.bodySemibold, { color: colors.textMuted, fontSize: 12, marginBottom: 10 }]}>
                    Listing details
                  </Text>
                )}
                <ListingPreview listing={selected} />
              </View>
            )}
          </View>

        </View>
      </ScrollView>
    </View>
  );
}
