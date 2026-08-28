import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import { lectureUrlEndpoint, uploadUrlEndpoint } from './workerUrl';

/**
 * The server side of Learn: tutors, bookings and lecture media.
 *
 * Learn's existing domain layer (lib/learn.ts) is pure functions over a goal
 * held in AsyncStorage, which is right for a private study plan and wrong for
 * anything with two people in it. A booking one device knows about is a note to
 * yourself. This module is the part that a second person can see.
 *
 * Access control lives entirely in Postgres RLS — see
 * 20260828100000_learn_sessions_and_lectures.sql. Nothing here re-checks who
 * may read what, on purpose: a second copy of those rules is a second copy to
 * get wrong.
 */

export type BookingStatus = 'requested' | 'accepted' | 'scheduled' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded';
export type LectureVisibility = 'private' | 'learners' | 'public';

export interface TutorProfile {
  userId: string;
  headline: string;
  bio: string;
  subjects: string[];
  hourlyRate: number | null;
  currency: string;
  timezone: string;
  isPublished: boolean;
  publicSlug: string | null;
}

export interface TutorPackage {
  id: string;
  tutorId: string;
  title: string;
  sessions: number;
  minutes: number;
  price: number | null;
  currency: string;
  isActive: boolean;
}

export interface TutorSlot {
  id: string;
  tutorId: string;
  weekday: number;
  startMinute: number;
  durationMinutes: number;
  isActive: boolean;
}

export interface Booking {
  id: string;
  tutorId: string;
  learnerId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  packageId: string | null;
  slotId: string | null;
  scheduledFor: string | null;
  durationMinutes: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  meetingRoom: string | null;
  meetingLink: string | null;
  prepNote: string | null;
  homework: string | null;
  followUp: string | null;
  createdAt: string;
}

export interface Lecture {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  source: 'upload' | 'link';
  r2Key: string | null;
  externalUrl: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
  thumbnailUrl: string | null;
  visibility: LectureVisibility;
  createdAt: string;
}

export interface LectureNote {
  id: string;
  authorId: string;
  lectureId: string | null;
  bookingId: string | null;
  atSeconds: number | null;
  body: string;
  createdAt: string;
}

/**
 * Largest lecture we will accept from a phone.
 *
 * R2 charges no egress, so the ceiling is about the upload itself: a single PUT
 * on a patchy Indian mobile connection has no resume, and a failed 2GB upload
 * wastes the user's data allowance as well as their time. Multipart upload
 * would raise this; until then the cap is honest about what will actually
 * finish.
 */
export const MAX_LECTURE_BYTES = 500 * 1024 * 1024;

async function uid(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const id = session?.user?.id;
  if (!id) throw new Error('Not signed in');
  return id;
}

/* ── tutor profile ─────────────────────────────────────────────────────── */

const TUTOR_COLS = 'user_id, headline, bio, subjects, hourly_rate, currency, timezone, is_published, public_slug';

function toTutor(r: Record<string, unknown>): TutorProfile {
  return {
    userId: String(r.user_id),
    headline: String(r.headline ?? ''),
    bio: String(r.bio ?? ''),
    subjects: (r.subjects as string[]) ?? [],
    hourlyRate: r.hourly_rate == null ? null : Number(r.hourly_rate),
    currency: String(r.currency ?? 'INR'),
    timezone: String(r.timezone ?? 'Asia/Kolkata'),
    isPublished: Boolean(r.is_published),
    publicSlug: (r.public_slug as string | null) ?? null,
  };
}

export async function fetchMyTutorProfile(): Promise<TutorProfile | null> {
  const me = await uid();
  const { data, error } = await supabase
    .from('learn_tutors').select(TUTOR_COLS).eq('user_id', me).maybeSingle();
  if (error) throw error;
  return data ? toTutor(data) : null;
}

export async function saveTutorProfile(input: Partial<Omit<TutorProfile, 'userId'>>): Promise<TutorProfile> {
  const me = await uid();
  const row: Record<string, unknown> = { user_id: me };
  if (input.headline !== undefined) row.headline = input.headline;
  if (input.bio !== undefined) row.bio = input.bio;
  if (input.subjects !== undefined) row.subjects = input.subjects;
  if (input.hourlyRate !== undefined) row.hourly_rate = input.hourlyRate;
  if (input.currency !== undefined) row.currency = input.currency;
  if (input.timezone !== undefined) row.timezone = input.timezone;
  if (input.isPublished !== undefined) row.is_published = input.isPublished;
  if (input.publicSlug !== undefined) row.public_slug = input.publicSlug;
  row.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('learn_tutors').upsert(row, { onConflict: 'user_id' }).select(TUTOR_COLS).single();
  if (error) throw error;
  return toTutor(data);
}

