import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Modal, StyleSheet } from 'react-native';
import { ResponsiveScreen } from '../../components/ui/ResponsiveScreen';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft, BellSlash, Bell, Images, UserCircle, Prohibit, Flag, EnvelopeSimple, Users, Check, X,
} from 'phosphor-react-native';
import { Avatar } from '../../components/ui/Avatar';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';
import { persistSet } from '../../store/persist';
import { useAppStore } from '../../store/useAppStore';
import { useRemoteConversation } from '../../hooks/queries/useDMs';
import {
  fetchConversationPrefs, setDMPref, setRemoteBlock,
  type ConversationPrefs,
} from '../../lib/supabaseEchoApi';
import { ttx } from '../../lib/i18n';

// Reuse the thread's wallpaper palette so a theme choice shows instantly there.
const THEMES: { id: string; tint: string | null; label: string }[] = [
  { id: 'default', tint: null, label: 'Default' },
  { id: 'terracotta', tint: '#C65F3F', label: 'Terracotta' },
  { id: 'ochre', tint: '#B08536', label: 'Ochre' },
  { id: 'sage', tint: '#4E8B7A', label: 'Sage' },
  { id: 'dusk', tint: '#5E748B', label: 'Dusk' },
  { id: 'plum', tint: '#8B5E7D', label: 'Plum' },
  { id: 'rose', tint: '#B35D6B', label: 'Rose' },
];

const QUICK_REACTIONS = ['❤️', '😂', '👍', '🔥', '😮', '😢', '🙏'];

const MUTE_OPTIONS: { label: string; ms: number | null }[] = [
  { label: 'For 15 minutes', ms: 15 * 60_000 },
  { label: 'For 1 hour', ms: 60 * 60_000 },
  { label: 'For 8 hours', ms: 8 * 60 * 60_000 },
  { label: 'For 24 hours', ms: 24 * 60 * 60_000 },
  { label: 'Until I turn it back on', ms: null },
];

const EMPTY_PREFS: ConversationPrefs = {
  muted: false, archived: false, mutedUntil: null, nicknames: {},
  theme: null, quickReaction: null, markedUnread: false, disappearingSeconds: 0,
};

