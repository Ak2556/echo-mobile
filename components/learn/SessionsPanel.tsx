import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking, TextInput, Share } from 'react-native';
import { CalendarBlank, ShareNetwork, VideoCamera } from 'phosphor-react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { showToast } from '../ui/Toast';
import { getSessionUserId } from '../../lib/supabaseEchoApi';
import { bookingPageUrl } from '../../lib/workerUrl';
import {
  fetchMyBookings,
  fetchMyTutorProfile,
  fetchPeople,
  fetchPublishedTutors,
  requestBooking,
  saveTutorProfile,
  setTutorPublished,
  updateBooking,
  type Booking,
  type BookingStatus,
  type Person,
  type TutorProfile,
} from '../../lib/learnApi';

/**
 * Sessions that a second person can actually see.
 *
 * The 1:1 tab this sits beside is a private record: it keeps a tutor's own
 * notes on their students, on their own device. This is the shared half — a
 * booking here exists for both people, and each of them sees the other's
 * changes to it.
 */

const NEXT_ACTION: Partial<Record<BookingStatus, { label: string; to: BookingStatus }>> = {
  requested: { label: 'Accept', to: 'accepted' },
  accepted: { label: 'Mark scheduled', to: 'scheduled' },
  scheduled: { label: 'Mark complete', to: 'completed' },
};