/** Published tutors, for the browse screen. */
export async function fetchPublishedTutors(limit = 50): Promise<TutorProfile[]> {
  const { data, error } = await supabase
    .from('learn_tutors').select(TUTOR_COLS).eq('is_published', true).limit(limit);
  if (error) throw error;
  return (data ?? []).map(toTutor);
}

/* ── packages ──────────────────────────────────────────────────────────── */

const PACKAGE_COLS = 'id, tutor_id, title, sessions, minutes, price, currency, is_active';

function toPackage(r: Record<string, unknown>): TutorPackage {
  return {
    id: String(r.id),
    tutorId: String(r.tutor_id),
    title: String(r.title),
    sessions: Number(r.sessions),
    minutes: Number(r.minutes),
    price: r.price == null ? null : Number(r.price),
    currency: String(r.currency ?? 'INR'),
    isActive: Boolean(r.is_active),
  };
}

export async function fetchPackages(tutorId: string): Promise<TutorPackage[]> {
  const { data, error } = await supabase
    .from('learn_packages').select(PACKAGE_COLS).eq('tutor_id', tutorId).order('created_at');
  if (error) throw error;
  return (data ?? []).map(toPackage);
}

export async function addPackage(input: {
  title: string; sessions: number; minutes: number; price: number | null; currency?: string;
}): Promise<TutorPackage> {
  const me = await uid();
  const { data, error } = await supabase.from('learn_packages').insert({
    tutor_id: me,
    title: input.title,
    sessions: input.sessions,
    minutes: input.minutes,
    price: input.price,
    currency: input.currency ?? 'INR',
  }).select(PACKAGE_COLS).single();
  if (error) throw error;
  return toPackage(data);
}

export async function setPackageActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('learn_packages').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function deletePackage(id: string): Promise<void> {
  const { error } = await supabase.from('learn_packages').delete().eq('id', id);
  if (error) throw error;
}

/* ── availability ──────────────────────────────────────────────────────── */

const SLOT_COLS = 'id, tutor_id, weekday, start_minute, duration_minutes, is_active';

function toSlot(r: Record<string, unknown>): TutorSlot {
  return {
    id: String(r.id),
    tutorId: String(r.tutor_id),
    weekday: Number(r.weekday),
    startMinute: Number(r.start_minute),
    durationMinutes: Number(r.duration_minutes),
    isActive: Boolean(r.is_active),
  };
}

export async function fetchSlots(tutorId: string): Promise<TutorSlot[]> {
  const { data, error } = await supabase
    .from('learn_slots').select(SLOT_COLS).eq('tutor_id', tutorId)
    .order('weekday').order('start_minute');
  if (error) throw error;
  return (data ?? []).map(toSlot);
}

export async function addSlot(input: {
  weekday: number; startMinute: number; durationMinutes: number;
}): Promise<TutorSlot> {
  const me = await uid();
  const { data, error } = await supabase.from('learn_slots').insert({
    tutor_id: me,
    weekday: input.weekday,
    start_minute: input.startMinute,
    duration_minutes: input.durationMinutes,
  }).select(SLOT_COLS).single();
  if (error) throw error;
  return toSlot(data);
}

export async function setSlotActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('learn_slots').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function deleteSlot(id: string): Promise<void> {
  const { error } = await supabase.from('learn_slots').delete().eq('id', id);
  if (error) throw error;
}

/* ── bookings ──────────────────────────────────────────────────────────── */

// One literal, not a concatenation: supabase-js parses the select string as a
// literal type to shape the result, and a `+` join collapses it to
// GenericStringError.
const BOOKING_COLS = 'id, tutor_id, learner_id, guest_name, guest_email, package_id, slot_id, scheduled_for, duration_minutes, status, payment_status, meeting_room, meeting_link, prep_note, homework, follow_up, created_at';