export default function ChatDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, radius } = useTheme();
  const toggleBlock = useAppStore(s => s.toggleBlock);
  const isBlocked = useAppStore(s => s.isBlocked);

  const { data: conv } = useRemoteConversation(id);
  const [prefs, setPrefs] = useState<ConversationPrefs>(EMPTY_PREFS);
  const [nickname, setNickname] = useState('');
  const [muteOpen, setMuteOpen] = useState(false);

  const otherId = conv?.otherUserId ?? null;
  const isGroup = !!conv?.isGroup;
  const name = isGroup ? (conv?.otherDisplayName ?? 'Group') : (conv?.otherDisplayName ?? conv?.otherUsername ?? 'Chat');
  const blocked = otherId ? isBlocked(otherId) : false;
  const mutedNow = prefs.muted || (!!prefs.mutedUntil && new Date(prefs.mutedUntil).getTime() > Date.now());

  useEffect(() => {
    if (!id) return;
    fetchConversationPrefs(id).then(p => {
      setPrefs(p);
      if (otherId) setNickname(p.nicknames[otherId] ?? '');
    }).catch(() => {});
  }, [id, otherId]);

  const patch = useCallback(async (p: Parameters<typeof setDMPref>[1], optimistic: Partial<ConversationPrefs>) => {
    if (!id) return;
    setPrefs(prev => ({ ...prev, ...optimistic }));
    try { await setDMPref(id, p); } catch { showToast('Could not save', 'Error'); }
  }, [id]);

  const chooseMute = (ms: number | null) => {
    setMuteOpen(false);
    if (ms == null) void patch({ muted: true, muted_until: null }, { muted: true, mutedUntil: null });
    else {
      const until = new Date(Date.now() + ms).toISOString();
      void patch({ muted: false, muted_until: until }, { muted: false, mutedUntil: until });
    }
    showToast('Muted', 'Chat');
  };
  const unmute = () => void patch({ muted: false, muted_until: null }, { muted: false, mutedUntil: null });

  const saveNickname = () => {
    if (!otherId) return;
    const next = { ...prefs.nicknames };
    const clean = nickname.trim();
    if (clean) next[otherId] = clean; else delete next[otherId];
    void patch({ nicknames: next }, { nicknames: next });
  };

  const chooseTheme = (themeId: string) => {
    void patch({ theme: themeId }, { theme: themeId });
    if (id) persistSet('chat:wallpaper:' + id, themeId); // mirror so the thread updates now
  };

  const chooseReaction = (emoji: string) => {
    const next = prefs.quickReaction === emoji ? null : emoji;
    void patch({ quick_reaction: next }, { quickReaction: next });
  };

  const markUnread = () => {
    void patch({ marked_unread: true }, { markedUnread: true });
    showToast('Marked as unread', 'Chat');
    router.back();
  };

  const doBlock = async () => {
    if (!otherId) return;
    const willBlock = !blocked;
    toggleBlock(otherId);
    try { await setRemoteBlock(otherId, willBlock); } catch { /* best effort */ }
    showToast(willBlock ? 'Blocked' : 'Unblocked', 'Chat');
  };

  return (
    <ResponsiveScreen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={ttx("Back")} style={{ padding: 4, marginRight: 8 }}>
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'Fraunces_600SemiBold' }}>{ttx("Details")}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Identity */}
        <View style={{ alignItems: 'center', paddingVertical: 22, gap: 10 }}>
          <Avatar name={name} color={conv?.otherAvatarColor} url={isGroup ? undefined : conv?.otherAvatarUrl ?? undefined} size={84}>
            {isGroup ? <Users color="#fff" size={32} weight="fill" /> : undefined}
          </Avatar>
          <Text style={{ color: colors.text, fontSize: 22, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.3 }}>{name}</Text>
          {!isGroup && conv?.otherUsername ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>@{conv.otherUsername}</Text>
          ) : isGroup ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{conv?.memberCount ?? 0} {ttx("members")}</Text>
          ) : null}
        </View>

        {/* Customization */}
        <SectionLabel colors={colors}>{ttx("Customization")}</SectionLabel>
        {!isGroup && (
          <View style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 14 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>{ttx("Nickname")}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={nickname}
                onChangeText={setNickname}
                onBlur={saveNickname}
                onSubmitEditing={saveNickname}
                placeholder={`Set a nickname for ${name}`}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={ttx("Nickname")}
                style={{ flex: 1, color: colors.text, fontSize: 15 }}
                returnKeyType="done"
              />
              <Pressable onPress={saveNickname} hitSlop={8} accessibilityRole="button" accessibilityLabel={ttx("Save nickname")}>
                <Check color={colors.accent} size={20} weight="bold" />
              </Pressable>
            </View>
          </View>
        )}

        <RowLabel colors={colors}>{ttx("Theme")}</RowLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 12 }}>
          {THEMES.map(t => {
            const active = (prefs.theme ?? 'default') === t.id;
            return (
              <Pressable key={t.id} onPress={() => chooseTheme(t.id)} accessibilityRole="button" accessibilityLabel={`Theme ${t.label}`} style={{ alignItems: 'center', gap: 5 }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.tint ?? colors.surfaceHover, borderWidth: active ? 2 : StyleSheet.hairlineWidth, borderColor: active ? colors.accent : colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  {active && <Check color={t.tint ? '#fff' : colors.accent} size={18} weight="bold" />}
                </View>
                <Text style={{ color: active ? colors.text : colors.textMuted, fontSize: 10.5, fontWeight: '700' }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <RowLabel colors={colors}>{ttx("Quick reaction")}</RowLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 14 }}>
          {QUICK_REACTIONS.map(e => {
            const active = prefs.quickReaction === e || (!prefs.quickReaction && e === '❤️');
            return (
              <Pressable key={e} onPress={() => chooseReaction(e)} accessibilityRole="button" accessibilityLabel={`Quick reaction ${e}`} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.accentMuted : colors.surfaceHover, borderWidth: active ? 1 : StyleSheet.hairlineWidth, borderColor: active ? colors.accent : colors.border }}>
                <Text style={{ fontSize: 20 }}>{e}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Notifications */}
        <SectionLabel colors={colors}>{ttx("Notifications")}</SectionLabel>
        <Row colors={colors} radius={radius} icon={mutedNow ? <BellSlash color={colors.accent} size={20} weight="fill" /> : <Bell color={colors.text} size={20} />}
          label={mutedNow ? 'Muted' : 'Mute notifications'}
          sub={mutedNow ? (prefs.mutedUntil ? `Until ${new Date(prefs.mutedUntil).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Until you turn it back on') : 'Silence this conversation'}
          onPress={() => (mutedNow ? unmute() : setMuteOpen(true))} />

        {/* Media */}
        <SectionLabel colors={colors}>{ttx("Media & links")}</SectionLabel>
        <Row colors={colors} radius={radius} icon={<Images color={colors.text} size={20} />} label={ttx("Shared media")} sub="Photos and links in this chat" onPress={() => router.push(`/chat-media/${id}`)} />

        {/* Privacy & safety */}
        <SectionLabel colors={colors}>{ttx("Privacy & safety")}</SectionLabel>
        <Row colors={colors} radius={radius} icon={<EnvelopeSimple color={colors.text} size={20} />} label={ttx("Mark as unread")} onPress={markUnread} />
        {isGroup ? (
          <Row colors={colors} radius={radius} icon={<Users color={colors.text} size={20} />} label={ttx("Members & group settings")} onPress={() => router.push(`/group/${id}`)} />
        ) : otherId ? (
          <Row colors={colors} radius={radius} icon={<UserCircle color={colors.text} size={20} />} label={ttx("View profile")} onPress={() => router.push(`/user/${otherId}`)} />
        ) : null}
        {!isGroup && otherId && (
          <Row colors={colors} radius={radius} danger icon={<Prohibit color={colors.danger} size={20} />} label={blocked ? 'Unblock' : 'Block'} onPress={doBlock} />
        )}
        <Row colors={colors} radius={radius} danger icon={<Flag color={colors.danger} size={20} />} label={ttx("Report")} onPress={() => router.push({ pathname: '/report', params: { targetType: isGroup ? 'group' : 'user', targetId: otherId ?? id, targetName: name } })} />
      </ScrollView>

      {/* Mute duration picker */}
      <Modal visible={muteOpen} transparent animationType="fade" onRequestClose={() => setMuteOpen(false)}>
        <Pressable onPress={() => setMuteOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 34 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'Fraunces_600SemiBold' }}>{ttx("Mute for…")}</Text>
              <Pressable onPress={() => setMuteOpen(false)} hitSlop={8}><X color={colors.textMuted} size={20} /></Pressable>
            </View>
            {MUTE_OPTIONS.map(o => (
              <Pressable key={o.label} onPress={() => chooseMute(o.ms)} accessibilityRole="button" style={{ paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{o.label}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </ResponsiveScreen>
  );
}

function SectionLabel({ children, colors }: { children: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return <Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginHorizontal: 16, marginTop: 16, marginBottom: 8 }}>{children}</Text>;
}
function RowLabel({ children, colors }: { children: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', marginHorizontal: 16, marginBottom: 8 }}>{children}</Text>;
}

function Row({ colors, radius, icon, label, sub, onPress, danger }: {
  colors: ReturnType<typeof useTheme>['colors'];
  radius: ReturnType<typeof useTheme>['radius'];
  icon: React.ReactNode; label: string; sub?: string; onPress: () => void; danger?: boolean;
}) {
  // Box/layout styles live on an inner View — NativeWind's cssInterop drops
  // layout props off a Pressable's own style (worst on touchables), so a bare
  // Pressable + styled inner View is the reliable pattern.
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {icon}
        <View style={{ flex: 1 }}>
          <Text style={{ color: danger ? colors.danger : colors.text, fontSize: 15, fontWeight: '700' }}>{label}</Text>
          {sub ? <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{sub}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}
