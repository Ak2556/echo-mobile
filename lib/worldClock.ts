import AsyncStorage from '@react-native-async-storage/async-storage';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';

export const WORLD_CLOCK_KEY = 'mini:world-clock';

export interface WorldClockCity {
  id: string;
  name: string;
  timezone: string;
  region: string;
  countryCode?: string;
  flag: string;
  latitude?: number;
  longitude?: number;
  source?: 'preset' | 'search' | 'local';
}

export interface WeatherSnapshot {
  temperature: number;
  windSpeed: number;
  code: number;
  label: string;
  fetchedAt: string;
}

export const PRESET_CITIES: WorldClockCity[] = [
  city('new-york', 'New York', 'America/New_York', 'EST', 'US', 40.7128, -74.0060),
  city('los-angeles', 'Los Angeles', 'America/Los_Angeles', 'PST', 'US', 34.0522, -118.2437),
  city('london', 'London', 'Europe/London', 'GMT', 'GB', 51.5072, -0.1276),
  city('paris', 'Paris', 'Europe/Paris', 'CET', 'FR', 48.8566, 2.3522),
  city('dubai', 'Dubai', 'Asia/Dubai', 'GST', 'AE', 25.2048, 55.2708),
  city('mumbai', 'Mumbai', 'Asia/Kolkata', 'IST', 'IN', 19.0760, 72.8777),
  city('singapore', 'Singapore', 'Asia/Singapore', 'SGT', 'SG', 1.3521, 103.8198),
  city('tokyo', 'Tokyo', 'Asia/Tokyo', 'JST', 'JP', 35.6762, 139.6503),
  city('beijing', 'Beijing', 'Asia/Shanghai', 'CST', 'CN', 39.9042, 116.4074),
  city('seoul', 'Seoul', 'Asia/Seoul', 'KST', 'KR', 37.5665, 126.9780),
  city('sydney', 'Sydney', 'Australia/Sydney', 'AEST', 'AU', -33.8688, 151.2093),
  city('sao-paulo', 'Sao Paulo', 'America/Sao_Paulo', 'BRT', 'BR', -23.5558, -46.6396),
  city('toronto', 'Toronto', 'America/Toronto', 'EST', 'CA', 43.6532, -79.3832),
  city('cairo', 'Cairo', 'Africa/Cairo', 'EET', 'EG', 30.0444, 31.2357),
  city('istanbul', 'Istanbul', 'Europe/Istanbul', 'TRT', 'TR', 41.0082, 28.9784),
  city('bangkok', 'Bangkok', 'Asia/Bangkok', 'ICT', 'TH', 13.7563, 100.5018),
  city('hong-kong', 'Hong Kong', 'Asia/Hong_Kong', 'HKT', 'HK', 22.3193, 114.1694),
  city('berlin', 'Berlin', 'Europe/Berlin', 'CET', 'DE', 52.5200, 13.4050),
  city('mexico-city', 'Mexico City', 'America/Mexico_City', 'CST', 'MX', 19.4326, -99.1332),
  city('chicago', 'Chicago', 'America/Chicago', 'CST', 'US', 41.8781, -87.6298),
];

const DEFAULT_IDS = ['new-york', 'london', 'dubai', 'tokyo'];

function city(id: string, name: string, timezone: string, region: string, countryCode: string, latitude: number, longitude: number): WorldClockCity {
  return { id, name, timezone, region, countryCode, flag: flagFromCountryCode(countryCode), latitude, longitude, source: 'preset' };
}

export function defaultWorldClockCities(): WorldClockCity[] {
  return DEFAULT_IDS.map(id => PRESET_CITIES.find(city => city.id === id)).filter((item): item is WorldClockCity => Boolean(item));
}

