import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { FilmSlate, LinkSimple, Plus, Trash, X } from 'phosphor-react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { showToast } from '../ui/Toast';
import {
  MAX_LECTURE_BYTES,
  addLectureLink,
  addNote,
  deleteLecture,
  fetchLectures,
  fetchNotes,
  resolveLecturePlayback,
  uploadLecture,
  type Lecture,
  type LectureNote,
} from '../../lib/learnApi';

/**
 * Lectures: upload one, or point at one, then watch it and take notes on it.
 *
 * A lecture used to be a line of text in a field labelled "Link, note, book,
 * video, or file detail". This is the version where the video is a real file
 * you can play and the notes attach to the moment you wrote them.
 */

function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function sizeLabel(bytes: number | null): string {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export function LecturesPanel() {
  const { colors, font, radius } = useTheme();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [open, setOpen] = useState<Lecture | null>(null);

  const reload = useCallback(async () => {
    try {
      setLectures(await fetchLectures());
    } catch {
      showToast('Could not load lectures', 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const pickAndUpload = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast('Photo access is needed to pick a video', 'Error');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    setUploadPct(0);
    try {
      await uploadLecture({
        uri: asset.uri,
        title: asset.fileName?.replace(/\.[^.]+$/, '') || 'Untitled lecture',
        durationSeconds: asset.duration ? Math.round(asset.duration / 1000) : null,
        onProgress: setUploadPct,
      });
      showToast('Lecture uploaded', 'Done');
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed', 'Error');
    } finally {
      setUploadPct(null);
    }
  };

  // Alert.prompt exists only on iOS. Using it would leave "Add link" doing
  // nothing at all on Android, which is the platform most of this app's users
  // are on — so the link form is a real view, not a system prompt.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const saveLink = async () => {
    const url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      showToast('That needs to be a http or https link', 'Error');
      return;
    }
    try {
      await addLectureLink({ title: linkTitle.trim() || 'Linked lecture', url });
      setLinkOpen(false);
      setLinkTitle('');
      setLinkUrl('');
      await reload();
    } catch {
      showToast('Could not add that link', 'Error');
    }
  };

  const remove = (lecture: Lecture) => {
    Alert.alert('Delete lecture?', lecture.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteLecture(lecture.id);
            await reload();
          } catch {
            showToast('Could not delete', 'Error');
          }
        },
      },
    ]);
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={pickAndUpload} disabled={uploadPct !== null} accessibilityRole="button">
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingVertical: 12, paddingHorizontal: 16,
            borderRadius: radius.card, backgroundColor: colors.accent,
            opacity: uploadPct !== null ? 0.6 : 1,
          }}>
            <Plus size={16} weight="bold" color={colors.bg} />
            <Text style={[font.bodyBold, { color: colors.bg, fontSize: 14 }]}>
              {uploadPct === null ? 'Upload video' : `${Math.round(uploadPct * 100)}%`}
            </Text>
          </View>
        </Pressable>

        <Pressable onPress={() => setLinkOpen(true)} accessibilityRole="button">
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingVertical: 12, paddingHorizontal: 16,
            borderRadius: radius.card, backgroundColor: colors.surface,
          }}>
            <LinkSimple size={16} weight="bold" color={colors.text} />
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>Add link</Text>
          </View>
        </Pressable>
      </View>

      <Text style={[font.body, { color: colors.textMuted, fontSize: 12 }]}>
        Up to {MAX_LECTURE_BYTES / 1024 / 1024}MB per video.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      ) : lectures.length === 0 ? (
        <Text style={[font.body, { color: colors.textMuted, fontSize: 13, marginTop: 12 }]}>
          No lectures yet. Upload a recording or paste a link, and it will be here to watch and annotate.
        </Text>
      ) : (
        lectures.map(lecture => (
          <Pressable key={lecture.id} onPress={() => setOpen(lecture)} onLongPress={() => remove(lecture)} accessibilityRole="button">
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              padding: 14, borderRadius: radius.card, backgroundColor: colors.surface,
            }}>
              {lecture.source === 'upload'
                ? <FilmSlate size={20} weight="fill" color={colors.accent} />
                : <LinkSimple size={20} weight="bold" color={colors.accent} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>
                  {lecture.title}
                </Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]}>
                  {[
                    lecture.durationSeconds ? mmss(lecture.durationSeconds) : null,
                    sizeLabel(lecture.sizeBytes),
                    lecture.visibility === 'public' ? 'Public'
                      : lecture.visibility === 'learners' ? 'Learners' : 'Private',
                  ].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          </Pressable>
        ))
      )}

      {open && <LectureViewer lecture={open} onClose={() => setOpen(null)} />}

      <Modal visible={linkOpen} animationType="slide" transparent onRequestClose={() => setLinkOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colors.bg, padding: 20, gap: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 16 }]}>Add a lecture link</Text>
            <TextInput
              value={linkTitle}
              onChangeText={setLinkTitle}
              placeholder="Title"
              placeholderTextColor={colors.textMuted}
              style={[font.body, { color: colors.text, fontSize: 14, backgroundColor: colors.surface, borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 12 }]}
            />
            <TextInput
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://…"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="url"
              style={[font.body, { color: colors.text, fontSize: 14, backgroundColor: colors.surface, borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 12 }]}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setLinkOpen(false)} accessibilityRole="button" style={{ flex: 1 }}>
                <View style={{ paddingVertical: 14, borderRadius: radius.card, backgroundColor: colors.surface, alignItems: 'center' }}>
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>Cancel</Text>
                </View>
              </Pressable>
              <Pressable onPress={saveLink} accessibilityRole="button" style={{ flex: 1 }}>
                <View style={{ paddingVertical: 14, borderRadius: radius.card, backgroundColor: colors.accent, alignItems: 'center' }}>
                  <Text style={[font.bodyBold, { color: colors.bg, fontSize: 14 }]}>Add</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Player plus the notes taken against it, with the timestamp attached. */
