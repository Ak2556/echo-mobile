import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  Calculator, NotePencil, ArrowsLeftRight, DiceFive, Globe, ListChecks,
  ShoppingCart, TextAa, Code, Palette, Key, Receipt, Wallet, CalendarBlank,
  Scales, Repeat, type Icon,
} from 'phosphor-react-native';

/**
 * Registry of mini-apps that can ride in the floating layer. Each entry lazily
 * imports the existing route screen and renders it inside the floating panel —
 * we only *render* these screens, never edit them, so this stays conflict-free
 * with the mini-app platform work happening elsewhere.
 *
 * Curated to the self-contained tools that embed cleanly (media/camera apps and
 * the heaviest screens are intentionally left to their full-screen route).
 */

export interface FloatingAppMeta {
  id: string;
  name: string;
  Icon: Icon;
  Component: LazyExoticComponent<ComponentType>;
}

export const FLOATING_APPS: FloatingAppMeta[] = [
  { id: 'calculator', name: 'Calculator', Icon: Calculator, Component: lazy(() => import('../app/mini-apps/calculator')) },
  { id: 'notes', name: 'Notes', Icon: NotePencil, Component: lazy(() => import('../app/mini-apps/notes')) },
  { id: 'converter', name: 'Converter', Icon: ArrowsLeftRight, Component: lazy(() => import('../app/mini-apps/converter')) },
  { id: 'tasks', name: 'Tasks', Icon: ListChecks, Component: lazy(() => import('../app/mini-apps/tasks')) },
  { id: 'shopping-list', name: 'Shopping', Icon: ShoppingCart, Component: lazy(() => import('../app/mini-apps/shopping-list')) },
  { id: 'world-clock', name: 'World Clock', Icon: Globe, Component: lazy(() => import('../app/mini-apps/world-clock')) },
  { id: 'dice', name: 'Dice', Icon: DiceFive, Component: lazy(() => import('../app/mini-apps/dice')) },
  { id: 'markdown', name: 'Markdown', Icon: TextAa, Component: lazy(() => import('../app/mini-apps/markdown')) },
  { id: 'json-formatter', name: 'JSON', Icon: Code, Component: lazy(() => import('../app/mini-apps/json-formatter')) },
  { id: 'color-tools', name: 'Colors', Icon: Palette, Component: lazy(() => import('../app/mini-apps/color-tools')) },
  { id: 'password-gen', name: 'Passwords', Icon: Key, Component: lazy(() => import('../app/mini-apps/password-gen')) },
  { id: 'bill-splitter', name: 'Bill Split', Icon: Receipt, Component: lazy(() => import('../app/mini-apps/bill-splitter')) },
  { id: 'expenses', name: 'Expenses', Icon: Wallet, Component: lazy(() => import('../app/mini-apps/expenses')) },
  { id: 'planner', name: 'Planner', Icon: CalendarBlank, Component: lazy(() => import('../app/mini-apps/planner')) },
  { id: 'bmi', name: 'BMI', Icon: Scales, Component: lazy(() => import('../app/mini-apps/bmi')) },
  { id: 'habits', name: 'Habits', Icon: Repeat, Component: lazy(() => import('../app/mini-apps/habits')) },
];

export function floatingAppMeta(id: string | null): FloatingAppMeta | undefined {
  return id ? FLOATING_APPS.find(a => a.id === id) : undefined;
}
