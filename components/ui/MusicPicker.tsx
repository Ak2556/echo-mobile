import React, { useState, useEffect } from 'react';
import { View, Text, Modal, Pressable, FlatList, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { X, MagnifyingGlass, MusicNote, WarningCircle } from 'phosphor-react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { searchSpotify, SpotifyTrack } from '../../lib/mini-apps/spotify';
import { Image } from 'expo-image';
import { ttx } from '../../src/shared/lib/i18n';

export interface Song {
  title: string;
  artist: string;
  url: string;
  /** Album art, shown on the composer's music card. */
  coverArt?: string;
}

interface MusicPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (song: Song) => void;
}

export function MusicPickerModal({ visible, onClose, onSelect }: MusicPickerProps) {
  const { colors, fontSizes, font } = useTheme();
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
      } catch {
        // The raw message was shown before ("Edge Function returned a non-2xx
        // status code"). The cause is logged server-side; people need to know
        // it is not them and what to do.
        setError(ttx("Music search isn't working right now. Try again in a bit."));
      } finally {
        setLoading(false);
      }
    }, 500); // 500ms debounce
    return () => clearTimeout(timeoutId);
  }, [query, visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
        <View style={[styles.content, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <View>
              <Text style={[font.bodyBold, { color: colors.text, fontSize: 18 }]}>{ttx("Add music")}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 2 }}>{ttx("Search by Spotify")}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={ttx("Close")}>
              <X color={colors.textSecondary} size={20} />
            </Pressable>
          </View>

          <View style={[styles.searchContainer, { backgroundColor: colors.surfaceHover, borderColor: colors.border }]}>
            <MagnifyingGlass color={colors.textMuted} size={20} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={ttx("Search songs or artists")}
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
            <View style={{ paddingVertical: 36, paddingHorizontal: 24, alignItems: 'center', gap: 10 }}>
              <WarningCircle color={colors.textMuted} size={28} />
              <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: fontSizes.small, lineHeight: 20 }}>{error}</Text>
            </View>
          ) : query.trim() && tracks.length === 0 ? (
            <View style={{ paddingVertical: 36, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>{ttx("No songs match that search")}</Text>
            </View>
          ) : (
            <FlatList
              data={tracks}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                // A style function on Pressable loses flex props in release
                // builds, which stacked cover, title and artist vertically.
                <Pressable
                  onPress={() => onSelect({ title: item.title, artist: item.artist, url: item.url ?? '', coverArt: item.coverArt || undefined })}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, ${item.artist}`}
                >
                  {({ pressed }) => (
                  <View style={[styles.songItem, { backgroundColor: pressed ? colors.surfaceHover : 'transparent', borderBottomColor: colors.border }]}>
                  <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
                    {item.coverArt ? (
                      <Image source={{ uri: item.coverArt }} style={{ width: '100%', height: '100%', borderRadius: 8 }} />
                    ) : (
                      <MusicNote color={colors.accent} size={20} weight="fill" />
                    )}
                  </View>
                  <View style={styles.songTextContainer}>
                    <Text style={[font.bodySemibold, { color: colors.text, fontSize: fontSizes.body }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }} numberOfLines={1}>{item.artist}</Text>
                  </View>
                  </View>
                  )}
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
    paddingTop: 10,
    paddingBottom: 32,
    maxHeight: '80%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
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
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
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
