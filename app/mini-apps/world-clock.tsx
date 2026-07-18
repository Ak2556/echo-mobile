import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, MagnifyingGlass, Moon, Plus, Sun, X } from 'phosphor-react-native';
import { useFocusEffect } from 'expo-router';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniCommandDeck } from '../../components/mini-apps/MiniKit';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import {
  PRESET_CITIES,
  WorldClockCity,
  WeatherSnapshot,
  fetchCityWeather,
  loadWorldClockCities,
  saveWorldClockCities,
  searchWorldClockLocations,
} from '../../lib/worldClock';

function getTimeInZone(timezone: string) {
  const now = new Date();
  try {
    const time = now.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const date = now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' });
    const hour = Number(time.split(':')[0]);
    return { time, date, hour: Number.isFinite(hour) ? hour : 12 };
  } catch {
    return { time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }), date: 'UTC', hour: 12 };
  }
}

function weatherIcon(code: number, color: string, size = 18) {
  if ([45, 48].includes(code)) return <CloudFog color={color} size={size} weight="bold" />;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return <CloudRain color={color} size={size} weight="bold" />;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return <CloudSnow color={color} size={size} weight="bold" />;
  if ([95, 96, 99].includes(code)) return <CloudLightning color={color} size={size} weight="bold" />;
  return <CloudSun color={color} size={size} weight="bold" />;
}

function timeOfDay(hour: number) {
  if (hour < 6) return 'Late';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  if (hour < 20) return 'Evening';
  return 'Night';
}

