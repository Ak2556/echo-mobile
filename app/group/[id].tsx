import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  Users, Sparkle, MagnifyingGlass, X, Crown, SignOut, BellSlash, UserPlus, CheckCircle,
} from 'phosphor-react-native';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useTheme } from '../../lib/theme';
import { Avatar } from '../../components/ui/Avatar';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useAppStore } from '../../store/useAppStore';
import { WARM_AVATAR_COLORS } from '../../lib/avatarPalette';
import { streamEchoAI } from '../../lib/api';
import {
  fetchConversationById, fetchGroupMembers, addGroupMembers, removeGroupMember,
  setGroupMemberRole, updateGroupMeta, leaveGroup, setDMPref,
  searchRemoteUsers, type GroupMember, type UserSearchHit, type RemoteConversation,
} from '../../lib/supabaseEchoApi';

async function suggestGroupName(memberNames: string[]): Promise<string | null> {
  let acc = '';
  try {
    await streamEchoAI({
      message: `Suggest one short, warm group chat name — 2 to 4 words, no quotes, no emoji — for a group with these people: ${memberNames.slice(0, 8).join(', ')}. Output only the name.`,
      onEvent: e => { if (e.type === 'text_delta') acc += e.delta; },
    });
  } catch {
    return null;
  }
  // Strip only a wrapping pair of quotes — never a lone trailing apostrophe,
  // which is a legit possessive ("Parents'", "Kids' Table").
  let cleaned = acc.trim().replace(/[\r\n].*$/, '').trim();
  const wrapped = cleaned.match(/^(["“”'])([\s\S]*)(["“”'])$/);
  if (wrapped) cleaned = wrapped[2].trim();
  cleaned = cleaned.slice(0, 40).trim();
  return cleaned || null;
}

export default function GroupInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, isUserOnline } = useTheme();
  const myId = useAppStore(s => s.userId);

  const [conv, setConv] = useState<RemoteConversation | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#C65F3F');
  const [muted, setMuted] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<UserSearchHit[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, m] = await Promise.all([fetchConversationById(id), fetchGroupMembers(id)]);
      setConv(c);
      setMembers(m);
      if (c) { setName(c.groupTitle ?? c.otherDisplayName); setColor(c.groupAvatarColor ?? '#C65F3F'); setMuted(c.muted); }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const me = members.find(m => m.userId === myId);
  const isAdmin = me?.role === 'admin';

  const saveName = async () => {
    if (!id || !isAdmin) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === (conv?.groupTitle ?? '')) return;
    try { await updateGroupMeta(id, trimmed, color); showToast('Group renamed', 'Saved'); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not rename', 'Error'); }
  };

  const pickColor = async (c: string) => {
    setColor(c);
    if (!id || !isAdmin) return;
    try { await updateGroupMeta(id, name.trim() || (conv?.groupTitle ?? 'Group'), c); }
    catch { /* ignore */ }
  };

  const askEcho = async () => {
    setSuggesting(true);
    try {
      const suggestion = await suggestGroupName(members.map(m => m.displayName));
      if (suggestion) { setName(suggestion); if (id && isAdmin) await updateGroupMeta(id, suggestion, color); showToast('Echo named it', 'Sparkle'); void load(); }
      else showToast('Couldn’t reach Echo — try again', 'Error');
    } finally {
      setSuggesting(false);
    }
  };

  const runSearch = (text: string) => {
    setQuery(text);
    const t = text.trim();
    if (!t) { setHits([]); return; }
    searchRemoteUsers(t, 10).then(rows => {
      const existing = new Set(members.map(m => m.userId));
      setHits(rows.filter(r => !existing.has(r.id)));
    }).catch(() => setHits([]));
  };

  const addMember = async (u: UserSearchHit) => {
    if (!id) return;
    try { await addGroupMembers(id, [u.id]); showToast(`Added ${u.display_name || u.username}`, 'Saved'); setQuery(''); setHits([]); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not add', 'Error'); }
  };

  const memberActions = (m: GroupMember) => {
    if (!isAdmin || m.userId === myId) return;
    Alert.alert(m.displayName, undefined, [
      {
        text: m.role === 'admin' ? 'Remove as admin' : 'Make admin',
        onPress: async () => {
          try { await setGroupMemberRole(id!, m.userId, m.role === 'admin' ? 'member' : 'admin'); void load(); }
          catch (e) { showToast(e instanceof Error ? e.message : 'Failed', 'Error'); }
        },
      },
      {
        text: 'Remove from group',
        style: 'destructive',
        onPress: async () => {
          try { await removeGroupMember(id!, m.userId); showToast(`Removed ${m.displayName}`, 'Removed'); void load(); }
          catch (e) { showToast(e instanceof Error ? e.message : 'Failed', 'Error'); }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const toggleMute = async (v: boolean) => {
    setMuted(v);
    if (id) { try { await setDMPref(id, { muted: v }); } catch { setMuted(!v); } }
  };

  const confirmLeave = () => {
    Alert.alert('Leave group?', 'You’ll stop receiving messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive',
        onPress: async () => {
          try { await leaveGroup(id!); router.dismissAll?.(); router.replace('/messages'); }
          catch (e) { showToast(e instanceof Error ? e.message : 'Could not leave', 'Error'); }
        },
      },
    ]);
  };

  const eyebrow = { color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase' as const };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Group info" />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></View>
      ) : !conv?.isGroup ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: colors.textMuted }}>This isn’t a group conversation.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {/* Hero */}
          <View style={{ alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Avatar name={name || 'Group'} color={color} size={80}>
              <Users color="#fff" size={34} weight="fill" />
            </Avatar>
            {isAdmin ? (
              <TextInput
                value={name}
                onChangeText={setName}
                onBlur={saveName}
                placeholder="Group name"
                placeholderTextColor={colors.textMuted}
                style={{ color: colors.text, fontSize: 24, fontFamily: 'Fraunces_600SemiBold', textAlign: 'center', letterSpacing: -0.5, minWidth: 200, paddingVertical: 2 }}
              />
            ) : (
              <Text style={{ color: colors.text, fontSize: 24, fontFamily: 'Fraunces_600SemiBold', textAlign: 'center', letterSpacing: -0.5 }}>{name}</Text>
            )}
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{members.length} member{members.length === 1 ? '' : 's'}</Text>

            {isAdmin && (
              <AnimatedPressable
                onPress={askEcho}
                disabled={suggesting}
                scaleValue={0.96} haptic="light"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent + '66', paddingHorizontal: 14, paddingVertical: 8, opacity: suggesting ? 0.6 : 1 }}
              >
                {suggesting ? <ActivityIndicator size="small" color={colors.accent} /> : <Sparkle color={colors.accent} size={15} weight="fill" />}
                <Text style={{ color: colors.accent, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Ask Echo to name it</Text>
              </AnimatedPressable>
            )}
          </View>

          {/* Color (admin) */}
          {isAdmin && (
            <View style={{ marginTop: 18 }}>
              <Text style={[eyebrow, { marginBottom: 10 }]}>Colour</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {WARM_AVATAR_COLORS.map(c => (
                  <Pressable key={c} onPress={() => pickColor(c)}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: colors.bg, transform: [{ scale: color === c ? 1.12 : 1 }] }} />
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Members */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 8 }}>
            <Text style={[eyebrow, { flex: 1 }]}>Members · {members.length}</Text>
            {isAdmin && (
              <Pressable onPress={() => setAdding(a => !a)} hitSlop={8}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <UserPlus color={colors.accent} size={15} weight="bold" />
                  <Text style={{ color: colors.accent, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Add</Text>
                </View>
              </Pressable>
            )}
          </View>

          {/* Add-members search */}
          {adding && isAdmin && (
            <View style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, backgroundColor: colors.surfaceHover, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 12 }}>
                <MagnifyingGlass color={colors.textMuted} size={16} />
                <TextInput value={query} onChangeText={runSearch} placeholder="Search people to add" placeholderTextColor={colors.textMuted} autoCapitalize="none" style={{ flex: 1, color: colors.text, fontSize: 14.5, paddingVertical: 11 }} />
                {query ? <Pressable onPress={() => runSearch('')} hitSlop={8}><X color={colors.textMuted} size={15} /></Pressable> : null}
              </View>
              {hits.map(u => (
                <Pressable key={u.id} onPress={() => addMember(u)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                    <Avatar name={u.display_name || u.username} color={u.avatar_color} url={u.avatar_url} size={38} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600' }} numberOfLines={1}>{u.display_name || u.username}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>@{u.username}</Text>
                    </View>
                    <UserPlus color={colors.accent} size={18} weight="bold" />
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {members.map(m => {
            const online = isUserOnline(m.userId);
            return (
              <Pressable key={m.userId} onPress={() => memberActions(m)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                  <Avatar name={m.displayName} color={m.avatarColor} url={m.avatarUrl} size={44} online={online} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                        {m.displayName}{m.userId === myId ? ' (You)' : ''}
                      </Text>
                      {m.role === 'admin' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.accent + '18', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Crown color={colors.accent} size={10} weight="fill" />
                          <Text style={{ color: colors.accent, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>Admin</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }} numberOfLines={1}>@{m.username}</Text>
                  </View>
                  {isAdmin && m.userId !== myId && (
                    <Text style={{ color: colors.textMuted, fontSize: 20, marginTop: -4 }}>⋯</Text>
                  )}
                </View>
              </Pressable>
            );
          })}

          {/* Settings */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, marginTop: 8, gap: 12 }}>
            <BellSlash color={colors.textSecondary} size={19} />
            <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>Mute notifications</Text>
            <Switch value={muted} onValueChange={toggleMute} />
          </View>

          <AnimatedPressable
            onPress={confirmLeave}
            scaleValue={0.98} haptic="medium"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: '#EF444455', paddingVertical: 14, marginTop: 8 }}
          >
            <SignOut color="#EF4444" size={17} weight="bold" />
            <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 15 }}>Leave group</Text>
          </AnimatedPressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