function toBooking(r: Record<string, unknown>): Booking {
  return {
    id: String(r.id),
    tutorId: String(r.tutor_id),
    learnerId: (r.learner_id as string | null) ?? null,
    guestName: (r.guest_name as string | null) ?? null,
    guestEmail: (r.guest_email as string | null) ?? null,
    packageId: (r.package_id as string | null) ?? null,
    slotId: (r.slot_id as string | null) ?? null,
    scheduledFor: (r.scheduled_for as string | null) ?? null,
    durationMinutes: Number(r.duration_minutes ?? 60),
    status: (r.status as BookingStatus) ?? 'requested',
    paymentStatus: (r.payment_status as PaymentStatus) ?? 'unpaid',
    meetingRoom: (r.meeting_room as string | null) ?? null,
    meetingLink: (r.meeting_link as string | null) ?? null,
    prepNote: (r.prep_note as string | null) ?? null,
    homework: (r.homework as string | null) ?? null,
    followUp: (r.follow_up as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

/**
 * Every booking the signed-in user is part of, on either side.
 *
 * One query rather than two: the RLS select policy already restricts rows to
 * the tutor and the learner, so an unfiltered select returns exactly the
 * user's own bookings and nothing else.
 */
export async function fetchMyBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('learn_bookings').select(BOOKING_COLS).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toBooking);
}

export async function requestBooking(input: {
  tutorId: string;
  packageId?: string | null;
  slotId?: string | null;
  scheduledFor?: string | null;
  durationMinutes?: number;
  prepNote?: string | null;
}): Promise<Booking> {
  const me = await uid();
  const { data, error } = await supabase.from('learn_bookings').insert({
    tutor_id: input.tutorId,
    learner_id: me,
    package_id: input.packageId ?? null,
    slot_id: input.slotId ?? null,
    scheduled_for: input.scheduledFor ?? null,
    duration_minutes: input.durationMinutes ?? 60,
    prep_note: input.prepNote ?? null,
  }).select(BOOKING_COLS).single();
  if (error) throw error;
  return toBooking(data);
}

export async function updateBooking(id: string, input: Partial<{
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  scheduledFor: string | null;
  meetingRoom: string | null;
  meetingLink: string | null;
  prepNote: string | null;
  homework: string | null;
  followUp: string | null;
}>): Promise<Booking> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status !== undefined) row.status = input.status;
  if (input.paymentStatus !== undefined) row.payment_status = input.paymentStatus;
  if (input.scheduledFor !== undefined) row.scheduled_for = input.scheduledFor;
  if (input.meetingRoom !== undefined) row.meeting_room = input.meetingRoom;
  if (input.meetingLink !== undefined) row.meeting_link = input.meetingLink;
  if (input.prepNote !== undefined) row.prep_note = input.prepNote;
  if (input.homework !== undefined) row.homework = input.homework;
  if (input.followUp !== undefined) row.follow_up = input.followUp;

  const { data, error } = await supabase
    .from('learn_bookings').update(row).eq('id', id).select(BOOKING_COLS).single();
  if (error) throw error;
  return toBooking(data);
}

/* ── lectures ──────────────────────────────────────────────────────────── */

const LECTURE_COLS = 'id, owner_id, title, description, source, r2_key, external_url, duration_seconds, size_bytes, thumbnail_url, visibility, created_at';

function toLecture(r: Record<string, unknown>): Lecture {
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    title: String(r.title),
    description: String(r.description ?? ''),
    source: (r.source as 'upload' | 'link') ?? 'link',
    r2Key: (r.r2_key as string | null) ?? null,
    externalUrl: (r.external_url as string | null) ?? null,
    durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
    sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
    visibility: (r.visibility as LectureVisibility) ?? 'private',
    createdAt: String(r.created_at),
  };
}

/**
 * Lectures the signed-in user may see. With no owner given, RLS decides: your
 * own, plus anything public, plus a tutor's 'learners' library once you have a
 * live booking with them.
 */
export async function fetchLectures(ownerId?: string): Promise<Lecture[]> {
  let q = supabase.from('learn_lectures').select(LECTURE_COLS).order('created_at', { ascending: false });
  if (ownerId) q = q.eq('owner_id', ownerId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toLecture);
}

export async function addLectureLink(input: {
  title: string; description?: string; url: string; visibility?: LectureVisibility;
}): Promise<Lecture> {
  const me = await uid();
  const { data, error } = await supabase.from('learn_lectures').insert({
    owner_id: me,
    title: input.title,
    description: input.description ?? '',
    source: 'link',
    external_url: input.url,
    visibility: input.visibility ?? 'learners',
  }).select(LECTURE_COLS).single();
  if (error) throw error;
  return toLecture(data);
}

/**
 * Upload a video and record it as a lecture.
 *
 * The row is written only after the bytes land. Writing it first would leave a
 * lecture pointing at an object that does not exist if the upload dies — and
 * `learn_lectures_source_shape` requires an r2_key on an upload, so there is no
 * halfway row to represent that anyway.
 */
