import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable,
  KeyboardAvoidingView, Platform, Alert, Modal, StyleSheet, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import {
  Archive, ArrowUpRight, BookOpenText, CheckSquare, Copy, DotsThree, Flask, FolderOpen,
  Lightbulb, ListBullets, MagnifyingGlass, NotePencil, Plus, PushPin, ShareNetwork,
  SortAscending, Star, Tag, TextH, Trash, UsersThree, X,
} from 'phosphor-react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { useI18n } from '../../src/shared/lib/i18n';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { MiniEmptyState } from '../../components/mini-apps/MiniKit';
import { ActionSheet, type ActionItem } from '../../components/common/ActionSheet';
import { showToast } from '../../components/ui/Toast';
import { NOTE_COLORS, Note, loadNotes, saveNotes } from '../../lib/mini-apps/notes';
import { countWords } from '../../lib/mini-apps/wordCount';

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

// Strip list/checkbox/heading markup so the card preview reads as prose
// instead of showing literal "- [ ]" and "##" tokens. Checked items get a ✓.
function previewText(body: string) {
  return body
    .split(/\r?\n/)
    .map(line => line
      .replace(/^\s*[-*]\s+\[[xX]\]\s+/, '✓ ')
      .replace(/^\s*[-*]\s+\[ \]\s+/, '○ ')
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/^\s*[-*]\s+/, '• '))
    .join('\n')
    .trim();
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

const TEMPLATE_ICONS: Record<string, (color: string) => React.ReactNode> = {
  'blank': c => <NotePencil color={c} size={16} weight="bold" />,
  'task-plan': c => <CheckSquare color={c} size={16} weight="bold" />,
  'meeting': c => <UsersThree color={c} size={16} weight="bold" />,
  'idea': c => <Lightbulb color={c} size={16} weight="bold" />,
  'journal': c => <BookOpenText color={c} size={16} weight="bold" />,
  'research': c => <Flask color={c} size={16} weight="bold" />,
};

