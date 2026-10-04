import AsyncStorage from '@react-native-async-storage/async-storage';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';

export const SHOPPING_LISTS_KEY = 'mini:shopping-lists';
export const SHOPPING_ITEMS_KEY = 'mini:shopping-items';
export const SHOPPING_LIST_KEY = 'mini:shopping-list'; // legacy

export interface ShoppingListInfo {
  id: string;
  name: string;
  icon?: string;
  createdAt: string;
}

export interface ShoppingItem {
  id: string;
  listId: string;
  name: string;
  quantity: string;
  price: number;
  category: string;
  checked: boolean;
  createdAt: string;
}

export const SHOPPING_CATEGORIES = ['Produce', 'Protein', 'Pantry', 'Dairy', 'Bakery', 'Frozen', 'Beverages', 'Home', 'Electronics', 'Hardware', 'Personal', 'Other'];

export const FREQUENT_ITEMS = [
  { name: 'Milk', category: 'Dairy', price: 3.99 },
  { name: 'Eggs', category: 'Dairy', price: 4.50 },
  { name: 'Bread', category: 'Bakery', price: 2.99 },
  { name: 'Apples', category: 'Produce', price: 4.00 },
  { name: 'Chicken Breast', category: 'Protein', price: 8.50 },
  { name: 'Paper Towels', category: 'Home', price: 15.00 },
  { name: 'Batteries', category: 'Electronics', price: 12.00 },
];

function normalizeItems(raw: unknown): ShoppingItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Partial<ShoppingItem> => !!item && typeof item === 'object')
    .map(item => ({
      id: typeof item.id === 'string' ? item.id : `${Date.now()}_${Math.random()}`,
      listId: typeof item.listId === 'string' ? item.listId : 'default',
      name: typeof item.name === 'string' ? item.name : '',
      quantity: typeof item.quantity === 'string' ? item.quantity : '1',
      price: typeof item.price === 'number' ? item.price : 0,
      category: typeof item.category === 'string' && item.category ? item.category : 'Other',
      checked: item.checked === true,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    }))
    .filter(item => item.name.trim());
}

function normalizeLists(raw: unknown): ShoppingListInfo[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((list): list is Partial<ShoppingListInfo> => !!list && typeof list === 'object')
    .map(list => ({
      id: typeof list.id === 'string' ? list.id : `list_${Date.now()}`,
      name: typeof list.name === 'string' ? list.name : 'List',
      icon: typeof list.icon === 'string' ? list.icon : undefined,
      createdAt: typeof list.createdAt === 'string' ? list.createdAt : new Date().toISOString(),
    }))
    .filter(list => list.name.trim());
}

export async function loadShoppingData(): Promise<{ lists: ShoppingListInfo[], items: ShoppingItem[] }> {
  try {
    const listsStr = await AsyncStorage.getItem(SHOPPING_LISTS_KEY);
    const itemsStr = await AsyncStorage.getItem(SHOPPING_ITEMS_KEY);
    
    let lists = listsStr ? normalizeLists(JSON.parse(listsStr)) : [];
    let items = itemsStr ? normalizeItems(JSON.parse(itemsStr)) : [];
    
    if (lists.length === 0 && items.length === 0) {
      // Migrate from legacy
      const legacyStr = await AsyncStorage.getItem(SHOPPING_LIST_KEY);
      if (legacyStr) {
        const legacyItems = normalizeItems(JSON.parse(legacyStr));
        if (legacyItems.length > 0) {
          lists = [{ id: 'default', name: 'Groceries', createdAt: new Date().toISOString() }];
          items = legacyItems.map(i => ({ ...i, listId: 'default', price: 0 }));
          await saveShoppingData(lists, items);
        }
      }
    }
    
    if (lists.length === 0) {
      lists = [{ id: 'default', name: 'My List', createdAt: new Date().toISOString() }];
      await saveShoppingData(lists, items);
    }
    
    return { lists, items };
  } catch {
    return { lists: [{ id: 'default', name: 'My List', createdAt: new Date().toISOString() }], items: [] };
  }
}

export async function saveShoppingData(lists: ShoppingListInfo[], items: ShoppingItem[]): Promise<void> {
  const sortedItems = items.slice().sort((a, b) =>
    Number(a.checked) - Number(b.checked) ||
    a.category.localeCompare(b.category) ||
    b.createdAt.localeCompare(a.createdAt));
  
  await AsyncStorage.setItem(SHOPPING_LISTS_KEY, JSON.stringify(lists));
  await AsyncStorage.setItem(SHOPPING_ITEMS_KEY, JSON.stringify(sortedItems));
}

export function shoppingStats(items: ShoppingItem[]) {
  const remaining = items.filter(item => !item.checked);
  const cost = remaining.reduce((acc, item) => {
    const q = parseFloat(item.quantity) || 1;
    return acc + (item.price * q);
  }, 0);
  return {
    total: items.length,
    remaining: remaining.length,
    checked: items.length - remaining.length,
    categories: new Set(remaining.map(item => item.category)).size,
    cost,
  };
}
