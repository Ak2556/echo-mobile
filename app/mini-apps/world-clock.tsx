import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, X, Globe, Sun, Moon } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

interface City { name: string; timezone: string; flag: string; region: string }

const ALL_CITIES: City[] = [
  { name: 'New York', timezone: 'America/New_York', flag: '🇺🇸', region: 'EST' },
  { name: 'Los Angeles', timezone: 'America/Los_Angeles', flag: '🇺🇸', region: 'PST' },
  { name: 'London', timezone: 'Europe/London', flag: '🇬🇧', region: 'GMT' },
  { name: 'Paris', timezone: 'Europe/Paris', flag: '🇫🇷', region: 'CET' },
  { name: 'Dubai', timezone: 'Asia/Dubai', flag: '🇦🇪', region: 'GST' },
  { name: 'Mumbai', timezone: 'Asia/Kolkata', flag: '🇮🇳', region: 'IST' },
  { name: 'Singapore', timezone: 'Asia/Singapore', flag: '🇸🇬', region: 'SGT' },
  { name: 'Tokyo', timezone: 'Asia/Tokyo', flag: '🇯🇵', region: 'JST' },
  { name: 'Beijing', timezone: 'Asia/Shanghai', flag: '🇨🇳', region: 'CST' },
  { name: 'Seoul', timezone: 'Asia/Seoul', flag: '🇰🇷', region: 'KST' },
  { name: 'Sydney', timezone: 'Australia/Sydney', flag: '🇦🇺', region: 'AEST' },
  { name: 'São Paulo', timezone: 'America/Sao_Paulo', flag: '🇧🇷', region: 'BRT' },
  { name: 'Toronto', timezone: 'America/Toronto', flag: '🇨🇦', region: 'EST' },
  { name: 'Cairo', timezone: 'Africa/Cairo', flag: '🇪🇬', region: 'EET' },
  { name: 'Moscow', timezone: 'Europe/Moscow', flag: '🇷🇺', region: 'MSK' },
  { name: 'Istanbul', timezone: 'Europe/Istanbul', flag: '🇹🇷', region: 'TRT' },
  { name: 'Karachi', timezone: 'Asia/Karachi', flag: '🇵🇰', region: 'PKT' },
  { name: 'Bangkok', timezone: 'Asia/Bangkok', flag: '🇹🇭', region: 'ICT' },
  { name: 'Hong Kong', timezone: 'Asia/Hong_Kong', flag: '🇭🇰', region: 'HKT' },
  { name: 'Berlin', timezone: 'Europe/Berlin', flag: '🇩🇪', region: 'CET' },
  { name: 'Mexico City', timezone: 'America/Mexico_City', flag: '🇲🇽', region: 'CST' },
  { name: 'Chicago', timezone: 'America/Chicago', flag: '🇺🇸', region: 'CST' },
];

const DEFAULT = ['New York', 'London', 'Dubai', 'Tokyo'];

function getTimeInZone(tz: string) {
  const now = new Date();
  const t = now.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const d = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
  const h = parseInt(t.split(':')[0]);
  return { time: t, date: d, hour: h };
}

const { width } = Dimensions.get('window');

export default function WorldClockScreen() {
  const { colors, radius, fontSizes } = useTheme();
  const router = useRouter();

  const [selected, setSelected] = useState<string[]>(DEFAULT);
  const [, setTick] = useState(0);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const addCity = (city: City) => {
    if (!selected.includes(city.name)) setSelected(s => [...s, city.name]);
    setShowSearch(false); setSearch('');
  };

  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { time: localTime, date: localDate, hour: localHour } = getTimeInZone(localTz);
  const isLocalDay = localHour >= 6 && localHour < 20;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
          <ArrowLeft color={colors.text} size={20} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: fontSizes.title }}>World Clock</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{selected.length} cities tracked</Text>
        </View>
        <Pressable
          onPress={() => setShowSearch(s => !s)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 3 } }}
        >
          <Plus color="#fff" size={18} weight="bold" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Add</Text>
        </Pressable>
      </View>

      {/* My time — hero */}
      <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: isLocalDay ? '#F59E0B18' : '#3B82F618', borderRadius: 28, borderWidth: 1.5, borderColor: isLocalDay ? '#F59E0B33' : '#3B82F633', padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {isLocalDay ? <Sun color="#F59E0B" size={18} weight="fill" /> : <Moon color="#3B82F6" size={18} weight="fill" />}
          <Text style={{ color: isLocalDay ? '#F59E0B' : '#3B82F6', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>MY LOCATION</Text>
        </View>
        <Text style={{ color: colors.text, fontSize: 52, fontWeight: '200', letterSpacing: -3, lineHeight: 56 }}>{localTime.slice(0, 5)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>{localDate}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>{localTz.split('/').pop()?.replace(/_/g, ' ')}</Text>
        </View>
      </View>

      {/* Search sheet */}
      {showSearch && (
        <View style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, maxHeight: 280, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 }}>
            <Globe color={colors.textMuted} size={18} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search cities or regions…"
              placeholderTextColor={colors.textMuted}
              autoFocus
              style={{ flex: 1, color: colors.text, fontSize: 15 }}
            />
            <Pressable onPress={() => { setShowSearch(false); setSearch(''); }}>
              <X color={colors.textMuted} size={18} weight="bold" />
            </Pressable>
          </View>
          <ScrollView>
            {ALL_CITIES.filter(c => !selected.includes(c.name) && (c.name.toLowerCase().includes(search.toLowerCase()) || c.region.toLowerCase().includes(search.toLowerCase()))).map(city => {
              const { time } = getTimeInZone(city.timezone);
              return (
                <Pressable key={city.name} onPress={() => addCity(city)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 26, marginRight: 12 }}>{city.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>{city.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>{city.region}</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '300' }}>{time.slice(0, 5)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 24 }}>
        {selected.map(name => {
          const city = ALL_CITIES.find(c => c.name === name);
          if (!city) return null;
          const { time, date, hour } = getTimeInZone(city.timezone);
          const day = hour >= 6 && hour < 20;
          const timeOfDay = hour < 6 ? 'Late Night' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 20 ? 'Evening' : 'Night';

          return (
            <View key={name} style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 18, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 36, marginRight: 14 }}>{city.flag}</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{city.name}</Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: day ? '#F59E0B18' : '#3B82F618' }}>
                    <Text style={{ color: day ? '#F59E0B' : '#3B82F6', fontSize: 10, fontWeight: '700' }}>{timeOfDay}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{date} · {city.region}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '200', letterSpacing: -1 }}>{time.slice(0, 5)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{time.slice(6)}</Text>
              </View>
              <Pressable onPress={() => setSelected(s => s.filter(x => x !== name))} style={{ marginLeft: 12, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center' }}>
                <X color={colors.textMuted} size={14} weight="bold" />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
