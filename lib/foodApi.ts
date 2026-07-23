// Online food search via Open Food Facts (free, no API key, ~3M products).
// Results are mapped into our FoodItem shape and shown alongside the curated
// offline catalog. Best-effort: any failure (offline, timeout) just yields [].

import type { FoodItem } from './foodDatabase';

const BASE = 'https://world.openfoodfacts.org';
const UA = 'EchoApp/1.0 (fitness food logging)';

interface OFFProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r1 = (x: number): number => Math.round(x * 10) / 10;

function mapProduct(p: OFFProduct): FoodItem | null {
  const name = (p.product_name || '').trim();
  if (!name) return null;
  const nut = p.nutriments || {};
  const servingG = n(p.serving_quantity);

  // Per serving when OFF provides it, else per 100 g (scaled to the serving
  // grams when known so the numbers match the label the user sees).
  const per = (key: string): number => {
    if (nut[`${key}_serving`] != null) return n(nut[`${key}_serving`]);
    const p100 = n(nut[`${key}_100g`]);
    return servingG > 0 ? (p100 * servingG) / 100 : p100;
  };

  const calories = Math.round(per('energy-kcal'));
  if (calories <= 0) return null; // no usable energy → skip

  // sodium comes in grams; fall back to salt (salt ≈ sodium × 2.5).
  let sodiumG = per('sodium');
  if (!sodiumG) sodiumG = per('salt') / 2.5;

  const brand = (p.brands || '').split(',')[0]?.trim();
  const label = brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name;
  const serving = (p.serving_size || '').trim() || (servingG > 0 ? `${servingG} g` : '100 g');

  const fiber = r1(per('fiber'));
  const sugar = r1(per('sugars'));
  const sodium = Math.round(sodiumG * 1000);

  return {
    id: `off-${p.code || name.toLowerCase().replace(/\s+/g, '-')}`,
    name: label,
    serving,
    calories,
    protein: r1(per('proteins')),
    carbs: r1(per('carbohydrates')),
    fat: r1(per('fat')),
    ...(fiber > 0 ? { fiber } : {}),
    ...(sugar > 0 ? { sugar } : {}),
    ...(sodium > 0 ? { sodium } : {}),
    tags: ['online'],
  };
}

export async function searchOnlineFoods(query: string, signal?: AbortSignal): Promise<FoodItem[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    // CGI search does proper full-text relevance ranking; the v2 /search
    // endpoint with sort_by=popularity_key ignores the query and returns
    // generically-popular products instead of matches.
    const url =
      `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
      `&search_simple=1&action=process&json=1` +
      `&fields=code,product_name,brands,serving_size,serving_quantity,nutriments` +
      `&page_size=20`;
    const res = await fetch(url, { signal, headers: { 'User-Agent': UA } });
    if (!res.ok) return [];
    const json = await res.json();
    const products: OFFProduct[] = Array.isArray(json?.products) ? json.products : [];
    const seen = new Set<string>();
    const out: FoodItem[] = [];
    for (const p of products) {
      const item = mapProduct(p);
      if (!item) continue;
      const key = item.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= 15) break;
    }
    return out;
  } catch {
    return [];
  }
}
