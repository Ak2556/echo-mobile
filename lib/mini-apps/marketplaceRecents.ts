import AsyncStorage from '@react-native-async-storage/async-storage';

// Recently viewed marketplace listings, newest first. We store a small
// snapshot (not just the id) so the "Recently viewed" rail renders instantly
// without a refetch — and still resolves even if the listing later drops out
// of the current filter. Local-only, best-effort.

export interface RecentListing {
  id: string;
  title: string;
  price: number;
  currency: string;
  photo: string | null;
  category: string;
  condition: string;
}

const KEY = 'market:recents';
const MAX = 12;

export async function recordListingView(listing: RecentListing): Promise<void> {
  try {
    const list = await getRecentListings();
    const next = [listing, ...list.filter(l => l.id !== listing.id)].slice(0, MAX);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // recents are a convenience, never load-bearing
  }
}

export async function getRecentListings(): Promise<RecentListing[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((l): l is RecentListing => !!l && typeof l.id === 'string' && typeof l.title === 'string');
  } catch {
    return [];
  }
}

export async function clearRecentListings(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch { /* ignore */ }
}
