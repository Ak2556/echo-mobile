import React from 'react';
import { View, Text, Dimensions, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Images } from 'phosphor-react-native';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { GlassPanel } from '../ui/GlassPanel';
import { EmptyState } from '../common/EmptyState';
import { useTheme } from '../../lib/theme';
import { FeedItem } from '../../types';

const { width: SW } = Dimensions.get('window');
const CELL_SIZE = (SW - 4) / 3;

interface PostsGridProps {
  echoes: FeedItem[];
  onPressEcho: (item: FeedItem) => void;
  avatarColor: string;
}

function GridCell({ item, onPress }: { item: FeedItem; onPress: () => void }) {
  const hasMedia = item.mediaUris && item.mediaUris.length > 0;

  return (
    <AnimatedPressable
      onPress={onPress}
      style={{ width: CELL_SIZE, height: CELL_SIZE, overflow: 'hidden' }}
      scaleValue={0.95}
      haptic="light"
    >
      {hasMedia ? (
        <Image
          source={{ uri: item.mediaUris![0] }}
          style={{ flex: 1 }}
          contentFit="cover"
        />
      ) : (
        <LinearGradient
          colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.5)']}
          style={{ flex: 1, padding: 8, justifyContent: 'flex-end' }}
        >
          <Text style={{ color: '#fff', fontSize: 11, lineHeight: 15 }} numberOfLines={2}>
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
    <AnimatedPressable onPress={onPress} style={{ marginBottom: 2 }} scaleValue={0.98} haptic="light">
      <GlassPanel borderRadius={0} intensity={40}>
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
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              {(item.displayName || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
              {item.displayName}
            </Text>
            <Text
              style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 }}
              numberOfLines={3}
            >
              {item.response || item.prompt}
            </Text>
          </View>
        </View>
      </GlassPanel>
    </AnimatedPressable>
  );
}

export function PostsGrid({ echoes, onPressEcho, avatarColor }: PostsGridProps) {
  const { colors } = useTheme();
  const featured = echoes[0];
  const gridEchoes = echoes.slice(1);

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
    <FlatList
      data={gridEchoes}
      numColumns={3}
      keyExtractor={item => item.id}
      columnWrapperStyle={{ gap: 2 }}
      ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
      scrollEnabled={false}
      ListHeaderComponent={
        featured ? (
          <FeaturedCard item={featured} onPress={() => onPressEcho(featured)} avatarColor={avatarColor} />
        ) : null
      }
      renderItem={({ item }) => (
        <GridCell item={item} onPress={() => onPressEcho(item)} />
      )}
    />
  );
}