export async function uploadLecture(input: {
  uri: string;
  title: string;
  description?: string;
  visibility?: LectureVisibility;
  durationSeconds?: number | null;
  onProgress?: (fraction: number) => void;
}): Promise<Lecture> {
  const { data: { session } } = await supabase.auth.getSession();
  const me = session?.user?.id;
  if (!me || !session) throw new Error('Not signed in');

  const info = await FileSystem.getInfoAsync(input.uri);
  if (!info.exists) throw new Error('That file is no longer on the device');
  const size = 'size' in info ? Number(info.size ?? 0) : 0;
  if (size > MAX_LECTURE_BYTES) {
    throw new Error(`That video is ${Math.round(size / 1024 / 1024)}MB. The limit is ${MAX_LECTURE_BYTES / 1024 / 1024}MB.`);
  }

  const ext = (input.uri.split('.').pop() ?? 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
  const safeExt = ['mp4', 'mov', 'm4v', 'webm'].includes(ext) ? ext : 'mp4';
  const key = `${me}/${Date.now()}.${safeExt}`;

  const signedRes = await fetch(uploadUrlEndpoint('learn-lectures', key), {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!signedRes.ok) throw new Error('Could not start the upload');
  const { signedUrl } = await signedRes.json();

  const task = FileSystem.createUploadTask(
    signedUrl,
    input.uri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'content-type': safeExt === 'mov' ? 'video/quicktime' : `video/${safeExt}` },
    },
    (p) => {
      if (p.totalBytesExpectedToSend > 0) {
        input.onProgress?.(p.totalBytesSent / p.totalBytesExpectedToSend);
      }
    },
  );

  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`Upload failed (${result?.status ?? 'no response'})`);
  }

  const { data, error } = await supabase.from('learn_lectures').insert({
    owner_id: me,
    title: input.title,
    description: input.description ?? '',
    source: 'upload',
    r2_key: key,
    size_bytes: size,
    duration_seconds: input.durationSeconds ?? null,
    visibility: input.visibility ?? 'learners',
  }).select(LECTURE_COLS).single();
  if (error) throw error;
  return toLecture(data);
}

/**
 * Resolve a lecture to something a player can open.
 *
 * The worker re-reads the row with the caller's own token, so a lecture the
 * user may not watch comes back 404 here even if they somehow learned its id.
 */
export async function resolveLecturePlayback(
  lectureId: string,
): Promise<{ kind: 'link' | 'upload'; url: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const res = await fetch(lectureUrlEndpoint(lectureId), {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (res.status === 404) throw new Error('That lecture is not available to you');
  if (!res.ok) throw new Error('Could not open that lecture');

  const body = await res.json();
  if (!body?.url) throw new Error('That lecture has no playable source');
  return { kind: body.kind, url: body.url };
}

export async function deleteLecture(id: string): Promise<void> {
  const { error } = await supabase.from('learn_lectures').delete().eq('id', id);
  if (error) throw error;
}

/* ── notes ─────────────────────────────────────────────────────────────── */

const NOTE_COLS = 'id, author_id, lecture_id, booking_id, at_seconds, body, created_at';

function toNote(r: Record<string, unknown>): LectureNote {
  return {
    id: String(r.id),
    authorId: String(r.author_id),
    lectureId: (r.lecture_id as string | null) ?? null,
    bookingId: (r.booking_id as string | null) ?? null,
    atSeconds: r.at_seconds == null ? null : Number(r.at_seconds),
    body: String(r.body),
    createdAt: String(r.created_at),
  };
}

export async function fetchNotes(subject: { lectureId?: string; bookingId?: string }): Promise<LectureNote[]> {
  let q = supabase.from('learn_lecture_notes').select(NOTE_COLS);
  if (subject.lectureId) q = q.eq('lecture_id', subject.lectureId);
  if (subject.bookingId) q = q.eq('booking_id', subject.bookingId);
  const { data, error } = await q.order('at_seconds', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toNote);
}

export async function addNote(input: {
  body: string; lectureId?: string | null; bookingId?: string | null; atSeconds?: number | null;
}): Promise<LectureNote> {
  const me = await uid();
  const { data, error } = await supabase.from('learn_lecture_notes').insert({
    author_id: me,
    lecture_id: input.lectureId ?? null,
    booking_id: input.bookingId ?? null,
    at_seconds: input.atSeconds ?? null,
    body: input.body,
  }).select(NOTE_COLS).single();
  if (error) throw error;
  return toNote(data);
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('learn_lecture_notes').delete().eq('id', id);
  if (error) throw error;
}

/* ── people on the other side of a booking ─────────────────────────────── */

export interface Person {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Names for a set of user ids, so a booking can say who it is with.
 *
 * Bookings store ids only. Joining profiles into the booking select would be
 * neater but the FK points at auth.users, not public.profiles, so PostgREST has
 * no relationship to traverse — hence a second query.
 */
export async function fetchPeople(ids: string[]): Promise<Record<string, Person>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await supabase
    .from('profiles').select('id, username, display_name, avatar_url').in('id', unique);
  if (error) throw error;
  const out: Record<string, Person> = {};
  for (const r of data ?? []) {
    out[String(r.id)] = {
      id: String(r.id),
      username: String(r.username ?? ''),
      displayName: String(r.display_name ?? r.username ?? 'Someone'),
      avatarUrl: (r.avatar_url as string | null) ?? null,
    };
  }
  return out;
}
