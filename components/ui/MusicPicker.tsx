import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Modal, Pressable, FlatList, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { X, MagnifyingGlass, MusicNote } from 'phosphor-react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { searchSpotify, SpotifyTrack } from '../../lib/spotify';
import { Image } from 'expo-image';

export interface Song {
  title: string;
  artist: string;
  url: string;
}

interface MusicPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (song: Song) => void;
}

export function MusicPickerModal({ visible, onClose, onSelect }: MusicPickerProps) {
  const { colors, fontSizes, radius } = useTheme();
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Default query when opening
  useEffect(() => {
    if (visible) {
      setQuery('Top Hits');
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const timeoutId = setTimeout(async () => {
      if (!query.trim()) {
        setTracks([]);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const results = await searchSpotify(query);
        setTracks(results);
      } catch (err: any) {
        setError(err.message || 'Failed to search Spotify');
      } finally {
        setLoading(false);
      }
    }, 500); // 500ms debounce
    return () => clearTimeout(timeoutId);
  }, [query, visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
        <View style={[styles.content, { backgroundColor: colors.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18 }]}>
          <View style={styles.header}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.title }}>Add Music (Spotify)</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X color={colors.textMuted} size={20} />
            </Pressable>
          </View>

          <View style={[styles.searchContainer, { backgroundColor: colors.surfaceHover, borderColor: colors.border }]}>
            <MagnifyingGlass color={colors.textMuted} size={20} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search songs or artists..."
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.text, fontSize: fontSizes.body }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          
          {loading ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : error ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text>
            </View>
          ) : (
            <FlatList
              data={tracks}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.songItem,
                    { backgroundColor: pressed ? colors.surfaceHover : 'transparent', borderBottomColor: colors.border }
                  ]}
                  onPress={() => onSelect({ title: item.title, artist: item.artist, url: item.url! })}
                >
                  <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
                    {item.coverArt ? (
                      <Image source={{ uri: item.coverArt }} style={{ width: '100%', height: '100%', borderRadius: 8 }} />
                    ) : (
                      <MusicNote color={colors.accent} size={20} weight="fill" />
                    )}
                  </View>
                  <View style={styles.songTextContainer}>
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.body }} numberOfLines={1}>{item.title}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }} numberOfLines={1}>{item.artist}</Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  songItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  songTextContainer: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    height: 44,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    height: '100%',
  }
});
