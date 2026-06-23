import type { PersonaProfile } from './persona';

export type MarketplaceCategory = 'Gear' | 'Workspace' | 'Learning' | 'Creative' | 'Services';
export type MarketplaceIntent = 'build' | 'learn' | 'create' | 'focus' | 'ship';
export type MarketplaceCondition = 'New' | 'Like new' | 'Good' | 'Service';

export interface MarketplaceListing {
  id: string;
  title: string;
  description: string;
  category: MarketplaceCategory;
  priceLabel: string;
  condition: MarketplaceCondition;
  sellerId: string;
  sellerName: string;
  sellerUsername: string;
  sellerAvatarColor: string;
  locationLabel: string;
  fulfillment: string;
  tags: string[];
  intents: MarketplaceIntent[];
  trustSignals: string[];
  listedAt: string;
}

export interface MarketplaceSignal {
  interests: string[];
  persona?: PersonaProfile | null;
  query?: string;
  category?: MarketplaceCategory | 'All';
}

export interface MarketplaceMatch extends MarketplaceListing {
  matchScore: number;
  matchReasons: string[];
}

export const MARKETPLACE_CATEGORIES: (MarketplaceCategory | 'All')[] = [
  'All',
  'Gear',
  'Workspace',
  'Learning',
  'Creative',
  'Services',
];

