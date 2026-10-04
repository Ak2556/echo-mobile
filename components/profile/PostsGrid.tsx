import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Images, Play } from 'phosphor-react-native';
import { EmptyState } from '../common/EmptyState';
import { useTheme } from '../../lib/ui/theme';
import { FeedItem } from '../../types';
import { ttx } from '../../lib/i18n/i18n';
import { useVideoPoster } from '../../lib/media/videoPoster';

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
  // mapSupabaseEcho clears mediaUris once it detects a video, so a video tile
  // falls through to the text treatment with nothing marking it as a video.
  const isVideo = item.postType === 'video' || !!item.videoUri;
  // A video carries no thumbnail; one frame is read from the clip, the same as
  // the feed's video tile. Until it arrives, or where it cannot be had, the
  // tile is dark with a play mark rather than the pale text treatment.
  const poster = useVideoPoster(isVideo ? item.videoUri : undefined);
  const photoUri = item.mediaUris?.[0];
  const image = photoUri ? { uri: photoUri } : poster;
  const hasMedia = !!image;

  return (
    <Pressable onPress={onPress}>
      <View style={{ width, height, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface }}>
        {hasMedia ? (
          <>
            <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={160} />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.72)']}
              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: Math.min(height * 0.6, 120) }}
              pointerEvents="none"
            />
          </>
        ) : isVideo ? (
          <LinearGradient colors={['#0B0B0F', '#1B1B22', '#0B0B0F']} style={StyleSheet.absoluteFill} pointerEvents="none" />
        ) : (
          <LinearGradient
            colors={[`${tint}52`, `${tint}17`, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}
        {isVideo ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Play color="#fff" size={14} weight="fill" />
          </View>
        ) : null}
        <View style={{ flex: 1, justifyContent: hasMedia || isVideo ? 'flex-end' : 'flex-start', padding: 13 }}>
          <Text
            style={[
              font.display,
              {
                color: hasMedia || isVideo ? '#fff' : colors.text,
                fontSize: featured ? 20 : 15,
                lineHeight: featured ? 26 : 20,
              },
            ]}
            numberOfLines={hasMedia || isVideo ? 2 : featured ? 4 : 5}
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
  // One height for every tile. Heights used to alternate on `idx % 3`, which in
  // a flex-wrap leaves uneven gaps under the shorter tiles and stops the grid
  // reading as rows at all. 3:4 is the portrait ratio modern media grids use,
  // and it crops portrait photography far less than a square.
  //
  // This was already computed and then ignored: the render kept passing pixel
  // literals, so the comment above described behaviour the grid did not have.
  const tileHeight = Math.round(tileWidth * (4 / 3));

  if (echoes.length === 0) {
    return (
      <View style={{ paddingVertical: 60 }}>
        <EmptyState
          icon={<Images color={colors.accent} size={32} />}
          title={ttx("No posts yet")}
          subtitle={ttx("Your echoes will appear here once you publish them.")}
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
          height={featured.mediaUris?.[0] || featured.videoUri ? 300 : 180}
          featured
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
        {rest.map(item => (
          <MosaicTile
            key={item.id}
            item={item}
            onPress={() => onPressEcho(item)}
            tint={item.avatarColor || avatarColor}
            width={tileWidth}
            height={tileHeight}
          />
        ))}
      </View>
    </View>
  );
}