function LectureViewer({ lecture, onClose }: { lecture: Lecture; onClose: () => void }) {
  const { colors, font, radius } = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<LectureNote[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    resolveLecturePlayback(lecture.id)
      .then(r => { if (!cancelled) setUrl(r.url); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open'); });
    fetchNotes({ lectureId: lecture.id })
      .then(n => { if (!cancelled) setNotes(n); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [lecture.id]);

  // A player is only created once a source exists; useVideoPlayer with an empty
  // string builds a player that can never load and swallows the real error.
  const player = useVideoPlayer(url, p => { p.loop = false; });

  const save = async () => {
    const body = draft.trim();
    if (!body) return;
    // Read the position at the moment of saving, so the note points at what
    // was on screen when it was written rather than where playback got to.
    const at = Math.round(player?.currentTime ?? 0);
    setDraft('');
    try {
      const created = await addNote({ body, lectureId: lecture.id, atSeconds: at });
      setNotes(prev => [...prev, created].sort((a, b) => (a.atSeconds ?? 0) - (b.atSeconds ?? 0)));
    } catch {
      setDraft(body);
      showToast('Could not save that note', 'Error');
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <View style={{ padding: 8 }}><X size={20} weight="bold" color={colors.text} /></View>
          </Pressable>
          <Text numberOfLines={1} style={[font.bodyBold, { color: colors.text, fontSize: 16, flex: 1 }]}>
            {lecture.title}
          </Text>
        </View>

        {error ? (
          <Text style={[font.body, { color: colors.textMuted, fontSize: 13, padding: 16 }]}>{error}</Text>
        ) : !url ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : (
          <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }}>
            <VideoView style={{ width: '100%', height: '100%' }} player={player} allowsFullscreen allowsPictureInPicture />
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8, padding: 16 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Note at this moment…"
            placeholderTextColor={colors.textMuted}
            style={[font.body, {
              flex: 1, color: colors.text, fontSize: 14,
              backgroundColor: colors.surface, borderRadius: radius.card,
              paddingHorizontal: 14, paddingVertical: 12,
            }]}
            onSubmitEditing={save}
            returnKeyType="done"
          />
          <Pressable onPress={save} accessibilityRole="button" accessibilityLabel="Save note">
            <View style={{
              paddingHorizontal: 16, paddingVertical: 12,
              borderRadius: radius.card, backgroundColor: colors.accent,
            }}>
              <Text style={[font.bodyBold, { color: colors.bg, fontSize: 14 }]}>Save</Text>
            </View>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {notes.map(note => (
            <Pressable
              key={note.id}
              onPress={() => { if (player && note.atSeconds != null) player.currentTime = note.atSeconds; }}
              accessibilityRole="button"
              accessibilityLabel={`Jump to ${mmss(note.atSeconds ?? 0)}: ${note.body}`}
            >
              <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 8 }}>
                <Text style={[font.bodyBold, { color: colors.accent, fontSize: 12, minWidth: 44 }]}>
                  {mmss(note.atSeconds ?? 0)}
                </Text>
                <Text style={[font.body, { color: colors.text, fontSize: 13, flex: 1 }]}>{note.body}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}