export default function WorldClockScreen() {
  const { colors, font } = useTheme();
  const accent = colors.accent;
  const [cities, setCities] = useState<WorldClockCity[]>([]);
  const [weather, setWeather] = useState<Record<string, WeatherSnapshot | null>>({});
  const [, setTick] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WorldClockCity[]>([]);
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(false);

  useFocusEffect(React.useCallback(() => {
    loadWorldClockCities().then(setCities).catch(() => setCities([]));
  }, []));

  useEffect(() => {
    const timer = setInterval(() => setTick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const pairs = await Promise.all(cities.map(async city => [city.id, await fetchCityWeather(city)] as const));
      if (!cancelled) setWeather(Object.fromEntries(pairs));
    };
    if (cities.length) void run();
    return () => { cancelled = true; };
  }, [cities]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!query.trim()) { setResults(PRESET_CITIES.filter(city => !cities.some(item => item.id === city.id)).slice(0, 8)); return; }
      setSearching(true);
      const found = await searchWorldClockLocations(query);
      if (!cancelled) {
        const existing = new Set(cities.map(city => `${city.name.toLowerCase()}-${city.timezone}`));
        setResults(found.filter(city => !existing.has(`${city.name.toLowerCase()}-${city.timezone}`)));
        setSearching(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [cities, query]);

  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localCity = useMemo<WorldClockCity>(() => ({
    id: 'local',
    name: localTimezone.split('/').pop()?.replace(/_/g, ' ') || 'Local',
    timezone: localTimezone,
    region: 'My location',
    flag: '⌖',
    source: 'local',
  }), [localTimezone]);
  const local = getTimeInZone(localTimezone);
  const localWeather = weather.local;
  const isLocalDay = local.hour >= 6 && local.hour < 20;

  const addCity = async (city: WorldClockCity) => {
    const next = [...cities, city];
    setCities(next);
    await saveWorldClockCities(next);
    setAdding(false);
    setQuery('');
  };

  const removeCity = async (cityId: string) => {
    const next = cities.filter(city => city.id !== cityId);
    setCities(next);
    await saveWorldClockCities(next);
  };

  const AddButton = (
    <AnimatedPressable onPress={() => setAdding(value => !value)} scaleValue={0.9} haptic="medium" accessibilityLabel="Add location">
      <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
        {adding ? <X color="#fff" size={18} weight="bold" /> : <Plus color="#fff" size={18} weight="bold" />}
      </View>
    </AnimatedPressable>
  );

  return (
    <MiniAppShell title="World Clock" subtitle="Meet" headerRight={AddButton}>
      <MiniCommandDeck
        accent={accent}
        title="Time, weather, and coordination"
        subtitle="Time, weather, meetings."
        metrics={[
          { label: 'Saved', value: `${cities.length}`, detail: 'locations' },
          { label: 'Local', value: local.time.slice(0, 5), detail: isLocalDay ? 'day' : 'night' },
          { label: 'Weather', value: `${Object.values(weather).filter(Boolean).length}`, detail: 'loaded' },
        ]}
        chips={['Custom places', 'Weather now', 'Meeting planning']}
      />

      <GlassPanel variant="medium" borderRadius={24} contentStyle={{ padding: 18 }} style={{ marginBottom: 14, borderColor: `${isLocalDay ? '#B08536' : '#5E748B'}44` }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <View style={{ width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: `${isLocalDay ? '#B08536' : '#5E748B'}22` }}>
            {isLocalDay ? <Sun color="#B08536" size={24} weight="fill" /> : <Moon color="#5E748B" size={24} weight="fill" />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[font.eyebrow, { color: colors.textMuted }]} numberOfLines={1}>My Location</Text>
            <Text style={[font.display, { color: colors.text, fontSize: 42, lineHeight: 48 }]} numberOfLines={1}>{local.time.slice(0, 5)}</Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 12.5 }]} numberOfLines={1}>{local.date} · {localCity.name}</Text>
          </View>
          <WeatherBadge snapshot={localWeather} fallback="Weather" />
        </View>
      </GlassPanel>

      {adding ? (
        <GlassPanel variant="medium" borderRadius={22} contentStyle={{ padding: 14 }} style={{ marginBottom: 14, borderColor: `${accent}3A` }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: 15, paddingHorizontal: 12, backgroundColor: colors.surfaceHover, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
            <MagnifyingGlass color={colors.textMuted} size={18} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Add any city or location..."
              placeholderTextColor={colors.textMuted}
              autoFocus
              style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 10 }}
              returnKeyType="search"
            />
            {searching ? <ActivityIndicator color={accent} size="small" /> : null}
          </View>
          <Text style={[font.bodySemibold, { color: colors.textMuted, fontSize: 11.5, marginTop: 12, marginBottom: 8 }]}>
            {query.trim() ? 'Search results' : 'Popular locations'}
          </Text>
          <View style={{ gap: 8 }}>
            {results.slice(0, 6).map(city => (
              <LocationResult key={`${city.id}-${city.timezone}`} city={city} onAdd={() => addCity(city)} />
            ))}
            {results.length === 0 && !searching ? (
              <Text style={[font.body, { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 18 }]}>
                No locations found. Try a city, country, or region name.
              </Text>
            ) : null}
          </View>
        </GlassPanel>
      ) : null}

      <View style={{ gap: 10 }}>
        {cities.map(city => (
          <CityCard
            key={`${city.id}-${city.timezone}`}
            city={city}
            weather={weather[city.id]}
            onRemove={() => removeCity(city.id)}
          />
        ))}
      </View>

      <EdgeFeaturePanel
        appId="world-clock"
        appName="World Clock"
        accent={accent}
        headline="Plan across time zones"
        caption="Use live time and weather to coordinate calls, classes, travel, and group work."
        metrics={[
          { label: 'Saved', value: `${cities.length}` },
          { label: 'Local', value: local.time.slice(0, 5) },
          { label: 'Weather', value: `${Object.values(weather).filter(Boolean).length}` },
        ]}
        prompt={`Find a good meeting time across these locations: ${cities.map(city => city.name).join(', ')}.`}
        shareText={`World clock: ${cities.map(city => `${city.name} ${getTimeInZone(city.timezone).time.slice(0, 5)}`).join(' · ')}`}
        publishTitle="Time zone plan"
        publishBody={`Planning across ${cities.length} locations with time and weather context.`}
      />
    </MiniAppShell>
  );
}

