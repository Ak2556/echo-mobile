import React from 'react';
import { View, Text, Modal, Pressable, FlatList, StyleSheet } from 'react-native';
import { X, MusicNote } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

export interface Song {
  title: string;
  artist: string;
  url: string;
}

const MOCKED_SONGS: Song[] = [
  { title: 'Espresso', artist: 'Sabrina Carpenter', url: 'https://example.com/audio1.mp3' },
  { title: 'Birds of a Feather', artist: 'Billie Eilish', url: 'https://example.com/audio2.mp3' },
  { title: 'Not Like Us', artist: 'Kendrick Lamar', url: 'https://example.com/audio3.mp3' },
  { title: 'Too Sweet', artist: 'Hozier', url: 'https://example.com/audio4.mp3' },
  { title: 'Good Luck, Babe!', artist: 'Chappell Roan', url: 'https://example.com/audio5.mp3' },
];

interface MusicPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (song: Song) => void;
}

export function MusicPickerModal({ visible, onClose, onSelect }: MusicPickerProps) {
  const { colors, fontSizes, radius } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
        <View style={[styles.content, { backgroundColor: colors.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18 }]}>
          <View style={styles.header}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.title }}>Add Music</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X color={colors.textMuted} size={20} />
            </Pressable>
          </View>
          
          <FlatList
            data={MOCKED_SONGS}
            keyExtractor={(item) => item.title}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.songItem,
                  { backgroundColor: pressed ? colors.surfaceHover : 'transparent', borderBottomColor: colors.border }
                ]}
                onPress={() => onSelect(item)}
              >
                <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
                  <MusicNote color={colors.accent} size={20} weight="fill" />
                </View>
                <View style={styles.songTextContainer}>
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.body }}>{item.title}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{item.artist}</Text>
                </View>
              </Pressable>
            )}
          />
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
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  songTextContainer: {
    flex: 1,
  }
});
