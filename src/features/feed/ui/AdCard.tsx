import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../../shared/lib/theme';
import { AnimatedPressable } from '../../../../components/ui/AnimatedPressable';
import { AdItem, trackAdView, trackAdClick } from '../api/useAds';
import { ArrowUpRight } from 'phosphor-react-native';

export function AdCard({ ad }: { ad: AdItem }) {
  const { colors, radius, font } = useTheme();
  const viewed = useRef(false);

  useEffect(() => {
    if (!viewed.current) {
      viewed.current = true;
      trackAdView(ad.id).catch(() => {});
    }
  }, [ad.id]);

  const handlePress = async () => {
    trackAdClick(ad.id).catch(() => {});
    try {
      await Linking.openURL(ad.target_url);
    } catch (e) {}
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {ad.advertiser?.avatar_url ? (
            <Image source={ad.advertiser.avatar_url} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }} />
          ) : (
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, marginRight: 8 }} />
          )}
          <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>
            {ad.advertiser?.display_name || 'Sponsored'}
          </Text>
        </View>
        <Text style={[font.bodyMedium, { color: colors.textMuted, fontSize: 12 }]}>Sponsored</Text>
      </View>

      <Text style={[font.title, { color: colors.text, fontSize: 18, marginBottom: 8 }]}>{ad.headline}</Text>
      {ad.body ? (
        <Text style={[font.body, { color: colors.textSecondary, fontSize: 15, marginBottom: 16 }]} numberOfLines={3}>
          {ad.body}
        </Text>
      ) : null}

      {ad.media_url ? (
        <Image
          source={ad.media_url}
          style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.card, marginBottom: 16 }}
          contentFit="cover"
        />
      ) : null}

      <View style={{ backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.button, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={[font.bodyBold, { color: '#000', fontSize: 15, marginRight: 6 }]}>{ad.call_to_action}</Text>
        <ArrowUpRight size={16} color="#000" weight="bold" />
      </View>
    </AnimatedPressable>
  );
}
