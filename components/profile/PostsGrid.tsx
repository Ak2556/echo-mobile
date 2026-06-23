import React from 'react';
import { View, Text, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Images } from 'phosphor-react-native';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { GlassPanel } from '../ui/GlassPanel';
import { EmptyState } from '../common/EmptyState';
import { useTheme } from '../../lib/theme';
import { FeedItem } from '../../types';

const GRID_COLUMNS = 3;
const GRID_GAP = 2;
const GRID_HORIZONTAL_INSET = 16;
const COMPACT_TEXT_SCALE = 1.2;

interface PostsGridProps {
  echoes: FeedItem[];
  onPressEcho: (item: FeedItem) => void;
  avatarColor: string;
  containerWidth?: number;
}

function GridCell({ item, onPress, size }: { item: FeedItem; onPress: () => void; size: number }) {
  const hasMedia = item.mediaUris && item.mediaUris.length > 0;

  return (
    <AnimatedPressable
      onPress={onPress}
      style={{ width: size, height: size, overflow: 'hidden', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.04)' }}
      scaleValue={0.95}
      haptic="light"
    >
      {hasMedia ? (
        <Image
          source={{ uri: item.mediaUris![0] }}
          style={{ flex: 1 }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <LinearGradient
          colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.5)']}
          style={{ flex: 1, padding: 8, justifyContent: 'flex-end' }}
        >
          <Text style={{ color: '#fff', fontSize: 11, lineHeight: 15 }} numberOfLines={2} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>
            {item.prompt}
          </Text>
        </LinearGradient>
      )}
    </AnimatedPressable>
  );
}

function FeaturedCard({
  item,
  onPress,
  avatarColor,
}: {
  item: FeedItem;
  onPress: () => void;
  avatarColor: string;
}) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable onPress={onPress} style={{ marginBottom: 12 }} scaleValue={0.98} haptic="light">
      <GlassPanel borderRadius={12} intensity={32}>
        <View style={{ padding: 16, flexDirection: 'row', gap: 12 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: avatarColor,
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>
              {(item.displayName || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>
              {item.displayName}
            </Text>
            <Text
              style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 }}
              numberOfLines={3}
              maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
            >
              {item.response || item.prompt}
            </Text>
          </View>
        </View>
      </GlassPanel>
    </AnimatedPressable>
  );
}

export function PostsGrid({ echoes, onPressEcho, avatarColor, containerWidth }: PostsGridProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const featured = echoes[0];
  const gridEchoes = echoes.slice(1);
  const gridWidth = Math.min(width, containerWidth ?? width);
  const cellSize = Math.floor(
    (gridWidth - GRID_HORIZONTAL_INSET * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
  );

  if (echoes.length === 0) {
    return (
      <View style={{ paddingVertical: 60 }}>
        <EmptyState
          icon={<Images color={colors.accent} size={32} />}
          title="No posts yet"
          subtitle="Your echoes will appear here once you publish them."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={gridEchoes}
        numColumns={GRID_COLUMNS}
        keyExtractor={item => item.id}
        columnWrapperStyle={{ gap: GRID_GAP }}
        ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
        scrollEnabled={false}
        ListHeaderComponent={
          featured ? (
            <FeaturedCard item={featured} onPress={() => onPressEcho(featured)} avatarColor={avatarColor} />
          ) : null
        }
        renderItem={({ item }) => (
          <GridCell item={item} onPress={() => onPressEcho(item)} size={cellSize} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: GRID_HORIZONTAL_INSET,
    paddingTop: 12,
  },
});
