import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking } from 'react-native';
import { CalendarBlank, VideoCamera } from 'phosphor-react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { showToast } from '../ui/Toast';
import { getSessionUserId } from '../../lib/supabaseEchoApi';
import {
  fetchMyBookings,
  fetchPeople,
  fetchPublishedTutors,
  requestBooking,
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
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [uid, list, published] = await Promise.all([
        getSessionUserId(), fetchMyBookings(), fetchPublishedTutors(20),
      ]);
      setMe(uid);
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

  const request = async (tutor: TutorProfile) => {
    try {
      await requestBooking({ tutorId: tutor.userId });
      showToast('Request sent', 'Done');
      await reload();
    } catch {
      showToast('Could not send that request', 'Error');
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
          const joinable = booking.status === 'scheduled' && (booking.meetingLink || booking.meetingRoom);

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

              {(action || joinable) && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {joinable && (
                    <Pressable
                      onPress={() => {
                        if (booking.meetingLink) void Linking.openURL(booking.meetingLink);
                        else showToast('In-app meetings are not enabled yet', 'Info');
                      }}
                      accessibilityRole="button"
                      style={{ flex: 1 }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.card, backgroundColor: colors.accent }}>
                        <VideoCamera size={16} weight="fill" color={colors.bg} />
                        <Text style={[font.bodyBold, { color: colors.bg, fontSize: 13 }]}>Join</Text>
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
            </View>
          );
        })
      )}

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
