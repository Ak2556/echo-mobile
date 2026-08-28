import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, Alert } from 'react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { showToast } from '../ui/Toast';
import { Disclosure } from './Disclosure';
import { formatTimeOfDay, parseTimeOfDay } from './timeOfDay';
import {
  addPackage,
  addSlot,
  deletePackage,
  deleteSlot,
  fetchPackages,
  fetchSlots,
  setPackageActive,
  setSlotActive,
  type TutorPackage,
  type TutorSlot,
} from '../../lib/learnApi';

/**
 * What a tutor sells, and when they are free.
 *
 * Both were modelled, stored and served from the first migration and had no
 * interface at all, so a published booking page could only ever say "request a
 * session" with no shape to it — no lengths, no prices, no times.
 *
 * Availability is a weekly rule rather than a list of dates, matching how
 * learn_slots stores it: a weekday and a minute of the day, so it keeps being
 * true next month without anything regenerating it.
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function TutorOfferings({ tutorId }: { tutorId: string }) {
  const { colors, font, radius } = useTheme();
  const [packages, setPackages] = useState<TutorPackage[]>([]);
  const [slots, setSlots] = useState<TutorSlot[]>([]);

  const [pkgTitle, setPkgTitle] = useState('');
  const [pkgSessions, setPkgSessions] = useState('1');
  const [pkgMinutes, setPkgMinutes] = useState('60');
  const [pkgPrice, setPkgPrice] = useState('');

  const [slotDay, setSlotDay] = useState(1);
  const [slotTime, setSlotTime] = useState('18:00');
  const [slotMinutes, setSlotMinutes] = useState('60');

  const reload = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([fetchPackages(tutorId), fetchSlots(tutorId)]);
      setPackages(p);
      setSlots(s);
    } catch {
      showToast('Could not load your offerings', 'Error');
    }
  }, [tutorId]);

  useEffect(() => { void reload(); }, [reload]);

  const createPackage = async () => {
    if (!pkgTitle.trim()) { showToast('Give the package a name', 'Error'); return; }
    const sessions = Number(pkgSessions) || 1;
    const minutes = Number(pkgMinutes) || 60;
    try {
      const created = await addPackage({
        title: pkgTitle.trim(),
        sessions,
        minutes,
        price: pkgPrice.trim() ? Number(pkgPrice.trim()) : null,
      });
      setPackages(prev => [...prev, created]);
      setPkgTitle(''); setPkgPrice('');
    } catch {
      showToast('Could not add that package', 'Error');
    }
  };

  const createSlot = async () => {
    const startMinute = parseTimeOfDay(slotTime);
    if (startMinute === null) { showToast('Use a time like 18:00', 'Error'); return; }
    try {
      const created = await addSlot({
        weekday: slotDay,
        startMinute,
        durationMinutes: Number(slotMinutes) || 60,
      });
      setSlots(prev => [...prev, created].sort(
        (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute));
    } catch {
      showToast('Could not add that time', 'Error');
    }
  };

  const togglePackage = async (p: TutorPackage) => {
    setPackages(prev => prev.map(x => (x.id === p.id ? { ...x, isActive: !x.isActive } : x)));
    try {
      await setPackageActive(p.id, !p.isActive);
    } catch {
      setPackages(prev => prev.map(x => (x.id === p.id ? { ...x, isActive: p.isActive } : x)));
      showToast('Could not update that package', 'Error');
    }
  };

  const toggleSlot = async (s: TutorSlot) => {
    setSlots(prev => prev.map(x => (x.id === s.id ? { ...x, isActive: !x.isActive } : x)));
    try {
      await setSlotActive(s.id, !s.isActive);
    } catch {
      setSlots(prev => prev.map(x => (x.id === s.id ? { ...x, isActive: s.isActive } : x)));
      showToast('Could not update that time', 'Error');
    }
  };

  const removePackage = (p: TutorPackage) =>
    Alert.alert('Remove package?', p.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await deletePackage(p.id); setPackages(prev => prev.filter(x => x.id !== p.id)); }
        catch { showToast('Could not remove that', 'Error'); }
      } },
    ]);

  const removeSlot = (s: TutorSlot) =>
    Alert.alert('Remove this time?', `${DAYS[s.weekday]} ${formatTimeOfDay(s.startMinute)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await deleteSlot(s.id); setSlots(prev => prev.filter(x => x.id !== s.id)); }
        catch { showToast('Could not remove that', 'Error'); }
      } },
    ]);

  const field = {
    color: colors.text, fontSize: 13, backgroundColor: colors.bg,
    borderRadius: radius.card, paddingHorizontal: 12, paddingVertical: 10,
  } as const;

  return (
    <>
      <Disclosure title="Packages" meta={`${packages.filter(p => p.isActive).length} active`}>
        <View style={{ gap: 8 }}>
          {packages.map(p => (
            <Pressable key={p.id} onPress={() => togglePackage(p)} onLongPress={() => removePackage(p)}
              accessibilityRole="button"
              accessibilityLabel={`${p.title}, ${p.isActive ? 'active' : 'paused'}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
                             borderRadius: radius.card, backgroundColor: colors.surface,
                             opacity: p.isActive ? 1 : 0.5 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[font.bodyBold, { color: colors.text, fontSize: 13 }]}>{p.title}</Text>
                  <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]}>
                    {p.sessions > 1 ? `${p.sessions} × ` : ''}{p.minutes} min
                    {p.price != null ? ` · ${p.currency} ${p.price}` : ''}
                  </Text>
                </View>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 11 }]}>
                  {p.isActive ? 'Active' : 'Paused'}
                </Text>
              </View>
            </Pressable>
          ))}

          <TextInput value={pkgTitle} onChangeText={setPkgTitle}
            placeholder="Package name" placeholderTextColor={colors.textMuted}
            style={[font.body, field]} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={pkgSessions} onChangeText={setPkgSessions} keyboardType="number-pad"
              placeholder="Sessions" placeholderTextColor={colors.textMuted}
              style={[font.body, field, { flex: 1 }]} />
            <TextInput value={pkgMinutes} onChangeText={setPkgMinutes} keyboardType="number-pad"
              placeholder="Minutes" placeholderTextColor={colors.textMuted}
              style={[font.body, field, { flex: 1 }]} />
            <TextInput value={pkgPrice} onChangeText={setPkgPrice} keyboardType="number-pad"
              placeholder="Price" placeholderTextColor={colors.textMuted}
              style={[font.body, field, { flex: 1 }]} />
          </View>
          <Pressable onPress={createPackage} accessibilityRole="button">
            <View style={{ alignItems: 'center', paddingVertical: 11, borderRadius: radius.card, backgroundColor: colors.accent }}>
              <Text style={[font.bodyBold, { color: colors.bg, fontSize: 13 }]}>Add package</Text>
            </View>
          </Pressable>
        </View>
      </Disclosure>

      <Disclosure title="When you're free" meta={`${slots.filter(s => s.isActive).length} times`}>
        <View style={{ gap: 8 }}>
          {slots.map(s => (
            <Pressable key={s.id} onPress={() => toggleSlot(s)} onLongPress={() => removeSlot(s)}
              accessibilityRole="button"
              accessibilityLabel={`${DAYS[s.weekday]} ${formatTimeOfDay(s.startMinute)}, ${s.isActive ? 'on' : 'off'}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12,
                             borderRadius: radius.card, backgroundColor: colors.surface,
                             opacity: s.isActive ? 1 : 0.5 }}>
                <Text style={[font.bodyBold, { color: colors.text, fontSize: 13, flex: 1 }]}>
                  {DAYS[s.weekday]} {formatTimeOfDay(s.startMinute)}
                </Text>
                <Text style={[font.body, { color: colors.textMuted, fontSize: 12 }]}>
                  {s.durationMinutes} min
                </Text>
              </View>
            </Pressable>
          ))}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {DAYS.map((d, i) => (
              <Pressable key={d} onPress={() => setSlotDay(i)} accessibilityRole="button"
                accessibilityState={{ selected: slotDay === i }}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                               backgroundColor: slotDay === i ? colors.accent : colors.bg }}>
                  <Text style={[font.bodyBold, { fontSize: 12, color: slotDay === i ? colors.bg : colors.textMuted }]}>{d}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={slotTime} onChangeText={setSlotTime}
              placeholder="18:00" placeholderTextColor={colors.textMuted}
              style={[font.body, field, { flex: 1 }]} />
            <TextInput value={slotMinutes} onChangeText={setSlotMinutes} keyboardType="number-pad"
              placeholder="Minutes" placeholderTextColor={colors.textMuted}
              style={[font.body, field, { flex: 1 }]} />
          </View>
          <Pressable onPress={createSlot} accessibilityRole="button">
            <View style={{ alignItems: 'center', paddingVertical: 11, borderRadius: radius.card, backgroundColor: colors.accent }}>
              <Text style={[font.bodyBold, { color: colors.bg, fontSize: 13 }]}>Add time</Text>
            </View>
          </Pressable>
        </View>
      </Disclosure>
    </>
  );
}
