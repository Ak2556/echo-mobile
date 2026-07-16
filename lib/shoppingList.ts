import AsyncStorage from '@react-native-async-storage/async-storage';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';

export const SHOPPING_LIST_KEY = 'mini:shopping-list';

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: string;
  category: string;
  checked: boolean;
  createdAt: string;
}

export const SHOPPING_CATEGORIES = ['Produce', 'Protein', 'Pantry', 'Home', 'Personal', 'Other'];

function normalize(raw: unknown): ShoppingItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Partial<ShoppingItem> => !!item && typeof item === 'object')
    .map(item => ({
      id: typeof item.id === 'string' ? item.id : `${Date.now()}`,
      name: typeof item.name === 'string' ? item.name : '',
      quantity: typeof item.quantity === 'string' ? item.quantity : '1',
      category: typeof item.category === 'string' && item.category ? item.category : 'Other',
      checked: item.checked === true,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    }))
    .filter(item => item.name.trim());
}

export async function loadShoppingList(): Promise<ShoppingItem[]> {
  const remote = await pullMiniAppIfNewer('shopping-list');
  if (Array.isArray(remote)) {
    const next = normalize(remote);
    await AsyncStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify(next));
    return next;
  }
  try {
    return normalize(JSON.parse((await AsyncStorage.getItem(SHOPPING_LIST_KEY)) ?? '[]'));
  } catch {
    return [];
  }
}

export async function saveShoppingList(items: ShoppingItem[]): Promise<void> {
  const sorted = items.slice().sort((a, b) =>
    Number(a.checked) - Number(b.checked) ||
    a.category.localeCompare(b.category) ||
    b.createdAt.localeCompare(a.createdAt));
  await AsyncStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify(sorted));
  pushMiniApp('shopping-list', sorted);
}

export function shoppingStats(items: ShoppingItem[]) {
  const remaining = items.filter(item => !item.checked);
  return {
    total: items.length,
    remaining: remaining.length,
    checked: items.length - remaining.length,
    categories: new Set(remaining.map(item => item.category)).size,
  };
}
