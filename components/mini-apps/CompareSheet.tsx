import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Switch, Text, View } from 'react-native';
import { X, Trophy } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { Avatar } from '../ui/Avatar';
import {
  fetchLeaderboard,
  getSharePrefs,
  setSharePref,
  type Leaderboard,
  type SocialApp,
} from '../../lib/miniAppSocial';

/**
 * Compare a structured mini-app (habits / fitness) with people you follow.
 * Aggregate-only, opt-in, follow-gated — the server RPC enforces all of that;
 * this just renders the ranked list and the caller's own share toggle.
 */
export function CompareSheet({
  app,
  appName,
  accent,
  visible,
  onClose,
}: {
  app: SocialApp;
  appName: string;
  accent: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { colors, font } = useTheme();
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    Promise.all([fetchLeaderboard(app), getSharePrefs()])
      .then(([b, prefs]) => {
        setBoard(b);
        setSharing(app === 'habits' ? prefs.habits : prefs.fitness);
      })
      .finally(() => setLoading(false));
  }, [visible, app]);

  const toggleShare = (on: boolean) => {
    setSharing(on); // optimistic
    void setSharePref(app, on);
  };

  const others = board?.rows.filter(r => !r.isSelf) ?? [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          style={{ backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 40, maxHeight: '82%' }}
          onPress={() => {}}
        >
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 18 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 16 }}>
            <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: `${accent}22`, alignItems: 'center', justifyContent: 'center' }}>
              <Trophy color={accent} size={18} weight="fill" />
            </View>
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 16, flex: 1 }]}>Compare {appName.toLowerCase()}</Text>
            <Pressable onPress={onClose} hitSlop={10}><X color={colors.textMuted} size={20} weight="bold" /></Pressable>
          </View>

          {/* Opt-in — nothing of yours is visible to others until this is on. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.glassBorder, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={[font.bodySemibold, { color: colors.text, fontSize: 14 }]}>Let your followers see this</Text>
              <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]}>Only your streak numbers — never your notes or entries.</Text>
            </View>
            <Switch value={sharing} onValueChange={toggleShare} trackColor={{ true: accent, false: colors.border }} />
          </View>

          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={accent} /></View>
          ) : others.length === 0 ? (
            <View style={{ paddingVertical: 28, alignItems: 'center', gap: 6 }}>
              <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>No one to compare yet</Text>
              <Text style={[font.body, { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 }]}>
                Follow people who share their {appName.toLowerCase()} and they&apos;ll appear here, ranked with you.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {board!.rows.map((r, i) => (
                <View
                  key={r.userId}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    padding: 12, borderRadius: 14,
                    backgroundColor: r.isSelf ? `${accent}14` : colors.surface,
                    borderWidth: 1, borderColor: r.isSelf ? `${accent}44` : colors.glassBorder,
                  }}
                >
                  <Text style={[font.bodyBold, { color: colors.textMuted, fontSize: 13, width: 20 }]}>{i + 1}</Text>
                  <Avatar name={r.displayName || r.username} color={r.avatarColor} url={r.avatarUrl ?? undefined} size={34} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[font.bodySemibold, { color: colors.text, fontSize: 14 }]} numberOfLines={1}>
                      {r.isSelf ? 'You' : (r.displayName || `@${r.username}`)}
                    </Text>
                    <Text style={[font.body, { color: colors.textMuted, fontSize: 11.5 }]} numberOfLines={1}>{r.sub} {board!.subLabel}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[font.display, { color: accent, fontSize: 20, lineHeight: 24 }]}>{r.value}</Text>
                    <Text style={[font.body, { color: colors.textMuted, fontSize: 10.5 }]}>{board!.valueLabel}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
