import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable,
  KeyboardAvoidingView, Platform, Alert, Modal, StyleSheet, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Archive, CheckSquare, Clock, Copy, FileText, FolderOpen, FunnelSimple,
  MagnifyingGlass, NotePencil, Plus, PushPin, ShareNetwork, Sparkle, Star,
  Tag, TextB, Trash, X,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { showToast } from '../../components/ui/Toast';
import { NOTE_COLORS, Note, loadNotes, saveNotes } from '../../lib/notes';

type NoteView = 'active' | 'pinned' | 'favorites' | 'checklists' | 'archive' | 'all';
type SortMode = 'recent' | 'oldest' | 'title';
type NoteTemplate = {
  id: string;
  label: string;
  kind: NonNullable<Note['kind']>;
  title: string;
  body: string;
  folder: string;
  tags: string[];
  color: string;
};

const DEFAULT_FOLDERS = ['Inbox', 'Work', 'Ideas', 'Personal', 'Research'];

const TEMPLATES: NoteTemplate[] = [
  {
    id: 'blank',
    label: 'Blank',
    kind: 'note',
    title: '',
    body: '',
    folder: 'Inbox',
    tags: [],
    color: NOTE_COLORS[0],
  },
  {
    id: 'task-plan',
    label: 'Task plan',
    kind: 'checklist',
    title: 'Task plan',
    body: '- [ ] Decide the outcome\n- [ ] Break it into next actions\n- [ ] Ship the first step',
    folder: 'Work',
    tags: ['tasks'],
    color: NOTE_COLORS[2],
  },
  {
    id: 'meeting',
    label: 'Meeting',
    kind: 'meeting',
    title: 'Meeting notes',
    body: 'Agenda\n- \n\nDecisions\n- \n\nAction items\n- [ ] ',
    folder: 'Work',
    tags: ['meeting'],
    color: NOTE_COLORS[5],
  },
  {
    id: 'idea',
    label: 'Idea',
    kind: 'idea',
    title: 'New idea',
    body: 'One-line idea\n\nWhy it matters\n\nNext test\n- [ ] ',
    folder: 'Ideas',
    tags: ['idea'],
    color: NOTE_COLORS[4],
  },
  {
    id: 'journal',
    label: 'Journal',
    kind: 'journal',
    title: 'Daily reflection',
    body: 'Today felt\n\nWhat moved forward\n\nWhat I learned\n\nTomorrow\n- [ ] ',
    folder: 'Personal',
    tags: ['reflection'],
    color: NOTE_COLORS[1],
  },
  {
    id: 'research',
    label: 'Research',
    kind: 'research',
    title: 'Research note',
    body: 'Source\n\nKey points\n- \n\nQuestions\n- \n\nSummary',
    folder: 'Research',
    tags: ['research'],
    color: NOTE_COLORS[6],
  },
];

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

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function checklistStats(body: string) {
  const matches = Array.from(body.matchAll(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/gm));
  const total = matches.length;
  const done = matches.filter(match => match[1].toLowerCase() === 'x').length;
  return { total, done };
}

