import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ChatCircle,
  ShareNetwork,
  Tag,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { PhotoGallery } from '../../components/marketplace/PhotoGallery';
import { formatPrice } from '../../lib/currency';
import { fetchListing, ListingWithSeller, updateListingStatus } from '../../lib/marketplaceApi';
import { showToast } from '../../components/ui/Toast';
import { useAppStore } from '../../store/useAppStore';

const CONDITION_COLOR: Record<string, string> = {
  'New': '#10B981',
  'Like new': '#34D399',
  'Good': '#F59E0B',
  'Service': '#6366F1',
};

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, fontSizes, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const currentUserId = useAppStore(s => s.userId);

  const [listing, setListing] = useState<ListingWithSeller | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingStatus, setMarkingStatus] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchListing(id)
      .then(setListing)
      .catch(() => showToast('Could not load listing', 'Error'))
      .finally(() => setLoading(false));
  }, [id]);

  const isMine = listing?.sellerId === currentUserId;

  const handleMessage = () => {
    if (!listing) return;
    router.push({ pathname: '/messages/[id]', params: { id: listing.sellerId } } as any);
  };

  const handleShare = async () => {
    if (!listing) return;
    await Share.share({ message: `${listing.title} — ${formatPrice(listing.price, listing.currency)} on Echo` });
  };

  const markSold = async () => {
    if (!listing) return;
    setMarkingStatus(true);
    try {
      await updateListingStatus(listing.id, 'sold');
      setListing(prev => prev ? { ...prev, status: 'sold' } : null);
      showToast('Marked as sold', 'CheckCircle');
    } catch {
      showToast('Could not update listing', 'Error');
    } finally {
      setMarkingStatus(false);
    }
  };

  const deleteListing = async () => {
    if (!listing) return;
    setMarkingStatus(true);
    try {
      await updateListingStatus(listing.id, 'removed');
      showToast('Listing removed', 'CheckCircle');
      router.back();
    } catch {
      showToast('Could not remove listing', 'Error');
    } finally {
      setMarkingStatus(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, textAlign: 'center' }}>
          This listing is no longer available.
        </Text>
        <AnimatedPressable onPress={() => router.back()} fadeOnPress style={{ marginTop: 20 }}>
          <Text style={{ color: colors.accent, fontSize: fontSizes.body }}>Go back</Text>
        </AnimatedPressable>
      </View>
    );
  }

  const condColor = CONDITION_COLOR[listing.condition] ?? colors.textMuted;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Floating back / share bar */}
      <View style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 16,
        right: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        zIndex: 10,
      }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ArrowLeft color="#fff" size={20} />
        </Pressable>
        <Pressable
          onPress={handleShare}
          hitSlop={12}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ShareNetwork color="#fff" size={20} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* Photo gallery */}
        {listing.photoUrls.length > 0
          ? <PhotoGallery urls={listing.photoUrls} />
          : (
            <View style={{
              height: 240,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Tag color={colors.textMuted} size={40} />
              <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: fontSizes.caption }}>No photos</Text>
            </View>
          )
        }

        <View style={{ padding: 16, gap: 16 }}>
          {/* Price + status */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.text, fontSize: 28, fontFamily: 'Inter_700Bold', lineHeight: 34 }}>
                {formatPrice(listing.price, listing.currency)}
              </Text>
              {listing.status === 'sold' && (
                <View style={{
                  alignSelf: 'flex-start',
                  backgroundColor: '#EF444420',
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}>
                  <Text style={{ color: '#EF4444', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>SOLD</Text>
                </View>
              )}
            </View>
            {/* Condition chip */}
            <View style={{
              backgroundColor: condColor + '20',
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}>
              <Text style={{ color: condColor, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
                {listing.condition}
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text style={{ color: colors.text, fontSize: fontSizes.title, fontFamily: 'Inter_700Bold', lineHeight: 26 }}>
            {listing.title}
          </Text>

          {/* Category + location */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontFamily: 'Inter_500Medium' }}>
                {listing.category}
              </Text>
            </View>
            {listing.locationLabel ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontFamily: 'Inter_500Medium' }}>
                  {listing.locationLabel}
                </Text>
              </View>
            ) : null}
            {listing.fulfillment ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontFamily: 'Inter_500Medium' }}>
                  {listing.fulfillment}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Description */}
          {listing.description ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 16 }}>
              <Text style={{ color: colors.text, fontSize: fontSizes.body, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
                {listing.description}
              </Text>
            </View>
          ) : null}

          {/* Tags */}
          {listing.tags.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {listing.tags.map(tag => (
                <View
                  key={tag}
                  style={{
                    backgroundColor: colors.accentMuted,
                    borderRadius: 20,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ color: colors.accent, fontSize: fontSizes.caption, fontFamily: 'Inter_500Medium' }}>
                    #{tag}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Seller card */}
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <ProfileAvatar
              displayName={listing.sellerName}
              avatarColor={listing.sellerAvatarColor}
              avatarUrl={listing.sellerAvatarUrl ?? undefined}
              size={44}
              showHalo={false}
              isVerified={listing.sellerIsVerified}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: fontSizes.body, fontFamily: 'Inter_600SemiBold' }}>
                {listing.sellerName}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontFamily: 'Inter_400Regular' }}>
                @{listing.sellerUsername}
              </Text>
            </View>
          </View>

          {/* Seller actions */}
          {isMine && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <AnimatedPressable
                onPress={markSold}
                disabled={listing.status === 'sold' || markingStatus}
                fadeOnPress
                style={{
                  flex: 1,
                  backgroundColor: listing.status === 'sold' ? colors.border : '#10B98120',
                  borderRadius: radius.md,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  color: listing.status === 'sold' ? colors.textMuted : '#10B981',
                  fontFamily: 'Inter_600SemiBold',
                  fontSize: fontSizes.body,
                }}>
                  {listing.status === 'sold' ? 'Already sold' : 'Mark as sold'}
                </Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={deleteListing}
                disabled={markingStatus}
                fadeOnPress
                style={{
                  flex: 1,
                  backgroundColor: '#EF444420',
                  borderRadius: radius.md,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#EF4444', fontFamily: 'Inter_600SemiBold', fontSize: fontSizes.body }}>
                  Remove listing
                </Text>
              </AnimatedPressable>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      {!isMine && listing.status === 'active' && (
        <View style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: 16,
          paddingBottom: insets.bottom + 12,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}>
          <AnimatedPressable
            onPress={handleMessage}
            depth="medium"
            style={{
              backgroundColor: colors.accent,
              borderRadius: radius.full,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <ChatCircle color="#fff" size={20} weight="fill" />
            <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: fontSizes.body }}>
              Message seller
            </Text>
          </AnimatedPressable>
        </View>
      )}
    </View>
  );
}
