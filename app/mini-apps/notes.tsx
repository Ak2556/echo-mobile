import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable,
  KeyboardAvoidingView, Platform, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeIn, ZoomIn } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, NotePencil, Plus, Trash, MagnifyingGlass, X, PencilSimple,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';

const NOTES_KEY = 'mini:notes';

interface Note {
  id: string;
  title: string;
  body: string;
  color: string;
  updatedAt: string;
}

const NOTE_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899'];

async function loadNotes(): Promise<Note[]> {
  try { return JSON.parse((await AsyncStorage.getItem(NOTES_KEY)) ?? '[]'); } catch { return []; }
}
function saveNotes(notes: Note[]) { AsyncStorage.setItem(NOTES_KEY, JSON.stringify(notes)); }

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

function NoteEditor({
  note, onSave, onClose,
}: { note: Note | null; onSave: (n: Note) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const isNew = !note;
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [color, setColor] = useState(note?.color ?? NOTE_COLORS[0]);

  const save = () => {
    if (!title.trim() && !body.trim()) { onClose(); return; }
    onSave({
      id: note?.id ?? Date.now().toString(),
      title: title.trim() || 'Untitled',
      body: body.trim(),
      color,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { save(); onClose(); }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Toolbar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <AnimatedPressable onPress={() => { save(); onClose(); }} scaleValue={0.9} haptic="light">
              <Text style={{ color: color, fontSize: 15, fontWeight: '700' }}>Done</Text>
            </AnimatedPressable>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
              {NOTE_COLORS.map(c => (
                <Pressable key={c} onPress={() => setColor(c)}>
                  <View style={{
                    width: 22, height: 22, borderRadius: 11,
                    backgroundColor: c,
                    borderWidth: color === c ? 3 : 0,
                    borderColor: '#fff',
                    transform: [{ scale: color === c ? 1.15 : 1 }],
                  }} />
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
            {/* Color accent line */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: color, marginBottom: 16 }} />

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Note title…"
              placeholderTextColor={colors.textMuted}
              style={{ color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 16, padding: 0 }}
              multiline
            />
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Start writing…"
              placeholderTextColor={colors.textMuted}
              style={{ color: colors.text, fontSize: 16, lineHeight: 26, padding: 0, minHeight: 300 }}
              multiline
              textAlignVertical="top"
              autoFocus={isNew}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export default function NotesApp() {
  const { colors } = useTheme();
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  useEffect(() => { loadNotes().then(setNotes); }, []);
  const [editing, setEditing] = useState<Note | null | 'new'>('new' as any);
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
    let updated: Note[];
    if (existing) {
      updated = notes.map(x => x.id === n.id ? n : x);
    } else {
      updated = [n, ...notes];
    }
    updated.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setNotes(updated);
    saveNotes(updated);
    showToast(existing ? 'Note updated' : 'Note saved', '📝');
  };

  const deleteNote = (id: string) => {
    Alert.alert('Delete note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          const updated = notes.filter(n => n.id !== id);
          setNotes(updated);
          saveNotes(updated);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
        <AnimatedPressable onPress={() => router.back()} scaleValue={0.88} haptic="light" style={{ marginRight: 12 }}>
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', flex: 1 }}>Notes</Text>
        <AnimatedPressable onPress={openNew} scaleValue={0.88} haptic="medium" style={{
          backgroundColor: '#6366F1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
          flexDirection: 'row', alignItems: 'center', gap: 6,
        }}>
          <Plus color="#fff" size={16} weight="bold" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>New</Text>
        </AnimatedPressable>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, gap: 10 }}>
          <MagnifyingGlass color={colors.textMuted} size={18} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search notes…"
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, color: colors.text, fontSize: 15, padding: 0 }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <X color={colors.textMuted} size={16} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Notes grid */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 12 }} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
            <NotePencil color={colors.border} size={48} weight="thin" />
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>
              {search ? 'No notes match your search' : 'Tap + New to write your first note'}
            </Text>
          </View>
        )}
        {filtered.map((note, i) => (
          <Animated.View key={note.id} entering={FadeInDown.delay(i * 40).springify()}>
            <Pressable
              onPress={() => openNote(note)}
              style={({ pressed }) => ({
                backgroundColor: colors.surface,
                borderRadius: 20, padding: 18,
                borderWidth: 1.5, borderColor: pressed ? note.color + '55' : colors.border,
                transform: [{ scale: pressed ? 0.975 : 1 }],
              })}
            >
              {/* Color bar */}
              <View style={{ width: 32, height: 3.5, borderRadius: 2, backgroundColor: note.color, marginBottom: 12 }} />

              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 6 }} numberOfLines={1}>
                {note.title}
              </Text>
              {note.body.length > 0 && (
                <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 10 }} numberOfLines={3}>
                  {note.body}
                </Text>
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>{formatDate(note.updatedAt)}</Text>
                <AnimatedPressable onPress={() => deleteNote(note.id)} scaleValue={0.85} haptic="light" style={{ padding: 4 }}>
                  <Trash color={colors.textMuted} size={16} />
                </AnimatedPressable>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: note.color, marginLeft: 10 }} />
              </View>
            </Pressable>
          </Animated.View>
        ))}
      </ScrollView>

      {/* Count */}
      {notes.length > 0 && (
        <View style={{ alignItems: 'center', paddingBottom: 12 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{notes.length} note{notes.length !== 1 ? 's' : ''}</Text>
        </View>
      )}

      {showEditor && (
        <NoteEditor
          note={editing as Note | null}
          onSave={saveNote}
          onClose={() => setShowEditor(false)}
        />
      )}
    </SafeAreaView>
  );
}
