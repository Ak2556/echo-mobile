import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  Calculator, NotePencil, ArrowsLeftRight, DiceFive, Globe, ListChecks,
  ShoppingCart, TextAa, Code, Palette, Key, Receipt, Wallet, CalendarBlank,
  Scales, Repeat, ImageSquare, type Icon,
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
  /** Fallback tile colour for tools not in the productivity catalog (which
   *  supplies its own colour). Warm-palette hues so each reads distinctly. */
  color?: string;
}

export const FLOATING_APPS: FloatingAppMeta[] = [
  { id: 'calculator', name: 'Calculator', Icon: Calculator, Component: lazy(() => import('../app/mini-apps/calculator')) },
  { id: 'notes', name: 'Notes', Icon: NotePencil, Component: lazy(() => import('../app/mini-apps/notes')) },
  { id: 'converter', name: 'Converter', Icon: ArrowsLeftRight, color: '#4E7A8B', Component: lazy(() => import('../app/mini-apps/converter')) },
  { id: 'tasks', name: 'Tasks', Icon: ListChecks, Component: lazy(() => import('../app/mini-apps/tasks')) },
  { id: 'shopping-list', name: 'Shopping', Icon: ShoppingCart, Component: lazy(() => import('../app/mini-apps/shopping-list')) },
  { id: 'world-clock', name: 'World Clock', Icon: Globe, Component: lazy(() => import('../app/mini-apps/world-clock')) },
  { id: 'dice', name: 'Dice', Icon: DiceFive, color: '#8B5E7D', Component: lazy(() => import('../app/mini-apps/dice')) },
  { id: 'markdown', name: 'Markdown', Icon: TextAa, Component: lazy(() => import('../app/mini-apps/markdown')) },
  { id: 'json-formatter', name: 'JSON', Icon: Code, color: '#5E748B', Component: lazy(() => import('../app/mini-apps/json-formatter')) },
  { id: 'color-tools', name: 'Colors', Icon: Palette, color: '#B35D6B', Component: lazy(() => import('../app/mini-apps/color-tools')) },
  { id: 'password-gen', name: 'Passwords', Icon: Key, Component: lazy(() => import('../app/mini-apps/password-gen')) },
  { id: 'bill-splitter', name: 'Bill Split', Icon: Receipt, color: '#8B6F4E', Component: lazy(() => import('../app/mini-apps/bill-splitter')) },
  { id: 'expenses', name: 'Expenses', Icon: Wallet, Component: lazy(() => import('../app/mini-apps/expenses')) },
  { id: 'planner', name: 'Planner', Icon: CalendarBlank, Component: lazy(() => import('../app/mini-apps/planner')) },
  { id: 'bmi', name: 'BMI', Icon: Scales, color: '#4E8B7A', Component: lazy(() => import('../app/mini-apps/bmi')) },
  { id: 'habits', name: 'Habits', Icon: Repeat, Component: lazy(() => import('../app/mini-apps/habits')) },
  { id: 'image-editor', name: 'Image Editor', Icon: ImageSquare, Component: lazy(() => import('../app/mini-apps/image-editor')) },
];

export function floatingAppMeta(id: string | null): FloatingAppMeta | undefined {
  return id ? FLOATING_APPS.find(a => a.id === id) : undefined;
}
