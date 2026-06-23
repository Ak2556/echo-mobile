import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import type { CurrencyCode } from './currency';

export type ListingCondition = 'New' | 'Like new' | 'Good' | 'Service';
export type ListingStatus = 'active' | 'sold' | 'paused' | 'removed';

export const LISTING_CATEGORIES = [
  'All',
  'Books & Learning',
  'Tech & Gear',
  'Workspace',
  'Creative',
  'Services',
  'Clothing',
  'Home',
  'Other',
] as const;

export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export const LISTING_CONDITIONS: ListingCondition[] = [
  'New', 'Like new', 'Good', 'Service',
];

export interface ListingWithSeller {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerUsername: string;
  sellerAvatarColor: string;
  sellerAvatarUrl: string | null;
  sellerIsVerified: boolean;
  title: string;
  description: string;
  price: number;
  currency: CurrencyCode;
  category: string;
  condition: ListingCondition;
  photoUrls: string[];
  tags: string[];
  locationLabel: string;
  fulfillment: string;
  status: ListingStatus;
  createdAt: string;
}

const SELECT = `
  id, seller_id, title, description, price, currency, category, condition,
  photo_urls, tags, location_label, fulfillment, status, created_at,
  profiles!seller_id ( display_name, username, avatar_color, avatar_url, is_verified )
`;

function mapRow(r: any): ListingWithSeller {
  const p = Array.isArray(r.profiles) ? r.profiles[0] : (r.profiles ?? {});
  return {
    id: r.id,
    sellerId: r.seller_id,
    sellerName: p.display_name ?? 'Unknown',
    sellerUsername: p.username ?? 'user',
    sellerAvatarColor: p.avatar_color ?? '#6366F1',
    sellerAvatarUrl: p.avatar_url ?? null,
    sellerIsVerified: p.is_verified ?? false,
    title: r.title,
    description: r.description ?? '',
    price: typeof r.price === 'string' ? parseFloat(r.price) : (r.price ?? 0),
    currency: (r.currency ?? 'INR') as CurrencyCode,
    category: r.category ?? 'Other',
    condition: (r.condition ?? 'Good') as ListingCondition,
    photoUrls: r.photo_urls ?? [],
    tags: r.tags ?? [],
    locationLabel: r.location_label ?? '',
    fulfillment: r.fulfillment ?? '',
    status: (r.status ?? 'active') as ListingStatus,
    createdAt: r.created_at,
  };
}

export async function fetchListings(opts?: {
  category?: string;
  query?: string;
  limit?: number;
}): Promise<ListingWithSeller[]> {
  let q = supabase
    .from('marketplace_listings')
    .select(SELECT)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 60);

  if (opts?.category && opts.category !== 'All') {
    q = q.eq('category', opts.category);
  }
  if (opts?.query?.trim()) {
    const term = opts.query.trim().replace(/[%_\\]/g, '\\$&');
    q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function fetchListing(id: string): Promise<ListingWithSeller | null> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function fetchMyListings(): Promise<ListingWithSeller[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select(SELECT)
    .eq('seller_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createListing(params: {
  title: string;
  description: string;
  price: number;
  currency: CurrencyCode;
  category: string;
  condition: ListingCondition;
  photoUrls: string[];
  tags: string[];
  locationLabel: string;
  fulfillment: string;
}): Promise<ListingWithSeller> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('marketplace_listings')
    .insert({
      seller_id: user.id,
      title: params.title.trim(),
      description: params.description.trim() || null,
      price: params.price,
      currency: params.currency,
      category: params.category,
      condition: params.condition,
      photo_urls: params.photoUrls,
      tags: params.tags,
      location_label: params.locationLabel.trim() || null,
      fulfillment: params.fulfillment.trim() || null,
    })
    .select(SELECT)
    .single();

  if (error) throw error;
  return mapRow(data);
}

export async function updateListingStatus(id: string, status: ListingStatus): Promise<void> {
  const { error } = await supabase
    .from('marketplace_listings')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

/** Upload up to 6 images to the marketplace-photos bucket. */
export async function uploadListingImages(uris: string[]): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const urls: string[] = [];
  for (let i = 0; i < Math.min(uris.length, 6); i++) {
    const uri = uris[i];
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext) ? ext : 'jpg';
    const path = `${user.id}/${Date.now()}_${i}.${safeExt}`;

    const { data: signed, error: signedErr } = await supabase.storage
      .from('marketplace-photos')
      .createSignedUploadUrl(path);
    if (signedErr) throw signedErr;

    const result = await FileSystem.uploadAsync(signed.signedUrl, uri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'content-type': `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`,
        'cache-control': 'max-age=31536000',
      },
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Photo upload failed (${result.status})`);
    }

    const { data } = supabase.storage.from('marketplace-photos').getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}
