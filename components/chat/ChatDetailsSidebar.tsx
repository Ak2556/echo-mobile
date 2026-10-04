import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Bell, Image as ImageIcon, WarningCircle } from 'phosphor-react-native';

interface Recipient {
  name: string;
  avatar: string;
  handle: string;
}

interface Props {
  recipient: Recipient;
  colors: any;
}

export function ChatDetailsSidebar({ recipient, colors }: Props) {
  return (
    <View style={[styles.container, { backgroundColor: colors.bg, borderLeftColor: colors.border }]}>
      <View style={[styles.profileSection, { borderBottomColor: colors.border }]}>
        <View style={styles.avatarContainer}>
          <Image source={recipient.avatar} style={styles.avatar} />
        </View>
        <Text style={[styles.name, { color: colors.text }]}>{recipient.name}</Text>
        <Text style={[styles.handle, { color: colors.textMuted }]}>@{recipient.handle}</Text>
      </View>

      <View style={[styles.actionsSection, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.bgSecondary }]}>
          <Bell size={20} color={colors.textMuted} />
          <Text style={[styles.actionText, { color: colors.text }]}>Mute Notifications</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.bgSecondary }]}>
          <ImageIcon size={20} color={colors.textMuted} />
          <Text style={[styles.actionText, { color: colors.text }]}>Shared Media</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footerSection}>
        <TouchableOpacity style={[styles.dangerButton, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
          <WarningCircle size={18} color="#ef4444" />
          <Text style={styles.dangerText}>Block or Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 320,
    height: '100%',
    borderLeftWidth: StyleSheet.hairlineWidth,
    flexDirection: 'column',
  },
  profileSection: {
    padding: 32,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    marginBottom: 16,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  handle: {
    fontSize: 14,
  },
  actionsSection: {
    padding: 16,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footerSection: {
    padding: 16,
    marginTop: 'auto',
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  dangerText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
