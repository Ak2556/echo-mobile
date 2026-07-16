import type { Href } from 'expo-router';
import { persistGet, persistSet } from '../store/persist';

export type PrimaryTabName = 'home' | 'explore' | 'marketplace' | 'chat' | 'you' | 'apps';

const LAST_TAB_KEY = 'navigation:last-primary-tab';

const TAB_ROUTES: Record<PrimaryTabName, Href> = {
  home: '/(tabs)/home',
  explore: '/(tabs)/explore',
  marketplace: '/(tabs)/marketplace',
  chat: '/(tabs)/chat',
  you: '/(tabs)/you',
  apps: '/(tabs)/apps',
};

const TAB_LABELS: Record<PrimaryTabName, string> = {
  home: 'Home',
  explore: 'Explore',
  marketplace: 'Market',
  chat: 'Chat',
  you: 'You',
  apps: 'Tools',
};

export function isPrimaryTabName(name: string): name is PrimaryTabName {
  return Object.prototype.hasOwnProperty.call(TAB_ROUTES, name);
}

export function rememberPrimaryTab(name: string): void {
  if (isPrimaryTabName(name)) persistSet(LAST_TAB_KEY, name);
}

export function getRememberedPrimaryTab(): PrimaryTabName {
  const tab = persistGet<PrimaryTabName>(LAST_TAB_KEY, 'home');
  return isPrimaryTabName(tab) ? tab : 'home';
}

export function getRememberedStartRoute(): Href {
  return TAB_ROUTES[getRememberedPrimaryTab()];
}

export function routeForPrimaryTab(name: PrimaryTabName): Href {
  return TAB_ROUTES[name];
}

export function labelForPrimaryTab(name: PrimaryTabName): string {
  return TAB_LABELS[name];
}
