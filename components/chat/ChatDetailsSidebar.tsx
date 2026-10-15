import React from 'react';
import { ttx } from '../../lib/i18n/i18n';
import { ICON_SIZE } from '../../lib/ui/icons';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Bell, BellSlash, Image as ImageIcon, WarningCircle } from 'phosphor-react-native';
import { Avatar } from '../ui/Avatar';

interface Recipient {
  name: string;
  /** A person's @handle, without the @. Absent for groups. */
  handle?: string;
  /** What to show instead of a handle, for groups: "5 members". */
  subtitle?: string;
  avatarUrl?: string;
  avatarColor?: string;
}

interface Props {
  recipient: Recipient;
  muted?: boolean;
  /** Mute lives on the full Details screen, where the duration is chosen. */
  onMute: () => void;
  onSharedMedia: () => void;
  onBlockOrReport: () => void;
  colors: any;
}

/**
 * The right-hand pane of the three-column messages layout: who this conversation is with, and
 * the three things people reach for first. Each button opens the same screen the phone layout
 * uses; nothing here is a second implementation.
 */
export function ChatDetailsSidebar({ recipient, muted, onMute, onSharedMedia, onBlockOrReport, colors }: Props) {
  const MuteIcon = muted ? BellSlash : Bell;
  const secondary = recipient.handle ? `@${recipient.handle}` : recipient.subtitle;
  return (
    <View style={[styles.container, { backgroundColor: colors.bg, borderLeftColor: colors.border }]}>
      <View style={[styles.profileSection, { borderBottomColor: colors.border }]}>
        <View style={styles.avatarContainer}>
          <Avatar name={recipient.name} color={recipient.avatarColor} url={recipient.avatarUrl} size={96} />
        </View>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>{recipient.name}</Text>
        {secondary ? <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>{secondary}</Text> : null}
      </View>

      <View style={[styles.actionsSection, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={onMute}
          accessibilityRole="button"
          style={[styles.actionButton, { backgroundColor: colors.bgSecondary }]}
        >
          <MuteIcon size={ICON_SIZE.md} color={colors.textMuted} />
          <Text style={[styles.actionText, { color: colors.text }]}>
            {muted ? ttx('Notifications muted') : ttx('Mute Notifications')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onSharedMedia}
          accessibilityRole="button"
          style={[styles.actionButton, { backgroundColor: colors.bgSecondary }]}
        >
          <ImageIcon size={ICON_SIZE.md} color={colors.textMuted} />
          <Text style={[styles.actionText, { color: colors.text }]}>{ttx('Shared Media')}</Text>
        </Pressable>
      </View>

      <View style={styles.footerSection}>
        <Pressable
          onPress={onBlockOrReport}
          accessibilityRole="button"
          style={[styles.dangerButton, { backgroundColor: colors.danger + '1A' }]}
        >
          <WarningCircle size={ICON_SIZE.md} color={colors.danger} />
          <Text style={[styles.dangerText, { color: colors.danger }]}>{ttx('Block or Report')}</Text>
        </Pressable>
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
    marginBottom: 16,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
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
    fontSize: 14,
    fontWeight: '600',
  },
});
