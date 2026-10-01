import React from 'react';
import {
  AirplaneTilt, ArrowDown, ArrowUp, Basket, Bread, Briefcase, Car, Carrot, Egg, FilmSlate,
  FirstAidKit, ForkKnife, Gift, Laptop, Package, Receipt, ShoppingBag, Snowflake, Storefront,
  Tag, TrendUp, type IconProps,
} from 'phosphor-react-native';

/**
 * Icons for Khata categories. They were two-letter codes ("FD", "SA", "OT")
 * left over from removing emoji; a purchase logged from Shopping List
 * ("Dairy") fell through to "OT". Shopping categories map here too.
 */
const ICONS: Record<string, React.ComponentType<IconProps>> = {
  Food: ForkKnife, Transport: Car, Shopping: ShoppingBag, Health: FirstAidKit,
  Bills: Receipt, Entertainment: FilmSlate, Travel: AirplaneTilt,
  Salary: Briefcase, Freelance: Laptop, Gift, Investment: TrendUp,
  sale: Storefront, purchase: Package, receipt: ArrowDown, payment: ArrowUp,
  Produce: Carrot, Protein: Egg, Dairy: Basket, Bakery: Bread, Frozen: Snowflake, Pantry: Basket,
};

export function MoneyCategoryIcon({ category, color, size = 18 }: { category: string; color: string; size?: number }) {
  const Icon = ICONS[category] ?? Tag;
  return <Icon color={color} size={size} weight="bold" />;
}