function NoteEditor({
  note,
  onSave,
  onClose,
}: {
  note: Note | null;
  onSave: (n: Note) => void;
  onClose: () => void;
}) {
  const { colors, radius, font } = useTheme();
  const { tt } = useI18n();
  const insets = useSafeAreaInsets();
  const isNew = !note;
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [color, setColor] = useState(note?.color ?? NOTE_COLORS[0]);
  const [folder, setFolder] = useState(note?.folder ?? 'Inbox');
  const [tags, setTags] = useState((note?.tags ?? []).join(', '));
  const [kind, setKind] = useState<NonNullable<Note['kind']>>(noteKind(note ?? applyTemplate(TEMPLATES[0])));
  const [paletteOpen, setPaletteOpen] = useState(false);

  const stats = checklistStats(body);
  const words = countWords(body);
  const showTemplates = isNew && !title.trim() && !body.trim();

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
      // There is no kind picker any more: a plain note with checkboxes is a checklist.
      kind: kind === 'note' && stats.total > 0 ? 'checklist' : kind,
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

  const pill = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  };

  const tools = [
    { key: 'checkbox', label: tt('Add checkbox'), icon: <CheckSquare color={colors.textSecondary} size={20} />, insert: '- [ ] ' },
    { key: 'heading', label: tt('Heading'), icon: <TextH color={colors.textSecondary} size={20} />, insert: '## ' },
    { key: 'bullet', label: tt('Bullet'), icon: <ListBullets color={colors.textSecondary} size={20} />, insert: '- ' },
  ];

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { save(); onClose(); }}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 10 }}>
            <Pressable onPress={() => { save(); onClose(); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={tt('Done')}>
              <View style={{ paddingVertical: 6, paddingRight: 8 }}>
                <Text style={[font.bodyBold, { color: colors.accent, fontSize: 16 }]}>{tt('Done')}</Text>
              </View>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => setPaletteOpen(open => !open)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={tt('Note color')}
              accessibilityState={{ expanded: paletteOpen }}
            >
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: color, borderWidth: 2, borderColor: colors.glassBorder }} />
            </Pressable>
          </View>

          {paletteOpen ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, paddingBottom: 12 }}>
              {NOTE_COLORS.map((c, ci) => (
                <Pressable
                  key={c}
                  onPress={() => { setColor(c); setPaletteOpen(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${tt('Note color')} ${ci + 1}`}
                  accessibilityState={{ selected: color === c }}
                  hitSlop={6}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: colors.text }} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {showTemplates ? (
              <View style={{ marginBottom: 14 }}>
                <Text style={[font.bodyBold, { color: colors.textMuted, fontSize: 12, marginBottom: 8 }]}>{tt('Start from')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {TEMPLATES.filter(t => t.id !== 'blank').map(template => (
                    <Pressable key={template.id} onPress={() => applyNoteTemplate(template)} accessibilityRole="button" accessibilityLabel={tt(template.label)}>
                      <View style={[pill, { backgroundColor: `${template.color}1F` }]}>
                        {TEMPLATE_ICONS[template.id]?.(template.color)}
                        <Text style={[font.bodyBold, { color: colors.text, fontSize: 13 }]}>{tt(template.label)}</Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={tt('Title')}
              placeholderTextColor={colors.textMuted}
              style={[font.display, { color: colors.text, fontSize: 28, lineHeight: 34, padding: 0 }]}
              multiline
            />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={pill}>
                <FolderOpen color={colors.textMuted} size={15} />
                <TextInput
                  value={folder}
                  onChangeText={setFolder}
                  placeholder={tt('Inbox')}
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel={tt('Folder')}
                  style={[font.body, { color: colors.textSecondary, fontSize: 13, padding: 0, minWidth: 48 }]}
                />
              </View>
              <View style={[pill, { flex: 1 }]}>
                <Tag color={colors.textMuted} size={15} />
                <TextInput
                  value={tags}
                  onChangeText={setTags}
                  placeholder={tt('Add tags')}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  accessibilityLabel={tt('Tags')}
                  style={[font.body, { flex: 1, color: colors.textSecondary, fontSize: 13, padding: 0 }]}
                />
              </View>
            </View>

            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder={tt('Start writing…')}
              placeholderTextColor={colors.textMuted}
              style={[font.body, { color: colors.text, fontSize: 16.5, lineHeight: 26, marginTop: 18, padding: 0, minHeight: 320, textAlignVertical: 'top' }]}
              multiline
              autoFocus={isNew}
            />
          </ScrollView>

          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 8),
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.glassBorder,
          }}>
            {tools.map(tool => (
              <Pressable key={tool.key} onPress={() => append(tool.insert)} accessibilityRole="button" accessibilityLabel={tool.label} hitSlop={4}>
                <View style={{ width: 44, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}>{tool.icon}</View>
              </Pressable>
            ))}
            <View style={{ flex: 1 }} />
            <Text style={[font.body, { color: colors.textMuted, fontSize: 12.5, paddingRight: 6 }]}>
              {stats.total ? `${stats.done}/${stats.total} ${tt('done')} · ` : ''}{words} {words === 1 ? tt('word') : tt('words')}
            </Text>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function NoteCard({ note, onOpen, onMore }: { note: Note; onOpen: () => void; onMore: () => void }) {
  const { colors, radius, font } = useTheme();
  const { tt } = useI18n();
  const stats = checklistStats(note.body);
  const progress = stats.total ? stats.done / stats.total : 0;
  const preview = previewText(note.body);
  const meta = [formatDate(note.updatedAt), folderName(note), ...(note.tags ?? []).slice(0, 2).map(tag => `#${tag}`)].join(' · ');

  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onMore}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityLabel={`${note.title}. ${meta}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
    >
      <View style={{
        flexDirection: 'row',
        borderRadius: radius.card,
        overflow: 'hidden',
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
      }}>
        <View style={{ width: 4, backgroundColor: note.color }} />
        <View style={{ flex: 1, minWidth: 0, paddingVertical: 14, paddingLeft: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 16.5, flexShrink: 1 }]} numberOfLines={1}>{note.title}</Text>
            {note.pinned ? <PushPin color={note.color} size={13} weight="fill" /> : null}
            {note.favorite ? <Star color={colors.warning} size={13} weight="fill" /> : null}
            <View style={{ flex: 1 }} />
            <Pressable onPress={onMore} hitSlop={12} accessibilityRole="button" accessibilityLabel={tt('Note actions')}>
              <View style={{ paddingHorizontal: 12, paddingVertical: 2 }}>
                <DotsThree color={colors.textMuted} size={20} weight="bold" />
              </View>
            </Pressable>
          </View>

          {preview ? (
            <Text style={[font.body, { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 4, paddingRight: 14 }]} numberOfLines={3}>
              {preview}
            </Text>
          ) : null}

          {stats.total > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingRight: 14 }}>
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: note.color }} />
              </View>
              <Text style={[font.bodyBold, { color: colors.textMuted, fontSize: 11.5 }]}>{stats.done}/{stats.total}</Text>
            </View>
          ) : null}

          <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 8, paddingRight: 14 }]} numberOfLines={1}>{meta}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function NotesApp() {
  const { colors, radius, font } = useTheme();
  const { tt } = useI18n();
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<NoteView>('active');
  const [folderFilter, setFolderFilter] = useState('All');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [menuNote, setMenuNote] = useState<Note | null>(null);
  const { vAction, vValue } = useLocalSearchParams<{ vAction?: string; vValue?: string }>();
  const didVoiceRef = React.useRef(false);

  // useFocusEffect covers the initial focus too, so this is the single load
  // path — it also refreshes when returning from the editor or another tab.
  useFocusEffect(
    React.useCallback(() => {
      loadNotes().then((loaded) => {
        // Voice: "add note <text>" navigates here with ?vAction=add&vValue=…
        const a = typeof vAction === 'string' ? vAction.toLowerCase() : '';
        const text = typeof vValue === 'string' ? vValue.trim() : '';
        if (!didVoiceRef.current && a === 'add' && text) {
          didVoiceRef.current = true;
          const nowIso = new Date().toISOString();
          const note: Note = { id: `${Date.now()}`, title: '', body: text, color: NOTE_COLORS[0], createdAt: nowIso, updatedAt: nowIso };
          const next = [note, ...loaded];
          setNotes(next);
          void saveNotes(next);
        } else {
          setNotes(loaded);
        }
      });
    }, [vAction, vValue]),
  );

  // Only folders that actually hold something. The default list was always
  // padded in, so a screen with two notes offered six folders to filter by,
  // four of which were guaranteed empty. DEFAULT_FOLDERS still seeds the
  // picker when creating a note; it just no longer populates the filter row.
  const folders = useMemo(() => {
    const fromNotes = Array.from(new Set(notes.map(folderName)));
    return fromNotes.length > 1 ? ['All', ...fromNotes] : fromNotes;
  }, [notes]);

  const activeNotes = notes.filter(note => !note.archived);
  const pinnedCount = activeNotes.filter(note => note.pinned).length;
  const favoriteCount = activeNotes.filter(note => note.favorite).length;
  const checklistCount = activeNotes.filter(note => checklistStats(note.body).total > 0).length;

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
    showToast(existing ? tt('Note updated') : tt('Note saved'), tt('Saved'));
  };

  const mutateNote = (id: string, update: (note: Note) => Note, toast?: string) => {
    const updated = notes.map(note => note.id === id ? update({ ...note, updatedAt: new Date().toISOString() }) : note);
    persist(updated);
    if (toast) showToast(toast);
  };

  const deleteNote = (id: string) => {
    Alert.alert(tt('Delete note?'), tt('This cannot be undone.'), [
      { text: tt('Cancel'), style: 'cancel' },
      { text: tt('Delete'), style: 'destructive', onPress: () => persist(notes.filter(n => n.id !== id)) },
    ]);
  };

  const duplicateNote = (note: Note) => {
    const now = new Date().toISOString();
    persist([{ ...note, id: `${Date.now()}`, title: `${note.title} ${tt('copy')}`, pinned: false, createdAt: now, updatedAt: now }, ...notes]);
    showToast(tt('Note duplicated'));
  };

  const shareNote = (n: Note) => {
    Share.share({ message: n.body ? `${n.title}\n\n${n.body}` : n.title }).catch(() => {});
  };

  const publishAsEcho = (n: Note) => {
    router.push({ pathname: '/create-post', params: { prefillTitle: n.title, prefillBody: n.body } });
  };

  const SORT_LABELS: Record<SortMode, string> = { recent: 'Recent', oldest: 'Oldest', title: 'A–Z' };
  const nextSort: Record<SortMode, SortMode> = { recent: 'oldest', oldest: 'title', title: 'recent' };

  // Pinned notes get their own section, except where the view is already
  // about one kind of note.
  const sectioned = view !== 'pinned' && view !== 'archive' && filtered.some(n => n.pinned) && filtered.some(n => !n.pinned);
  const sections = sectioned
    ? [
      { key: 'pinned', label: tt('Pinned'), notes: filtered.filter(n => n.pinned) },
      { key: 'notes', label: tt('Notes'), notes: filtered.filter(n => !n.pinned) },
    ]
    : [{ key: 'all', label: '', notes: filtered }];

  const menuActions: ActionItem[] = menuNote ? [
    { key: 'pin', label: menuNote.pinned ? tt('Unpin note') : tt('Pin note'), icon: <PushPin color={colors.text} size={18} />, onPress: () => mutateNote(menuNote.id, n => ({ ...n, pinned: !n.pinned }), menuNote.pinned ? tt('Unpinned') : tt('Pinned')) },
    { key: 'favorite', label: menuNote.favorite ? tt('Remove favorite') : tt('Add to favorites'), icon: <Star color={colors.text} size={18} />, onPress: () => mutateNote(menuNote.id, n => ({ ...n, favorite: !n.favorite }), menuNote.favorite ? tt('Removed favorite') : tt('Favorited')) },
    { key: 'share', label: tt('Share note'), icon: <ShareNetwork color={colors.text} size={18} />, onPress: () => shareNote(menuNote) },
    { key: 'duplicate', label: tt('Duplicate note'), icon: <Copy color={colors.text} size={18} />, onPress: () => duplicateNote(menuNote) },
    { key: 'publish', label: tt('Publish note as an Echo'), icon: <ArrowUpRight color={colors.text} size={18} />, onPress: () => publishAsEcho(menuNote) },
    { key: 'archive', label: menuNote.archived ? tt('Restore note') : tt('Archive note'), icon: <Archive color={colors.text} size={18} />, onPress: () => mutateNote(menuNote.id, n => ({ ...n, archived: !n.archived, pinned: n.archived ? n.pinned : false }), menuNote.archived ? tt('Restored') : tt('Archived')) },
    { key: 'delete', label: tt('Delete note'), icon: <Trash color="#EF4444" size={18} />, destructive: true, onPress: () => deleteNote(menuNote.id) },
  ] : [];

  const NewBtn = (
    <AnimatedPressable
      onPress={() => openNew()}
      scaleValue={0.9}
      haptic="medium"
      accessibilityLabel={tt('New note')}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
    >
      <Plus color={colors.bgPure} size={20} weight="bold" />
    </AnimatedPressable>
  );

  const filters: { id: NoteView; label: string; count?: number }[] = [
    { id: 'active', label: 'All notes' },
    { id: 'pinned', label: 'Pinned', count: pinnedCount },
    { id: 'favorites', label: 'Favorites', count: favoriteCount },
    { id: 'checklists', label: 'Checklists', count: checklistCount },
    { id: 'archive', label: 'Archive' },
  ];

  return (
    <MiniAppShell
      title={tt('Notes')}
      subtitle={activeNotes.length > 0 ? `${activeNotes.length} ${activeNotes.length === 1 ? tt('note') : tt('notes')}` : tt('Capture ideas, tasks, research')}
      headerRight={NewBtn}
      bottomPad={56}
    >
      {/* Templates help when there is nothing to look at yet; once notes exist
          the header's + and the editor's "Start from" row cover them. */}
      {notes.length === 0 ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingBottom: 14 }}>
        {TEMPLATES.map(template => (
          <AnimatedPressable
            key={template.id}
            onPress={() => openNew(template)}
            haptic="medium"
            style={{
              minWidth: 122,
              borderRadius: radius.card,
              padding: 14,
              backgroundColor: template.id === 'blank' ? colors.surface : `${template.color}18`,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: template.id === 'blank' ? colors.glassBorder : `${template.color}55`,
            }}
          >
            {TEMPLATE_ICONS[template.id]?.(template.id === 'blank' ? colors.textSecondary : template.color)}
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 14, marginTop: 9 }]}>{tt(template.label)}</Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 11, marginTop: 2 }]} numberOfLines={1}>
              {tt(template.folder)}
            </Text>
          </AnimatedPressable>
        ))}
      </ScrollView>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 46, borderRadius: radius.full, backgroundColor: colors.surface, marginBottom: 12 }}>
        <MagnifyingGlass color={colors.textMuted} size={18} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={tt('Search notes')}
          placeholderTextColor={colors.textMuted}
          style={[font.body, { flex: 1, color: colors.text, fontSize: 15, padding: 0 }]}
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={tt('Clear search')}>
            <X color={colors.textMuted} size={16} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setSortMode(mode => nextSort[mode])}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${tt('Sort')}: ${tt(SORT_LABELS[sortMode])}`}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.glassBorder }}>
            <SortAscending color={colors.textSecondary} size={16} />
            <Text style={[font.bodyBold, { color: colors.textSecondary, fontSize: 12.5 }]}>{tt(SORT_LABELS[sortMode])}</Text>
          </View>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16, alignItems: 'center' }}>
        {filters.filter(f => f.count === undefined || f.count > 0 || view === f.id).map(f => {
          const active = view === f.id;
          return (
            <Pressable key={f.id} onPress={() => setView(f.id)} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={tt(f.label)}>
              <View style={{ height: 34, paddingHorizontal: 14, borderRadius: radius.full, justifyContent: 'center', backgroundColor: active ? colors.text : colors.surface }}>
                <Text style={[font.bodyBold, { color: active ? colors.bg : colors.textSecondary, fontSize: 13 }]}>
                  {tt(f.label)}{f.count ? ` ${f.count}` : ''}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {folders.length > 1 ? (
          <>
            <View style={{ width: StyleSheet.hairlineWidth, height: 20, backgroundColor: colors.glassBorder, marginHorizontal: 2 }} />
            {folders.map(folder => {
              const active = folderFilter === folder;
              return (
                <Pressable key={folder} onPress={() => setFolderFilter(folder)} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${tt('Folder')} ${tt(folder)}`}>
                  <View style={{ height: 34, paddingHorizontal: 12, borderRadius: radius.full, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: active ? `${colors.accent}33` : 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: active ? colors.accent : colors.glassBorder }}>
                    <FolderOpen color={active ? colors.accent : colors.textMuted} size={13} />
                    <Text style={[font.bodyBold, { color: active ? colors.accent : colors.textMuted, fontSize: 12.5 }]}>{tt(folder)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </>
        ) : null}
      </ScrollView>

      {filtered.length === 0 ? (
        <MiniEmptyState
          accent={colors.accent}
          icon={<NotePencil color={colors.textMuted} size={44} weight="duotone" />}
          title={search ? tt('No matching notes') : view === 'archive' ? tt('Archive is empty') : tt('No notes yet')}
          subtitle={search ? tt('Try another word, folder, or tag.') : tt('Start with a template or capture a blank note.')}
          actionLabel={search ? undefined : tt('Create note')}
          onAction={search ? undefined : () => openNew()}
        />
      ) : (
        <View style={{ gap: 18 }}>
          {sections.map(section => (
            <View key={section.key} style={{ gap: 10 }}>
              {section.label ? (
                <Text style={[font.bodyBold, { color: colors.textMuted, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 4 }]}>{section.label}</Text>
              ) : null}
              {section.notes.map((note, i) => (
                <Animated.View key={note.id} entering={FadeInDown.delay(Math.min(i * 30, 180)).duration(200)}>
                  <NoteCard note={note} onOpen={() => openNote(note)} onMore={() => setMenuNote(note)} />
                </Animated.View>
              ))}
            </View>
          ))}
        </View>
      )}

      <ActionSheet visible={!!menuNote} onClose={() => setMenuNote(null)} subtitle={menuNote?.title} actions={menuActions} />

      {showEditor ? (
        <NoteEditor note={editing} onSave={saveNote} onClose={() => setShowEditor(false)} />
      ) : null}
    </MiniAppShell>
  );
}