function whenLabel(iso: string | null): string {
  if (!iso) return 'Time not set';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Time not set';
  return d.toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

export function SessionsPanel() {
  const { colors, font, radius } = useTheme();
  const [me, setMe] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [tutors, setTutors] = useState<TutorProfile[]>([]);
  const [mine, setMine] = useState<TutorProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState('');
  const [subjects, setSubjects] = useState('');
  const [rate, setRate] = useState('');
  const [loading, setLoading] = useState(true);
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState('');

  const reload = useCallback(async () => {
    try {
      const [uid, list, published, ownProfile] = await Promise.all([
        getSessionUserId(), fetchMyBookings(), fetchPublishedTutors(20), fetchMyTutorProfile(),
      ]);
      setMe(uid);
      setMine(ownProfile);
      if (ownProfile) {
        setHeadline(ownProfile.headline);
        setSubjects(ownProfile.subjects.join(', '));
        setRate(ownProfile.hourlyRate == null ? '' : String(ownProfile.hourlyRate));
      }
      setBookings(list);
      setTutors(published.filter(t => t.userId !== uid));
      setPeople(await fetchPeople(list.flatMap(b => [b.tutorId, b.learnerId ?? ''])));
    } catch {
      showToast('Could not load sessions', 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const advance = async (booking: Booking, to: BookingStatus) => {
    // Optimistic: the round trip is the only thing between the tap and the
    // change, and a failure puts it straight back.
    const before = bookings;
    setBookings(prev => prev.map(b => (b.id === booking.id ? { ...b, status: to } : b)));
    try {
      await updateBooking(booking.id, { status: to });
    } catch {
      setBookings(before);
      showToast('Could not update that session', 'Error');
    }
  };

  const saveMeetingLink = async (booking: Booking) => {
    const link = linkDraft.trim();
    if (!/^https?:\/\//i.test(link)) {
      showToast('That needs to be a http or https link', 'Error');
      return;
    }
    try {
      const updated = await updateBooking(booking.id, { meetingLink: link });
      setBookings(prev => prev.map(b => (b.id === booking.id ? updated : b)));
      setLinkFor(null);
      setLinkDraft('');
    } catch {
      showToast('Could not save that link', 'Error');
    }
  };

  const request = async (tutor: TutorProfile) => {
    try {
      await requestBooking({ tutorId: tutor.userId });
      showToast('Request sent', 'Done');
      await reload();
    } catch {
      showToast('Could not send that request', 'Error');
    }
  };

  const saveProfile = async () => {
    if (!headline.trim()) {
      showToast('Give your sessions a headline first', 'Error');
      return;
    }
    try {
      const parsedRate = rate.trim() ? Number(rate.trim()) : null;
      const saved = await saveTutorProfile({
        headline: headline.trim(),
        subjects: subjects.split(',').map(x => x.trim()).filter(Boolean),
        hourlyRate: Number.isFinite(parsedRate as number) ? parsedRate : null,
      });
      setMine(saved);
      setEditing(false);
    } catch {
      showToast('Could not save your profile', 'Error');
    }
  };

  const togglePublished = async () => {
    try {
      const saved = await setTutorPublished(!mine?.isPublished);
      setMine(saved);
      showToast(saved.isPublished ? 'Your page is live' : 'Your page is hidden', 'Done');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not update', 'Error');
    }
  };

  if (loading) return <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />;

  return (
    <View style={{ gap: 10 }}>
      {bookings.length === 0 ? (
        <Text style={[font.body, { color: colors.textMuted, fontSize: 13 }]}>
          No sessions yet. Request one below, or publish your own tutoring profile so others can book you.
        </Text>
      ) : (
        bookings.map(booking => {
          const isTutor = booking.tutorId === me;
          const otherId = isTutor ? booking.learnerId : booking.tutorId;
          const other = otherId ? people[otherId]?.displayName : booking.guestName;
          const action = isTutor ? NEXT_ACTION[booking.status] : undefined;
          // Only a real link is joinable. In-app meetings need LiveKit
          // credentials and a client SDK that this build does not have, so
          // offering a Join button for meeting_room would be a button that
          // apologises instead of working.
          const joinable = !!booking.meetingLink && booking.status !== 'cancelled';
          const canAddLink = isTutor && !booking.meetingLink
            && (booking.status === 'accepted' || booking.status === 'scheduled');

          return (
            <View key={booking.id} style={{ padding: 14, borderRadius: radius.card, backgroundColor: colors.surface, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <CalendarBlank size={18} weight="bold" color={colors.accent} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>
                    {isTutor ? `With ${other ?? 'a learner'}` : `${other ?? 'Tutor'}`}
                  </Text>
                  <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]}>
                    {whenLabel(booking.scheduledFor)} · {booking.durationMinutes} min · {booking.status}
                  </Text>
                </View>
              </View>

              {(action || joinable || canAddLink) && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {joinable && (
                    <Pressable
                      onPress={() => void Linking.openURL(booking.meetingLink!)}
                      accessibilityRole="button"
                      style={{ flex: 1 }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.card, backgroundColor: colors.accent }}>
                        <VideoCamera size={16} weight="fill" color={colors.bg} />
                        <Text style={[font.bodyBold, { color: colors.bg, fontSize: 13 }]}>Join</Text>
                      </View>
                    </Pressable>
                  )}
                  {canAddLink && (
                    <Pressable
                      onPress={() => { setLinkFor(booking.id); setLinkDraft(''); }}
                      accessibilityRole="button"
                      style={{ flex: 1 }}
                    >
                      <View style={{ alignItems: 'center', paddingVertical: 12, borderRadius: radius.card, backgroundColor: colors.bg }}>
                        <Text style={[font.bodyBold, { color: colors.text, fontSize: 13 }]}>Add meeting link</Text>
                      </View>
                    </Pressable>
                  )}
                  {action && (
                    <Pressable onPress={() => advance(booking, action.to)} accessibilityRole="button" style={{ flex: 1 }}>
                      <View style={{ alignItems: 'center', paddingVertical: 12, borderRadius: radius.card, backgroundColor: colors.bg }}>
                        <Text style={[font.bodyBold, { color: colors.text, fontSize: 13 }]}>{action.label}</Text>
                      </View>
                    </Pressable>
                  )}
                </View>
              )}

              {linkFor === booking.id && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={linkDraft}
                    onChangeText={setLinkDraft}
                    placeholder="https://…"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    keyboardType="url"
                    autoFocus
                    style={[font.body, {
                      flex: 1, color: colors.text, fontSize: 13,
                      backgroundColor: colors.bg, borderRadius: radius.card,
                      paddingHorizontal: 12, paddingVertical: 10,
                    }]}
                  />
                  <Pressable onPress={() => saveMeetingLink(booking)} accessibilityRole="button">
                    <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.card, backgroundColor: colors.accent }}>
                      <Text style={[font.bodyBold, { color: colors.bg, fontSize: 13 }]}>Save</Text>
                    </View>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })
      )}

      <View style={{ padding: 14, borderRadius: radius.card, backgroundColor: colors.surface, gap: 10, marginTop: 8 }}>
        <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>
          {mine ? 'Your sessions' : 'Offer 1:1 sessions'}
        </Text>

        {editing || !mine ? (
          <>
            <TextInput
              value={headline} onChangeText={setHeadline}
              placeholder="What you teach, in a few words"
              placeholderTextColor={colors.textMuted}
              style={[font.body, { color: colors.text, fontSize: 14, backgroundColor: colors.bg, borderRadius: radius.card, paddingHorizontal: 12, paddingVertical: 10 }]}
            />
            <TextInput
              value={subjects} onChangeText={setSubjects}
              placeholder="Subjects, comma separated"
              placeholderTextColor={colors.textMuted}
              style={[font.body, { color: colors.text, fontSize: 14, backgroundColor: colors.bg, borderRadius: radius.card, paddingHorizontal: 12, paddingVertical: 10 }]}
            />
            <TextInput
              value={rate} onChangeText={setRate}
              placeholder="Hourly rate (optional)"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              style={[font.body, { color: colors.text, fontSize: 14, backgroundColor: colors.bg, borderRadius: radius.card, paddingHorizontal: 12, paddingVertical: 10 }]}
            />
            <Pressable onPress={saveProfile} accessibilityRole="button">
              <View style={{ alignItems: 'center', paddingVertical: 12, borderRadius: radius.card, backgroundColor: colors.accent }}>
                <Text style={[font.bodyBold, { color: colors.bg, fontSize: 13 }]}>Save</Text>
              </View>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 13 }]}>
              {mine.headline}{mine.subjects.length ? ` · ${mine.subjects.join(', ')}` : ''}
            </Text>

            {mine.isPublished && mine.publicSlug && (
              <Pressable
                onPress={() => {
                  // A booking link exists to be sent to someone, so the share
                  // sheet is the gesture rather than a silent copy.
                  Share.share({ message: bookingPageUrl(mine.publicSlug!) })
                    .catch(() => showToast('Could not open the share sheet', 'Error'));
                }}
                accessibilityRole="button"
                accessibilityLabel="Share your booking link"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.card, backgroundColor: colors.bg }}>
                  <ShareNetwork size={14} weight="bold" color={colors.accent} />
                  <Text numberOfLines={1} style={[font.body, { color: colors.textMuted, fontSize: 12, flex: 1 }]}>
                    {bookingPageUrl(mine.publicSlug)}
                  </Text>
                </View>
              </Pressable>
            )}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setEditing(true)} accessibilityRole="button" style={{ flex: 1 }}>
                <View style={{ alignItems: 'center', paddingVertical: 12, borderRadius: radius.card, backgroundColor: colors.bg }}>
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: 13 }]}>Edit</Text>
                </View>
              </Pressable>
              <Pressable onPress={togglePublished} accessibilityRole="button" style={{ flex: 1 }}>
                <View style={{ alignItems: 'center', paddingVertical: 12, borderRadius: radius.card, backgroundColor: mine.isPublished ? colors.bg : colors.accent }}>
                  <Text style={[font.bodyBold, { color: mine.isPublished ? colors.text : colors.bg, fontSize: 13 }]}>
                    {mine.isPublished ? 'Unpublish' : 'Publish page'}
                  </Text>
                </View>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {tutors.length > 0 && (
        <>
          <Text style={[font.bodyBold, { color: colors.text, fontSize: 14, marginTop: 8 }]}>Tutors you can book</Text>
          {tutors.map(tutor => (
            <View key={tutor.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.card, backgroundColor: colors.surface }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>
                  {tutor.headline || 'Tutor'}
                </Text>
                {!!tutor.subjects.length && (
                  <Text numberOfLines={1} style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]}>
                    {tutor.subjects.join(' · ')}
                  </Text>
                )}
              </View>
              <Pressable onPress={() => request(tutor)} accessibilityRole="button">
                <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.card, backgroundColor: colors.accent }}>
                  <Text style={[font.bodyBold, { color: colors.bg, fontSize: 13 }]}>Request</Text>
                </View>
              </Pressable>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
