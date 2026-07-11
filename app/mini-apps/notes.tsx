import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable,
  KeyboardAvoidingView, Platform, Alert, Modal, StyleSheet, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { NotePencil, Plus, Trash, MagnifyingGlass, X, PushPin, ShareNetwork } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { showToast } from '../../components/ui/Toast';
import { NOTE_COLORS, Note, loadNotes, saveNotes } from '../../lib/notes';

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function NoteEditor({ note, onSave, onClose }: { note: Note | null; onSave: (n: Note) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isNew = !note;
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [color, setColor] = useState(note?.color ?? NOTE_COLORS[0]);

  const save = () => {
    if (!title.trim() && !body.trim()) { onClose(); return; }
    onSave({ id: note?.id ?? Date.now().toString(), title: title.trim() || 'Untitled', body: body.trim(), color, pinned: note?.pinned, updatedAt: new Date().toISOString() });
  };

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { save(); onClose(); }}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
            <AnimatedPressable onPress={() => { save(); onClose(); }} scaleValue={0.9} haptic="light">
              <Text style={{ color: color, fontSize: 15, fontWeight: '700' }}>Done</Text>
            </AnimatedPressable>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
              {NOTE_COLORS.map(c => (
                <Pressable key={c} onPress={() => setColor(c)}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: '#fff', transform: [{ scale: color === c ? 1.15 : 1 }] }} />
                </Pressable>
              ))}
            </View>
            {!isNew && (
              <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light">
                <X color={colors.textMuted} size={20} />
              </AnimatedPressable>
            )}
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: color, marginBottom: 16 }} />
            <TextInput value={title} onChangeText={setTitle} placeholder="Note title…" placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 16, padding: 0 }} multiline />
            <TextInput value={body} onChangeText={setBody} placeholder="Start writing…" placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 16, lineHeight: 26, padding: 0, minHeight: 300 }} multiline textAlignVertical="top" autoFocus={isNew} />
            {words > 0 && (
              <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'right', marginTop: 8 }}>
                {words} word{words === 1 ? '' : 's'} · {body.length} characters
              </Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function NotesApp() {
  const { colors } = useTheme();
  const router = useRouter();
  const accent = colors.accent;
  const [notes, setNotes] = useState<Note[]>([]);
  const publishAsEcho = (n: Note) => {
    router.push({ pathname: '/create-post', params: { prefillTitle: n.title, prefillBody: n.body } });
  };
  useEffect(() => { loadNotes().then(setNotes); }, []);
  useFocusEffect(
    React.useCallback(() => {
      loadNotes().then(setNotes);
    }, []),
  );
  const [editing, setEditing] = useState<Note | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.body.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => { setEditing(null); setShowEditor(true); };
  const openNote = (n: Note) => { setEditing(n); setShowEditor(true); };

  const saveNote = (n: Note) => {
    const existing = notes.find(x => x.id === n.id);
    let updated: Note[] = existing ? notes.map(x => x.id === n.id ? n : x) : [n, ...notes];
    updated.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setNotes(updated); saveNotes(updated);
    showToast(existing ? 'Note updated' : 'Note saved', 'Saved');
  };

  const deleteNote = (id: string) => {
    Alert.alert('Delete note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { const updated = notes.filter(n => n.id !== id); setNotes(updated); saveNotes(updated); } },
    ]);
  };

  const togglePin = (id: string) => {
    const updated = notes
      .map(n => n.id === id ? { ...n, pinned: !n.pinned } : n)
      .sort((a, b) =>
        Number(!!b.pinned) - Number(!!a.pinned) ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setNotes(updated); saveNotes(updated);
  };

  const shareNote = (n: Note) => {
    Share.share({ message: n.body ? `${n.title}\n\n${n.body}` : n.title }).catch(() => {});
  };

  const NewBtn = (
    <AnimatedPressable onPress={openNew} scaleValue={0.88} haptic="medium" style={{ backgroundColor: accent, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Plus color="#fff" size={16} weight="bold" />
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>New</Text>
    </AnimatedPressable>
  );

  return (
    <MiniAppShell title="Notes" subtitle={notes.length > 0 ? `${notes.length} note${notes.length !== 1 ? 's' : ''}` : 'Quick ideas'} headerRight={NewBtn}>
      {/* Search */}
      <GlassPanel variant="medium" borderRadius={14} contentStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 }} style={{ marginBottom: 16 }}>
        <MagnifyingGlass color={colors.textMuted} size={18} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search notes…"
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.text, fontSize: 15, padding: 0 }}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}><X color={colors.textMuted} size={16} /></Pressable>
        )}
      </GlassPanel>

      {/* Notes */}
      {filtered.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
          <NotePencil color={colors.glassBorder} size={48} weight="thin" />
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>
            {search ? 'No notes match your search' : 'Tap + New to write your first note'}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {filtered.map((note, i) => (
            <Animated.View key={note.id} entering={FadeInDown.delay(i * 40).duration(220)}>
              <Pressable
                onPress={() => openNote(note)}
                style={({ pressed }) => ({
                  borderRadius: 20, overflow: 'hidden',
                  transform: [{ scale: pressed ? 0.975 : 1 }],
                })}
              >
                <GlassPanel variant="medium" borderRadius={20} style={{ borderColor: note.color + '44' }} contentStyle={{ padding: 18 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <View style={{ width: 32, height: 3.5, borderRadius: 2, backgroundColor: note.color, flex: 0 }} />
                    <View style={{ flex: 1 }} />
                    {note.pinned && <PushPin color={note.color} size={14} weight="fill" />}
                  </View>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 6 }} numberOfLines={1}>{note.title}</Text>
                  {note.body.length > 0 && (
                    <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 10 }} numberOfLines={3}>{note.body}</Text>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>{formatDate(note.updatedAt)}</Text>
                    <AnimatedPressable onPress={() => togglePin(note.id)} scaleValue={0.85} haptic="light" style={{ padding: 4, marginRight: 2 }}>
                      <PushPin color={note.pinned ? note.color : colors.textMuted} size={16} weight={note.pinned ? 'fill' : 'regular'} />
                    </AnimatedPressable>
                    <AnimatedPressable onPress={() => shareNote(note)} scaleValue={0.85} haptic="light" style={{ padding: 4, marginRight: 2 }}>
                      <ShareNetwork color={colors.textMuted} size={16} />
                    </AnimatedPressable>
                    <AnimatedPressable onPress={() => publishAsEcho(note)} scaleValue={0.85} haptic="light" style={{ padding: 4, marginRight: 4 }}>
                      <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>Echo</Text>
                    </AnimatedPressable>
                    <AnimatedPressable onPress={() => deleteNote(note.id)} scaleValue={0.85} haptic="light" style={{ padding: 4 }}>
                      <Trash color={colors.textMuted} size={16} />
                    </AnimatedPressable>
                  </View>
                </GlassPanel>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      )}

      {showEditor && (
        <NoteEditor note={editing} onSave={saveNote} onClose={() => setShowEditor(false)} />
      )}
    </MiniAppShell>
  );
}