function normalize(raw: unknown): WorldClockCity[] {
  if (!Array.isArray(raw)) return defaultWorldClockCities();
  const next = raw
    .filter((item): item is Partial<WorldClockCity> => !!item && typeof item === 'object')
    .map(item => {
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const timezone = typeof item.timezone === 'string' && item.timezone ? item.timezone : 'UTC';
      const countryCode = typeof item.countryCode === 'string' ? item.countryCode.toUpperCase() : undefined;
      return {
        id: typeof item.id === 'string' && item.id ? item.id : slug(`${name}-${timezone}`),
        name,
        timezone,
        region: typeof item.region === 'string' && item.region ? item.region : timezone.split('/').pop()?.replace(/_/g, ' ') ?? 'UTC',
        countryCode,
        flag: typeof item.flag === 'string' && item.flag ? item.flag : flagFromCountryCode(countryCode),
        latitude: typeof item.latitude === 'number' ? item.latitude : undefined,
        longitude: typeof item.longitude === 'number' ? item.longitude : undefined,
        source: item.source === 'search' || item.source === 'local' ? item.source : 'preset' as const,
      };
    })
    .filter(item => item.name);
  return next.length ? dedupeCities(next) : defaultWorldClockCities();
}

function dedupeCities(cities: WorldClockCity[]): WorldClockCity[] {
  const seen = new Set<string>();
  const next: WorldClockCity[] = [];
  for (const city of cities) {
    const key = `${city.name.toLowerCase()}-${city.timezone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(city);
  }
  return next;
}

export async function loadWorldClockCities(): Promise<WorldClockCity[]> {
  const remote = await pullMiniAppIfNewer('world-clock');
  if (Array.isArray(remote)) {
    const next = normalize(remote);
    await AsyncStorage.setItem(WORLD_CLOCK_KEY, JSON.stringify(next));
    return next;
  }
  try {
    return normalize(JSON.parse((await AsyncStorage.getItem(WORLD_CLOCK_KEY)) ?? 'null'));
  } catch {
    return defaultWorldClockCities();
  }
}

export async function saveWorldClockCities(cities: WorldClockCity[]): Promise<void> {
  const next = dedupeCities(cities);
  await AsyncStorage.setItem(WORLD_CLOCK_KEY, JSON.stringify(next));
  pushMiniApp('world-clock', next);
}

export async function searchWorldClockLocations(query: string): Promise<WorldClockCity[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const local = PRESET_CITIES.filter(city =>
    city.name.toLowerCase().includes(q.toLowerCase()) ||
    city.region.toLowerCase().includes(q.toLowerCase()) ||
    city.timezone.toLowerCase().includes(q.toLowerCase()));
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return local.slice(0, 8);
    const json = await res.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    const remote = results.map((item: any): WorldClockCity | null => {
      if (!item?.name || !item?.timezone) return null;
      const countryCode = typeof item.country_code === 'string' ? item.country_code.toUpperCase() : undefined;
      const admin = [item.admin1, item.country].filter(Boolean).join(', ');
      return {
        id: slug(`${item.id ?? item.name}-${item.timezone}`),
        name: String(item.name),
        timezone: String(item.timezone),
        region: admin || String(item.timezone).split('/').pop()?.replace(/_/g, ' ') || 'Search',
        countryCode,
        flag: flagFromCountryCode(countryCode),
        latitude: typeof item.latitude === 'number' ? item.latitude : undefined,
        longitude: typeof item.longitude === 'number' ? item.longitude : undefined,
        source: 'search',
      };
    }).filter((item: WorldClockCity | null): item is WorldClockCity => Boolean(item));
    return dedupeCities([...local, ...remote]).slice(0, 8);
  } catch {
    return local.slice(0, 8);
  }
}

export async function fetchCityWeather(city: WorldClockCity): Promise<WeatherSnapshot | null> {
  if (typeof city.latitude !== 'number' || typeof city.longitude !== 'number') return null;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const current = json?.current;
    if (!current) return null;
    const code = Number(current.weather_code ?? 0);
    return {
      temperature: Number(current.temperature_2m ?? 0),
      windSpeed: Number(current.wind_speed_10m ?? 0),
      code,
      label: weatherLabel(code),
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Cloudy';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Storm';
  return 'Weather';
}

export function flagFromCountryCode(code?: string): string {
  if (!code || code.length !== 2) return '🌐';
  const upper = code.toUpperCase();
  const first = upper.charCodeAt(0);
  const second = upper.charCodeAt(1);
  if (first < 65 || first > 90 || second < 65 || second > 90) return '🌐';
  return String.fromCodePoint(127397 + first, 127397 + second);
}

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `${Date.now()}`;
}
