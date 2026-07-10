import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Images } from 'phosphor-react-native';
import { EmptyState } from '../common/EmptyState';
import { useTheme } from '../../lib/theme';
import { FeedItem } from '../../types';

const GRID_GAP = 8;
const GRID_HORIZONTAL_INSET = 12;
const COMPACT_TEXT_SCALE = 1.2;

interface PostsGridProps {
  echoes: FeedItem[];
  onPressEcho: (item: FeedItem) => void;
  avatarColor: string;
  containerWidth?: number;
}

function MosaicTile({
  item,
  onPress,
  tint,
  width,
  height,
  featured,
}: {
  item: FeedItem;
  onPress: () => void;
  tint: string;
  width: number;
  height: number;
  featured?: boolean;
}) {
  const { colors, font } = useTheme();
  const mediaUri = item.mediaUris?.[0];

  return (
    <Pressable onPress={onPress}>
      <View style={{ width, height, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface }}>
        {mediaUri ? (
          <>
            <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.72)']}
              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: Math.min(height * 0.6, 120) }}
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
        <View style={{ flex: 1, justifyContent: mediaUri ? 'flex-end' : 'flex-start', padding: 13 }}>
          <Text
            style={[
              font.display,
              {
                color: mediaUri ? '#fff' : colors.text,
                fontSize: featured ? 20 : 15,
                lineHeight: featured ? 26 : 20,
              },
            ]}
            numberOfLines={mediaUri ? 2 : featured ? 4 : 5}
            maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
          >
            {item.editorialTitle || item.prompt}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function PostsGrid({ echoes, onPressEcho, avatarColor, containerWidth }: PostsGridProps) {
  const { colors } = useTheme();
  const gridWidth = Math.max(containerWidth ?? 360, 280);
  const usable = Math.max(gridWidth - GRID_HORIZONTAL_INSET * 2, 240);
  const columns = usable >= 620 ? 3 : 2;
  const tileWidth = Math.floor((usable - GRID_GAP * (columns - 1)) / columns);

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

  const [featured, ...rest] = echoes;

  return (
    <View style={{ paddingHorizontal: GRID_HORIZONTAL_INSET, paddingTop: 12 }}>
      <View style={{ marginBottom: GRID_GAP }}>
        <MosaicTile
          item={featured}
          onPress={() => onPressEcho(featured)}
          tint={featured.avatarColor || avatarColor}
          width={usable}
          height={featured.mediaUris?.[0] ? 300 : 180}
          featured
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
        {rest.map((item, idx) => (
          <MosaicTile
            key={item.id}
            item={item}
            onPress={() => onPressEcho(item)}
            tint={item.avatarColor || avatarColor}
            width={tileWidth}
            height={columns === 3 ? (idx % 3 === 0 ? 190 : 150) : (idx % 3 === 0 ? 220 : 170)}
          />
        ))}
      </View>
    </View>
  );
}