function WeatherBadge({ snapshot, fallback }: { snapshot?: WeatherSnapshot | null; fallback: string }) {
  const { colors, font } = useTheme();
  const accent = snapshot ? colors.accent : colors.textMuted;
  return (
    <View style={{ minWidth: 76, alignItems: 'flex-end' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: colors.surfaceHover, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
        {snapshot ? weatherIcon(snapshot.code, accent, 16) : <CloudSun color={accent} size={16} />}
        <Text style={[font.bodyBold, { color: colors.text, fontSize: 12.5 }]} numberOfLines={1}>
          {snapshot ? `${Math.round(snapshot.temperature)}°` : '--'}
        </Text>
      </View>
      <Text style={[font.body, { color: colors.textMuted, fontSize: 10.5, marginTop: 4 }]} numberOfLines={1}>
        {snapshot?.label ?? fallback}
      </Text>
    </View>
  );
}

function LocationResult({ city, onAdd }: { city: WorldClockCity; onAdd: () => void }) {
  const { colors, font } = useTheme();
  const clock = getTimeInZone(city.timezone);
  return (
    <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add ${city.name}`}>
      <View style={{ minHeight: 56, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.surfaceHover, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
        <Text style={{ fontSize: 24 }}>{city.flag}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[font.bodyBold, { color: colors.text, fontSize: 14.5 }]} numberOfLines={1}>{city.name}</Text>
          <Text style={[font.body, { color: colors.textMuted, fontSize: 11.5 }]} numberOfLines={1}>{city.region} · {city.timezone}</Text>
        </View>
        <Text style={[font.display, { color: colors.text, fontSize: 20 }]}>{clock.time.slice(0, 5)}</Text>
      </View>
    </Pressable>
  );
}

function CityCard({ city, weather, onRemove }: { city: WorldClockCity; weather?: WeatherSnapshot | null; onRemove: () => void }) {
  const { colors, font } = useTheme();
  const clock = getTimeInZone(city.timezone);
  const day = clock.hour >= 6 && clock.hour < 20;
  const tone = day ? '#B08536' : '#5E748B';
  return (
    <GlassPanel variant="medium" borderRadius={22} contentStyle={{ padding: 15 }} style={{ borderColor: `${tone}2F` }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: 17, backgroundColor: `${tone}1F`, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 25 }}>{city.flag}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 16, flexShrink: 1 }]} numberOfLines={1}>{city.name}</Text>
            <View style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: `${tone}18` }}>
              <Text style={{ color: tone, fontSize: 10.2, fontFamily: 'Inter_700Bold' }}>{timeOfDay(clock.hour)}</Text>
            </View>
          </View>
          <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]} numberOfLines={1}>{clock.date} · {city.region}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7 }}>
            <WeatherInline snapshot={weather} />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 7 }}>
          <Text style={[font.display, { color: colors.text, fontSize: 29, lineHeight: 34 }]}>{clock.time.slice(0, 5)}</Text>
          <Text style={[font.body, { color: colors.textMuted, fontSize: 10.5 }]}>{clock.time.slice(6)}</Text>
        </View>
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${city.name}`}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
            <X color={colors.textMuted} size={13} weight="bold" />
          </View>
        </Pressable>
      </View>
    </GlassPanel>
  );
}

function WeatherInline({ snapshot }: { snapshot?: WeatherSnapshot | null }) {
  const { colors, font } = useTheme();
  if (!snapshot) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <CloudSun color={colors.textMuted} size={14} />
        <Text style={[font.body, { color: colors.textMuted, fontSize: 11.5 }]}>Weather unavailable</Text>
      </View>
    );
  }
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {weatherIcon(snapshot.code, colors.accent, 14)}
        <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 11.5 }]}>
          {Math.round(snapshot.temperature)}° · {snapshot.label}
        </Text>
      </View>
      <Text style={[font.body, { color: colors.textMuted, fontSize: 11.5 }]}>{Math.round(snapshot.windSpeed)} km/h</Text>
    </>
  );
}
