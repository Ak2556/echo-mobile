import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { MagnifyingGlass } from 'phosphor-react-native';

export interface Thread {
  id: string;
  name: string;
  preview: string;
  unread: boolean;
  avatar: string;
}

interface Props {
  threads: Thread[];
  onSelect: (id: string) => void;
  colors: any;
}

export function VirtualizedThreadList({ threads, onSelect, colors }: Props) {
  const renderItem = ({ item }: { item: Thread }) => (
    <TouchableOpacity
      style={[styles.threadItem]}
      onPress={() => onSelect(item.id)}
    >
      <View style={[styles.avatarContainer, item.unread && { borderWidth: 2, borderColor: '#ec4899' }]}>
        <Image source={item.avatar} style={styles.avatar} />
      </View>
      <View style={styles.threadContent}>
        <Text style={[styles.threadName, { color: colors.text }, item.unread && styles.threadNameUnread]}>
          {item.name}
        </Text>
        <Text style={[styles.threadPreview, { color: colors.textMuted }]} numberOfLines={1}>
          {item.preview}
        </Text>
      </View>
      {item.unread && <View style={styles.unreadBadge} />}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, borderRightColor: colors.border }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
        <View style={[styles.searchContainer, { backgroundColor: colors.bgSecondary }]}>
          <MagnifyingGlass size={16} color={colors.textMuted} />
          <TextInput
            placeholder="Search..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>
      </View>
      
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {['General', 'Favourite', 'Requests'].map(tab => (
          <TouchableOpacity key={tab} style={styles.tab}>
            <Text style={[styles.tabText, { color: colors.textMuted }]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlashList
        data={threads}
        renderItem={renderItem}
        // @ts-ignore
        estimatedItemSize={72}
        keyExtractor={item => item.id}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 320,
    height: '100%',
    borderRightWidth: StyleSheet.hairlineWidth,
    flexDirection: 'column',
  },
  header: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 20,
    height: 36,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  threadContent: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  threadName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  threadNameUnread: {
    fontWeight: 'bold',
  },
  threadPreview: {
    fontSize: 14,
  },
  unreadBadge: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3b82f6',
    marginLeft: 8,
  },
});