function normalizeTags(tags: string | string[]) {
  const source = Array.isArray(tags) ? tags.join(',') : tags;
  return Array.from(new Set(source
    .split(/[,\s]+/)
    .map(tag => tag.replace(/^#/, '').trim().toLowerCase())
    .filter(Boolean)))
    .slice(0, 8);
}

function noteKind(note: Note): NonNullable<Note['kind']> {
  if (note.kind) return note.kind;
  return checklistStats(note.body).total > 0 ? 'checklist' : 'note';
}

function folderName(note: Note) {
  return note.folder?.trim() || 'Inbox';
}

function applyTemplate(template: NoteTemplate): Note {
  const now = new Date().toISOString();
  return {
    id: `${Date.now()}`,
    title: template.title,
    body: template.body,
    color: template.color,
    folder: template.folder,
    tags: template.tags,
    kind: template.kind,
    createdAt: now,
    updatedAt: now,
  };
}

function FilterChip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: active ? colors.accent : colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? colors.accent : colors.glassBorder,
      }}
    >
      {icon}
      <Text style={{ color: active ? '#fff' : colors.textSecondary, fontSize: 13, fontWeight: '800' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={{
      flex: 1,
      minWidth: 92,
      borderRadius: 18,
      padding: 12,
      backgroundColor: colors.isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.04)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.glassBorder,
    }}>
      <Text style={{ color, fontSize: 20, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

function NoteEditor({
  note,
  onSave,
  onClose,
}: {
  note: Note | null;
  onSave: (n: Note) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isNew = !note;
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [color, setColor] = useState(note?.color ?? NOTE_COLORS[0]);
  const [folder, setFolder] = useState(note?.folder ?? 'Inbox');
  const [tags, setTags] = useState((note?.tags ?? []).join(', '));
  const [kind, setKind] = useState<NonNullable<Note['kind']>>(noteKind(note ?? applyTemplate(TEMPLATES[0])));

  const stats = checklistStats(body);
  const words = countWords(body);

  const save = () => {
    if (!title.trim() && !body.trim()) { onClose(); return; }
    const now = new Date().toISOString();
    onSave({
      id: note?.id ?? `${Date.now()}`,
      title: title.trim() || 'Untitled',
      body: body.trim(),
      color,
      pinned: note?.pinned,
      favorite: note?.favorite,
      archived: note?.archived,
      folder: folder.trim() || 'Inbox',
      tags: normalizeTags(tags),
      kind,
      createdAt: note?.createdAt ?? now,
      updatedAt: now,
    });
  };

  const append = (text: string) => {
    setBody(current => current.trim() ? `${current.trimEnd()}\n${text}` : text.trimStart());
  };

  const applyNoteTemplate = (template: NoteTemplate) => {
    setTitle(current => current.trim() ? current : template.title);
    setBody(current => current.trim() ? `${current.trimEnd()}\n\n${template.body}` : template.body);
    setFolder(template.folder);
    setTags(current => normalizeTags([current, ...template.tags]).join(', '));
    setKind(template.kind);
    setColor(template.color);
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { save(); onClose(); }}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingTop: insets.top + 8,
            paddingBottom: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.glassBorder,
          }}>
            <AnimatedPressable onPress={() => { save(); onClose(); }} scaleValue={0.9} haptic="light">
              <Text style={{ color, fontSize: 15, fontWeight: '800' }}>Done</Text>
            </AnimatedPressable>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 9, paddingHorizontal: 14 }}
            >
              {NOTE_COLORS.map(c => (
                <Pressable key={c} onPress={() => setColor(c)}>
                  <View style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: c,
                    borderWidth: color === c ? 3 : 0,
                    borderColor: '#fff',
                    transform: [{ scale: color === c ? 1.15 : 1 }],
                  }} />
                </Pressable>
              ))}
            </ScrollView>
            <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light">
              <X color={colors.textMuted} size={20} />
            </AnimatedPressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <View style={{ width: 42, height: 42, borderRadius: 16, backgroundColor: `${color}22`, alignItems: 'center', justifyContent: 'center' }}>
                {kind === 'checklist' ? <CheckSquare color={color} size={22} weight="bold" /> : <NotePencil color={color} size={22} weight="bold" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>
                  {isNew ? 'Capture note' : 'Edit note'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  {words} words · {body.length} chars{stats.total ? ` · ${stats.done}/${stats.total} done` : ''}
                </Text>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
              {TEMPLATES.filter(t => t.id !== 'blank').map(template => (
                <Pressable
                  key={template.id}
                  onPress={() => applyNoteTemplate(template)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: colors.surface,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.glassBorder,
                  }}
                >
                  <Sparkle color={template.color} size={14} weight="fill" />
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '800' }}>{template.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Note title"
              placeholderTextColor={colors.textMuted}
              style={{ color: colors.text, fontSize: 28, fontWeight: '900', marginBottom: 16, padding: 0 }}
              multiline
            />

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '800', marginBottom: 6 }}>Folder</Text>
                <TextInput
                  value={folder}
                  onChangeText={setFolder}
                  placeholder="Inbox"
                  placeholderTextColor={colors.textMuted}
                  style={{
                    color: colors.text,
                    fontSize: 14,
                    paddingHorizontal: 13,
                    paddingVertical: 11,
                    borderRadius: 14,
                    backgroundColor: colors.surface,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.glassBorder,
                  }}
                />
              </View>
              <View style={{ flex: 1.5 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '800', marginBottom: 6 }}>Tags</Text>
                <TextInput
                  value={tags}
                  onChangeText={setTags}
                  placeholder="launch, ideas"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  style={{
                    color: colors.text,
                    fontSize: 14,
                    paddingHorizontal: 13,
                    paddingVertical: 11,
                    borderRadius: 14,
                    backgroundColor: colors.surface,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.glassBorder,
                  }}
                />
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
              {[
                { id: 'note', label: 'Note', icon: <FileText color={kind === 'note' ? '#fff' : colors.textMuted} size={14} /> },
                { id: 'checklist', label: 'Checklist', icon: <CheckSquare color={kind === 'checklist' ? '#fff' : colors.textMuted} size={14} /> },
                { id: 'meeting', label: 'Meeting', icon: <Clock color={kind === 'meeting' ? '#fff' : colors.textMuted} size={14} /> },
                { id: 'idea', label: 'Idea', icon: <Sparkle color={kind === 'idea' ? '#fff' : colors.textMuted} size={14} /> },
                { id: 'journal', label: 'Journal', icon: <TextB color={kind === 'journal' ? '#fff' : colors.textMuted} size={14} /> },
                { id: 'research', label: 'Research', icon: <FolderOpen color={kind === 'research' ? '#fff' : colors.textMuted} size={14} /> },
              ].map(item => (
                <FilterChip
                  key={item.id}
                  label={item.label}
                  active={kind === item.id}
                  onPress={() => setKind(item.id as NonNullable<Note['kind']>)}
                  icon={item.icon}
                />
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <AnimatedPressable onPress={() => append('- [ ] ')} haptic="light" style={{ flex: 1 }}>
                <GlassPanel variant="light" borderRadius={14} contentStyle={{ paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '800' }}>Add checkbox</Text>
                </GlassPanel>
              </AnimatedPressable>
              <AnimatedPressable onPress={() => append('## ')} haptic="light" style={{ flex: 1 }}>
                <GlassPanel variant="light" borderRadius={14} contentStyle={{ paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '800' }}>Heading</Text>
                </GlassPanel>
              </AnimatedPressable>
              <AnimatedPressable onPress={() => append('- ')} haptic="light" style={{ flex: 1 }}>
                <GlassPanel variant="light" borderRadius={14} contentStyle={{ paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '800' }}>Bullet</Text>
                </GlassPanel>
              </AnimatedPressable>
            </View>

            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Start writing, paste research, plan tasks, or make a checklist..."
              placeholderTextColor={colors.textMuted}
              style={{
                color: colors.text,
                fontSize: 16,
                lineHeight: 26,
                padding: 16,
                minHeight: 330,
                borderRadius: 20,
                backgroundColor: colors.surface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.glassBorder,
                textAlignVertical: 'top',
              }}
              multiline
              autoFocus={isNew}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function NoteCard({
  note,
  onOpen,
  onPin,
  onFavorite,
  onArchive,
  onDuplicate,
  onShare,
  onPublish,
  onDelete,
}: {
  note: Note;
  onOpen: () => void;
  onPin: () => void;
  onFavorite: () => void;
  onArchive: () => void;
  onDuplicate: () => void;
  onShare: () => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const stats = checklistStats(note.body);
  const words = countWords(note.body);
  const progress = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const kind = noteKind(note);
  const tags = note.tags ?? [];

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => ({
        borderRadius: 22,
        overflow: 'hidden',
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <GlassPanel
        variant="medium"
        borderRadius={22}
        elevated
        tintOverride={colors.isDark ? 'rgba(20,18,14,0.86)' : 'rgba(255,255,255,0.88)'}
        style={{ borderColor: `${note.color}55` }}
        contentStyle={{ padding: 16 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 16, backgroundColor: `${note.color}22`, alignItems: 'center', justifyContent: 'center' }}>
            {kind === 'checklist' ? <CheckSquare color={note.color} size={22} weight="bold" /> : <NotePencil color={note.color} size={22} weight="bold" />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900', flex: 1 }} numberOfLines={1}>
                {note.title}
              </Text>
              {note.pinned ? <PushPin color={note.color} size={15} weight="fill" /> : null}
              {note.favorite ? <Star color="#F59E0B" size={15} weight="fill" /> : null}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
              {folderName(note)} · {formatDate(note.updatedAt)} · {words} words
            </Text>
          </View>
        </View>

        {note.body ? (
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 13 }} numberOfLines={4}>
            {note.body}
          </Text>
        ) : null}

        {stats.total > 0 ? (
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '800' }}>Checklist</Text>
              <Text style={{ color: note.color, fontSize: 12, fontWeight: '900' }}>{stats.done}/{stats.total} · {progress}%</Text>
            </View>
            <View style={{ height: 7, borderRadius: 999, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <View style={{ width: `${progress}%`, height: '100%', backgroundColor: note.color, borderRadius: 999 }} />
            </View>
          </View>
        ) : null}

        {tags.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 }}>
            {tags.slice(0, 4).map(tag => (
              <View key={tag} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.surface }}>
                <Tag color={colors.textMuted} size={11} />
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '800' }}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
          {[
            { key: 'pin', icon: <PushPin color={note.pinned ? note.color : colors.textMuted} size={16} weight={note.pinned ? 'fill' : 'regular'} />, onPress: onPin },
            { key: 'favorite', icon: <Star color={note.favorite ? '#F59E0B' : colors.textMuted} size={16} weight={note.favorite ? 'fill' : 'regular'} />, onPress: onFavorite },
            { key: 'share', icon: <ShareNetwork color={colors.textMuted} size={16} />, onPress: onShare },
            { key: 'copy', icon: <Copy color={colors.textMuted} size={16} />, onPress: onDuplicate },
            { key: 'archive', icon: <Archive color={note.archived ? note.color : colors.textMuted} size={16} />, onPress: onArchive },
            { key: 'delete', icon: <Trash color={colors.textMuted} size={16} />, onPress: onDelete },
          ].map(action => (
            <AnimatedPressable key={action.key} onPress={action.onPress} haptic="light" style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.glassBorder,
            }}>
              {action.icon}
            </AnimatedPressable>
          ))}
          <View style={{ flex: 1 }} />
          <AnimatedPressable onPress={onPublish} haptic="medium" style={{
            paddingHorizontal: 13,
            height: 34,
            borderRadius: 17,
            backgroundColor: `${note.color}22`,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: `${note.color}55`,
          }}>
            <Text style={{ color: note.color, fontSize: 12, fontWeight: '900' }}>Echo</Text>
          </AnimatedPressable>
        </View>
      </GlassPanel>
    </Pressable>
  );
}

export default function NotesApp() {
  const { colors } = useTheme();
  const router = useRouter();
  const accent = '#F59E0B';
  const [notes, setNotes] = useState<Note[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<NoteView>('active');
  const [folderFilter, setFolderFilter] = useState('All');
  const [sortMode, setSortMode] = useState<SortMode>('recent');

  useEffect(() => { loadNotes().then(setNotes); }, []);
  useFocusEffect(
    React.useCallback(() => {
      loadNotes().then(setNotes);
    }, []),
  );

  const folders = useMemo(() => {
    const fromNotes = notes.map(folderName);
    return ['All', ...Array.from(new Set([...DEFAULT_FOLDERS, ...fromNotes]))];
  }, [notes]);

  const activeNotes = notes.filter(note => !note.archived);
  const pinnedCount = activeNotes.filter(note => note.pinned).length;
  const favoriteCount = activeNotes.filter(note => note.favorite).length;
  const checklistCount = activeNotes.filter(note => checklistStats(note.body).total > 0).length;
  const totalWords = activeNotes.reduce((sum, note) => sum + countWords(note.body), 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes
      .filter(note => {
        if (view === 'active' && note.archived) return false;
        if (view === 'pinned' && (!note.pinned || note.archived)) return false;
        if (view === 'favorites' && (!note.favorite || note.archived)) return false;
        if (view === 'checklists' && (checklistStats(note.body).total === 0 || note.archived)) return false;
        if (view === 'archive' && !note.archived) return false;
        if (folderFilter !== 'All' && folderName(note) !== folderFilter) return false;
        if (!q) return true;
        return note.title.toLowerCase().includes(q)
          || note.body.toLowerCase().includes(q)
          || folderName(note).toLowerCase().includes(q)
          || (note.tags ?? []).some(tag => tag.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const pinSort = Number(!!b.pinned) - Number(!!a.pinned);
        if (pinSort !== 0 && view !== 'archive') return pinSort;
        if (sortMode === 'title') return a.title.localeCompare(b.title);
        const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        return sortMode === 'oldest' ? -diff : diff;
      });
  }, [folderFilter, notes, search, sortMode, view]);

  const persist = (updated: Note[]) => {
    setNotes(updated);
    saveNotes(updated);
  };

  const openNew = (template = TEMPLATES[0]) => {
    setEditing(template.id === 'blank' ? null : applyTemplate(template));
    setShowEditor(true);
  };
  const openNote = (n: Note) => { setEditing(n); setShowEditor(true); };

  const saveNote = (n: Note) => {
    const existing = notes.find(x => x.id === n.id);
    const updated = existing ? notes.map(x => x.id === n.id ? n : x) : [n, ...notes];
    persist(updated);
    showToast(existing ? 'Note updated' : 'Note saved', 'Saved');
  };

  const mutateNote = (id: string, update: (note: Note) => Note, toast?: string) => {
    const updated = notes.map(note => note.id === id ? update({ ...note, updatedAt: new Date().toISOString() }) : note);
    persist(updated);
    if (toast) showToast(toast);
  };

  const deleteNote = (id: string) => {
    Alert.alert('Delete note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => persist(notes.filter(n => n.id !== id)) },
    ]);
  };

  const duplicateNote = (note: Note) => {
    const now = new Date().toISOString();
    persist([{ ...note, id: `${Date.now()}`, title: `${note.title} copy`, pinned: false, createdAt: now, updatedAt: now }, ...notes]);
    showToast('Note duplicated');
  };

  const shareNote = (n: Note) => {
    Share.share({ message: n.body ? `${n.title}\n\n${n.body}` : n.title }).catch(() => {});
  };

  const publishAsEcho = (n: Note) => {
    router.push({ pathname: '/create-post', params: { prefillTitle: n.title, prefillBody: n.body } });
  };

  const NewBtn = (
    <AnimatedPressable
      onPress={() => openNew()}
      scaleValue={0.88}
      haptic="medium"
      style={{ backgroundColor: accent, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 7 }}
    >
      <Plus color="#fff" size={16} weight="bold" />
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>New</Text>
    </AnimatedPressable>
  );

  return (
    <MiniAppShell
      title="Notes"
      subtitle={activeNotes.length > 0 ? `${activeNotes.length} active · ${totalWords} words` : 'Capture ideas, tasks, research'}
      headerRight={NewBtn}
      bottomPad={56}
    >
      <GlassPanel
        variant="medium"
        borderRadius={26}
        elevated
        tintOverride={colors.isDark ? 'rgba(34,24,10,0.72)' : 'rgba(255,251,235,0.9)'}
        style={{ marginBottom: 14, borderColor: `${accent}44` }}
        contentStyle={{ padding: 18 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <View style={{ width: 48, height: 48, borderRadius: 18, backgroundColor: `${accent}22`, alignItems: 'center', justifyContent: 'center' }}>
            <NotePencil color={accent} size={25} weight="bold" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 23, fontWeight: '900' }}>Capture everything.</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 3, lineHeight: 18 }}>
              Ideas, checklists, meetings, research, and Echo drafts in one place.
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
          <StatPill label="Pinned" value={`${pinnedCount}`} color={accent} />
          <StatPill label="Favorites" value={`${favoriteCount}`} color="#F59E0B" />
          <StatPill label="Checklists" value={`${checklistCount}`} color="#10B981" />
        </View>
      </GlassPanel>

      <EdgeFeaturePanel
        appName="Notes"
        accent={accent}
        headline="Turn notes into outcomes"
        caption="Use saved ideas as coaching context, progress proof, or public Echo drafts."
        metrics={[
          { label: 'Active', value: `${activeNotes.length}` },
          { label: 'Words', value: `${totalWords}` },
          { label: 'Folders', value: `${Math.max(0, folders.length - 1)}` },
        ]}
        prompt="Review my notes and help me choose the next strongest action, idea, or Echo to publish."
        shareText={`Notes progress: ${activeNotes.length} active notes, ${totalWords} words, ${pinnedCount} pinned, ${favoriteCount} favorites.`}
        publishTitle="Notes progress"
        publishBody={`I am building a notes system with ${activeNotes.length} active notes, ${totalWords} words, ${pinnedCount} pinned notes, and ${checklistCount} checklists.`}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingBottom: 14 }}>
        {TEMPLATES.map(template => (
          <AnimatedPressable
            key={template.id}
            onPress={() => openNew(template)}
            haptic="medium"
            style={{
              minWidth: 122,
              borderRadius: 20,
              padding: 14,
              backgroundColor: template.id === 'blank' ? colors.surface : `${template.color}18`,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: template.id === 'blank' ? colors.glassBorder : `${template.color}55`,
            }}
          >
            <Sparkle color={template.color} size={18} weight={template.id === 'blank' ? 'regular' : 'fill'} />
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 9 }}>{template.label}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {template.folder}
            </Text>
          </AnimatedPressable>
        ))}
      </ScrollView>

      <GlassPanel variant="medium" borderRadius={18} contentStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, gap: 10 }} style={{ marginBottom: 12 }}>
        <MagnifyingGlass color={colors.textMuted} size={18} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search notes, tags, folders..."
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.text, fontSize: 15, padding: 0 }}
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch('')}><X color={colors.textMuted} size={16} /></Pressable>
        ) : null}
      </GlassPanel>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
        {[
          { id: 'active', label: 'Active', icon: <FileText color={view === 'active' ? '#fff' : colors.textMuted} size={14} /> },
          { id: 'pinned', label: 'Pinned', icon: <PushPin color={view === 'pinned' ? '#fff' : colors.textMuted} size={14} /> },
          { id: 'favorites', label: 'Favorites', icon: <Star color={view === 'favorites' ? '#fff' : colors.textMuted} size={14} /> },
          { id: 'checklists', label: 'Checklists', icon: <CheckSquare color={view === 'checklists' ? '#fff' : colors.textMuted} size={14} /> },
          { id: 'archive', label: 'Archive', icon: <Archive color={view === 'archive' ? '#fff' : colors.textMuted} size={14} /> },
          { id: 'all', label: 'All', icon: <FunnelSimple color={view === 'all' ? '#fff' : colors.textMuted} size={14} /> },
        ].map(item => (
          <FilterChip key={item.id} label={item.label} active={view === item.id} onPress={() => setView(item.id as NoteView)} icon={item.icon} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
        {folders.map(folder => (
          <FilterChip
            key={folder}
            label={folder}
            active={folderFilter === folder}
            onPress={() => setFolderFilter(folder)}
            icon={<FolderOpen color={folderFilter === folder ? '#fff' : colors.textMuted} size={14} />}
          />
        ))}
        {[
          { id: 'recent', label: 'Recent' },
          { id: 'oldest', label: 'Oldest' },
          { id: 'title', label: 'A-Z' },
        ].map(mode => (
          <FilterChip key={mode.id} label={mode.label} active={sortMode === mode.id} onPress={() => setSortMode(mode.id as SortMode)} />
        ))}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 56, gap: 12 }}>
          <NotePencil color={colors.glassBorder} size={54} weight="thin" />
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900' }}>
            {search ? 'No matching notes' : view === 'archive' ? 'Archive is empty' : 'No notes yet'}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 280 }}>
            {search ? 'Try another word, folder, or tag.' : 'Start with a template or capture a blank note.'}
          </Text>
          <AnimatedPressable onPress={() => openNew()} haptic="medium" style={{ marginTop: 6, backgroundColor: accent, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Plus color="#fff" size={16} weight="bold" />
            <Text style={{ color: '#fff', fontWeight: '900' }}>Create note</Text>
          </AnimatedPressable>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {filtered.map((note, i) => (
            <Animated.View key={note.id} entering={FadeInDown.delay(Math.min(i * 35, 220)).duration(220)}>
              <NoteCard
                note={note}
                onOpen={() => openNote(note)}
                onPin={() => mutateNote(note.id, n => ({ ...n, pinned: !n.pinned }), note.pinned ? 'Unpinned' : 'Pinned')}
                onFavorite={() => mutateNote(note.id, n => ({ ...n, favorite: !n.favorite }), note.favorite ? 'Removed favorite' : 'Favorited')}
                onArchive={() => mutateNote(note.id, n => ({ ...n, archived: !n.archived, pinned: n.archived ? n.pinned : false }), note.archived ? 'Restored' : 'Archived')}
                onDuplicate={() => duplicateNote(note)}
                onShare={() => shareNote(note)}
                onPublish={() => publishAsEcho(note)}
                onDelete={() => deleteNote(note.id)}
              />
            </Animated.View>
          ))}
        </View>
      )}

      {showEditor ? (
        <NoteEditor note={editing} onSave={saveNote} onClose={() => setShowEditor(false)} />
      ) : null}
    </MiniAppShell>
  );
}