export const MARKETPLACE_LISTINGS: MarketplaceListing[] = [
  {
    id: 'm1',
    title: 'Creator desk setup bundle',
    description: 'Compact monitor arm, desk light, and cable tray for a cleaner writing or coding setup.',
    category: 'Workspace',
    priceLabel: '$86',
    condition: 'Good',
    sellerId: 'u5',
    sellerName: 'Design Dan',
    sellerUsername: 'design_lead',
    sellerAvatarColor: '#EF4444',
    locationLabel: 'Ships from Austin',
    fulfillment: 'Tracked shipping or local pickup',
    tags: ['design', 'workspace', 'focus', 'productivity'],
    intents: ['focus', 'create'],
    trustSignals: ['Seller has 56 Echoes', 'Clear condition notes', 'Echo profile verified'],
    listedAt: '2026-06-12T10:00:00Z',
  },
  {
    id: 'm2',
    title: 'AI prototyping session',
    description: 'One 45-minute peer session to map an AI idea, prompt flow, and first build plan.',
    category: 'Services',
    priceLabel: '$60',
    condition: 'Service',
    sellerId: 'u4',
    sellerName: 'ML Maya',
    sellerUsername: 'ml_engineer',
    sellerAvatarColor: '#F59E0B',
    locationLabel: 'Remote',
    fulfillment: 'Echo DM scheduling',
    tags: ['ai', 'machine learning', 'prototype', 'prompts', 'startup'],
    intents: ['build', 'learn', 'ship'],
    trustSignals: ['Verified profile', '92 Echoes', 'Remote handoff only'],
    listedAt: '2026-06-18T10:00:00Z',
  },
  {
    id: 'm3',
    title: 'Mechanical keyboard for deep work',
    description: 'Low-profile wireless keyboard with quiet switches, ideal for long writing sessions.',
    category: 'Gear',
    priceLabel: '$72',
    condition: 'Like new',
    sellerId: 'u6',
    sellerName: 'Backend Bob',
    sellerUsername: 'backend_pro',
    sellerAvatarColor: '#06B6D4',
    locationLabel: 'Ships from Seattle',
    fulfillment: 'Tracked shipping',
    tags: ['coding', 'writing', 'focus', 'productivity', 'systems'],
    intents: ['focus', 'build'],
    trustSignals: ['Serial photo requested', 'Seller has 63 Echoes', 'No off-app payment'],
    listedAt: '2026-06-15T10:00:00Z',
  },
  {
    id: 'm4',
    title: 'Design systems field notes',
    description: 'Annotated PDF pack and Figma references from a senior product designer.',
    category: 'Learning',
    priceLabel: '$24',
    condition: 'New',
    sellerId: 'u5',
    sellerName: 'Design Dan',
    sellerUsername: 'design_lead',
    sellerAvatarColor: '#EF4444',
    locationLabel: 'Digital',
    fulfillment: 'Delivered in Echo DM',
    tags: ['design', 'systems', 'figma', 'product', 'ui'],
    intents: ['learn', 'create'],
    trustSignals: ['Digital preview available', 'Creator profile verified', 'No external checkout'],
    listedAt: '2026-06-17T10:00:00Z',
  },
  {
    id: 'm5',
    title: 'Second-hand video creator kit',
    description: 'Phone tripod, small light, and clip mic for publishing sharper short-form updates.',
    category: 'Creative',
    priceLabel: '$48',
    condition: 'Good',
    sellerId: 'u3',
    sellerName: 'Echo Enthusiast',
    sellerUsername: 'echo_fan',
    sellerAvatarColor: '#8B5CF6',
    locationLabel: 'Ships from New York',
    fulfillment: 'Tracked shipping',
    tags: ['creator', 'video', 'publishing', 'story', 'content'],
    intents: ['create', 'ship'],
    trustSignals: ['Bundle photos required', 'Seller has 18 Echoes', 'Echo DM inquiry'],
    listedAt: '2026-06-14T10:00:00Z',
  },
  {
    id: 'm6',
    title: 'Startup finance review',
    description: 'Peer review for a simple model, pricing assumptions, and investor-facing metrics.',
    category: 'Services',
    priceLabel: '$90',
    condition: 'Service',
    sellerId: 'u8',
    sellerName: 'Data Dave',
    sellerUsername: 'data_dave',
    sellerAvatarColor: '#14B8A6',
    locationLabel: 'Remote',
    fulfillment: 'Echo DM scheduling',
    tags: ['startup', 'data', 'finance', 'metrics', 'pricing'],
    intents: ['ship', 'learn'],
    trustSignals: ['Scope locked before payment', 'Seller has 29 Echoes', 'No sensitive documents in chat'],
    listedAt: '2026-06-11T10:00:00Z',
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasToken(haystack: string, needle: string): boolean {
  const cleanNeedle = normalize(needle);
  if (!cleanNeedle) return false;
  return normalize(haystack).includes(cleanNeedle);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export function buildMarketplaceMatches(listings: MarketplaceListing[], signal: MarketplaceSignal): MarketplaceMatch[] {
  const persona = signal.persona;
  const personaTerms = persona?.enabled
    ? [...persona.topics, ...persona.traits, ...persona.values]
    : [];
  const interestTerms = signal.interests ?? [];
  const query = signal.query?.trim() ?? '';
  const category = signal.category ?? 'All';
  const profileTerms = unique([...interestTerms, ...personaTerms]).slice(0, 20);

  return listings
    .filter(listing => category === 'All' || listing.category === category)
    .map(listing => {
      const searchable = [
        listing.title,
        listing.description,
        listing.category,
        ...listing.tags,
        ...listing.intents,
      ].join(' ');

      if (query && !hasToken(searchable, query)) {
        return null;
      }

      let score = 42;
      const reasons: string[] = [];
      for (const term of profileTerms) {
        if (listing.tags.some(tag => hasToken(tag, term)) || hasToken(searchable, term)) {
          score += 9;
          if (reasons.length < 2) reasons.push(`Matches ${term}`);
        }
      }

      if (persona?.enabled && persona.topics.some(topic => listing.tags.some(tag => hasToken(tag, topic)))) {
        score += 12;
        reasons.push('Aligned with learned persona topics');
      }
      if (interestTerms.length === 0 && !personaTerms.length) {
        score += listing.trustSignals.length >= 3 ? 7 : 0;
        reasons.push('Curated for first-time discovery');
      }
      if (listing.condition === 'Service' && persona?.values.some(value => /build|learn|ship|create|grow/i.test(value))) {
        score += 8;
        reasons.push('Useful for your current direction');
      }
      if (query) {
        score += 10;
        reasons.push('Matches your search');
      }

      return {
        ...listing,
        matchScore: Math.max(30, Math.min(98, score)),
        matchReasons: unique(reasons).slice(0, 3),
      };
    })
    .filter((item): item is MarketplaceMatch => item !== null)
    .sort((a, b) => b.matchScore - a.matchScore || Date.parse(b.listedAt) - Date.parse(a.listedAt));
}
