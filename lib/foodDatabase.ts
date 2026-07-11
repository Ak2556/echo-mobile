// Built-in food database for the Fitness mini-app. Curated, offline, no API.
// Values are per listed serving (approximate, rounded — good enough for
// day-to-day logging). Indian staples first-class alongside global basics.

export interface FoodItem {
  id: string;
  name: string;
  /** human serving label, e.g. "1 roti", "100 g", "1 cup" */
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const FOOD_DB: FoodItem[] = [
  // ── Indian staples ──
  { id: 'roti', name: 'Roti / Chapati', serving: '1 medium', calories: 100, protein: 3, carbs: 18, fat: 2 },
  { id: 'paratha', name: 'Plain Paratha', serving: '1 medium', calories: 180, protein: 4, carbs: 25, fat: 7 },
  { id: 'aloo-paratha', name: 'Aloo Paratha', serving: '1 medium', calories: 250, protein: 5, carbs: 35, fat: 10 },
  { id: 'naan', name: 'Butter Naan', serving: '1 piece', calories: 260, protein: 7, carbs: 40, fat: 8 },
  { id: 'rice-cooked', name: 'Rice (cooked)', serving: '1 cup', calories: 200, protein: 4, carbs: 45, fat: 0.5 },
  { id: 'jeera-rice', name: 'Jeera Rice', serving: '1 cup', calories: 250, protein: 4, carbs: 46, fat: 6 },
  { id: 'biryani-chicken', name: 'Chicken Biryani', serving: '1 plate', calories: 480, protein: 25, carbs: 55, fat: 17 },
  { id: 'biryani-veg', name: 'Veg Biryani', serving: '1 plate', calories: 400, protein: 9, carbs: 60, fat: 13 },
  { id: 'dal-tadka', name: 'Dal Tadka', serving: '1 bowl', calories: 180, protein: 9, carbs: 22, fat: 6 },
  { id: 'dal-makhani', name: 'Dal Makhani', serving: '1 bowl', calories: 280, protein: 11, carbs: 25, fat: 15 },
  { id: 'chole', name: 'Chole (chickpea curry)', serving: '1 bowl', calories: 250, protein: 11, carbs: 32, fat: 9 },
  { id: 'rajma', name: 'Rajma', serving: '1 bowl', calories: 230, protein: 12, carbs: 30, fat: 7 },
  { id: 'paneer-butter', name: 'Paneer Butter Masala', serving: '1 bowl', calories: 350, protein: 14, carbs: 12, fat: 27 },
  { id: 'palak-paneer', name: 'Palak Paneer', serving: '1 bowl', calories: 280, protein: 13, carbs: 10, fat: 21 },
  { id: 'paneer-raw', name: 'Paneer (raw)', serving: '100 g', calories: 265, protein: 18, carbs: 4, fat: 20 },
  { id: 'chicken-curry', name: 'Chicken Curry', serving: '1 bowl', calories: 280, protein: 25, carbs: 8, fat: 16 },
  { id: 'butter-chicken', name: 'Butter Chicken', serving: '1 bowl', calories: 430, protein: 27, carbs: 12, fat: 30 },
  { id: 'egg-curry', name: 'Egg Curry (2 eggs)', serving: '1 bowl', calories: 250, protein: 14, carbs: 8, fat: 18 },
  { id: 'idli', name: 'Idli', serving: '2 pieces', calories: 120, protein: 4, carbs: 25, fat: 0.5 },
  { id: 'dosa', name: 'Masala Dosa', serving: '1 piece', calories: 330, protein: 6, carbs: 50, fat: 11 },
  { id: 'sambar', name: 'Sambar', serving: '1 bowl', calories: 130, protein: 6, carbs: 18, fat: 4 },
  { id: 'poha', name: 'Poha', serving: '1 plate', calories: 250, protein: 5, carbs: 45, fat: 6 },
  { id: 'upma', name: 'Upma', serving: '1 plate', calories: 230, protein: 6, carbs: 38, fat: 7 },
  { id: 'khichdi', name: 'Khichdi', serving: '1 bowl', calories: 210, protein: 8, carbs: 35, fat: 5 },
  { id: 'curd', name: 'Curd / Dahi', serving: '1 cup', calories: 100, protein: 6, carbs: 8, fat: 5 },
  { id: 'raita', name: 'Raita', serving: '1 bowl', calories: 80, protein: 4, carbs: 7, fat: 4 },
  { id: 'samosa', name: 'Samosa', serving: '1 piece', calories: 260, protein: 4, carbs: 28, fat: 15 },
  { id: 'pakora', name: 'Pakora', serving: '5 pieces', calories: 230, protein: 5, carbs: 20, fat: 15 },
  { id: 'pav-bhaji', name: 'Pav Bhaji', serving: '1 plate', calories: 400, protein: 10, carbs: 55, fat: 16 },
  { id: 'chai', name: 'Chai (with milk & sugar)', serving: '1 cup', calories: 90, protein: 2, carbs: 12, fat: 3.5 },
  { id: 'lassi', name: 'Sweet Lassi', serving: '1 glass', calories: 220, protein: 6, carbs: 32, fat: 8 },
  { id: 'gulab-jamun', name: 'Gulab Jamun', serving: '1 piece', calories: 150, protein: 2, carbs: 22, fat: 6 },
  { id: 'jalebi', name: 'Jalebi', serving: '2 pieces', calories: 200, protein: 1, carbs: 32, fat: 8 },

  // ── Proteins ──
  { id: 'chicken-breast', name: 'Chicken Breast (grilled)', serving: '100 g', calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { id: 'chicken-thigh', name: 'Chicken Thigh (cooked)', serving: '100 g', calories: 210, protein: 26, carbs: 0, fat: 11 },
  { id: 'egg-boiled', name: 'Egg (boiled)', serving: '1 large', calories: 78, protein: 6, carbs: 0.6, fat: 5 },
  { id: 'egg-omelette', name: 'Omelette (2 eggs)', serving: '1 serving', calories: 220, protein: 14, carbs: 2, fat: 17 },
  { id: 'fish-grilled', name: 'Fish (grilled)', serving: '100 g', calories: 150, protein: 25, carbs: 0, fat: 5 },
  { id: 'mutton', name: 'Mutton (cooked)', serving: '100 g', calories: 260, protein: 25, carbs: 0, fat: 17 },
  { id: 'tofu', name: 'Tofu', serving: '100 g', calories: 76, protein: 8, carbs: 2, fat: 4.5 },
  { id: 'soya-chunks', name: 'Soya Chunks (dry)', serving: '50 g', calories: 170, protein: 26, carbs: 15, fat: 0.5 },
  { id: 'whey', name: 'Whey Protein (1 scoop)', serving: '30 g', calories: 120, protein: 24, carbs: 3, fat: 1.5 },
  { id: 'sprouts', name: 'Moong Sprouts', serving: '1 cup', calories: 60, protein: 6, carbs: 12, fat: 0.3 },

  // ── Dairy & breakfast ──
  { id: 'milk-full', name: 'Milk (full fat)', serving: '1 glass (250 ml)', calories: 150, protein: 8, carbs: 12, fat: 8 },
  { id: 'milk-toned', name: 'Milk (toned)', serving: '1 glass (250 ml)', calories: 120, protein: 8, carbs: 12, fat: 4 },
  { id: 'oats', name: 'Oats (with milk)', serving: '1 bowl', calories: 220, protein: 9, carbs: 34, fat: 6 },
  { id: 'muesli', name: 'Muesli', serving: '1 bowl', calories: 250, protein: 8, carbs: 42, fat: 6 },
  { id: 'cornflakes', name: 'Cornflakes (with milk)', serving: '1 bowl', calories: 200, protein: 6, carbs: 38, fat: 3 },
  { id: 'bread-white', name: 'Bread (white)', serving: '2 slices', calories: 140, protein: 5, carbs: 26, fat: 2 },
  { id: 'bread-brown', name: 'Bread (brown)', serving: '2 slices', calories: 130, protein: 6, carbs: 24, fat: 2 },
  { id: 'peanut-butter', name: 'Peanut Butter', serving: '1 tbsp', calories: 95, protein: 4, carbs: 3, fat: 8 },
  { id: 'ghee', name: 'Ghee', serving: '1 tsp', calories: 45, protein: 0, carbs: 0, fat: 5 },
  { id: 'cheese-slice', name: 'Cheese Slice', serving: '1 slice', calories: 70, protein: 4, carbs: 1, fat: 5.5 },

  // ── Fruits & veg ──
  { id: 'banana', name: 'Banana', serving: '1 medium', calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  { id: 'apple', name: 'Apple', serving: '1 medium', calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
  { id: 'mango', name: 'Mango', serving: '1 cup', calories: 100, protein: 1.4, carbs: 25, fat: 0.6 },
  { id: 'orange', name: 'Orange', serving: '1 medium', calories: 62, protein: 1.2, carbs: 15, fat: 0.2 },
  { id: 'grapes', name: 'Grapes', serving: '1 cup', calories: 100, protein: 1, carbs: 27, fat: 0.2 },
  { id: 'papaya', name: 'Papaya', serving: '1 cup', calories: 55, protein: 0.9, carbs: 14, fat: 0.2 },
  { id: 'pomegranate', name: 'Pomegranate', serving: '1 cup', calories: 145, protein: 3, carbs: 33, fat: 2 },
  { id: 'cucumber-salad', name: 'Cucumber Salad', serving: '1 bowl', calories: 30, protein: 1.5, carbs: 6, fat: 0.2 },
  { id: 'mixed-veg', name: 'Mixed Veg Sabzi', serving: '1 bowl', calories: 150, protein: 4, carbs: 15, fat: 8 },
  { id: 'aloo-sabzi', name: 'Aloo Sabzi', serving: '1 bowl', calories: 190, protein: 3, carbs: 28, fat: 8 },
  { id: 'bhindi', name: 'Bhindi Fry', serving: '1 bowl', calories: 150, protein: 3, carbs: 12, fat: 10 },

  // ── Nuts & snacks ──
  { id: 'almonds', name: 'Almonds', serving: '10 pieces', calories: 70, protein: 2.6, carbs: 2.5, fat: 6 },
  { id: 'cashews', name: 'Cashews', serving: '10 pieces', calories: 90, protein: 3, carbs: 5, fat: 7 },
  { id: 'peanuts-roasted', name: 'Peanuts (roasted)', serving: '30 g', calories: 170, protein: 8, carbs: 5, fat: 14 },
  { id: 'walnuts', name: 'Walnuts', serving: '4 halves', calories: 105, protein: 2.4, carbs: 2, fat: 10 },
  { id: 'makhana', name: 'Makhana (roasted)', serving: '1 cup', calories: 106, protein: 3, carbs: 20, fat: 0.5 },
  { id: 'biscuits-marie', name: 'Marie Biscuits', serving: '4 pieces', calories: 110, protein: 2, carbs: 20, fat: 3 },
  { id: 'chips', name: 'Potato Chips', serving: '1 small pack (30 g)', calories: 160, protein: 2, carbs: 15, fat: 10 },
  { id: 'dark-chocolate', name: 'Dark Chocolate', serving: '2 squares (20 g)', calories: 110, protein: 1.5, carbs: 9, fat: 8 },

  // ── Global mains ──
  { id: 'pasta', name: 'Pasta (with sauce)', serving: '1 plate', calories: 380, protein: 12, carbs: 58, fat: 11 },
  { id: 'pizza-slice', name: 'Pizza', serving: '1 slice', calories: 280, protein: 11, carbs: 33, fat: 11 },
  { id: 'burger-veg', name: 'Veg Burger', serving: '1 burger', calories: 350, protein: 9, carbs: 45, fat: 15 },
  { id: 'burger-chicken', name: 'Chicken Burger', serving: '1 burger', calories: 420, protein: 22, carbs: 42, fat: 18 },
  { id: 'sandwich-veg', name: 'Veg Sandwich (grilled)', serving: '1 sandwich', calories: 260, protein: 8, carbs: 36, fat: 9 },
  { id: 'fried-rice', name: 'Veg Fried Rice', serving: '1 plate', calories: 350, protein: 7, carbs: 55, fat: 11 },
  { id: 'noodles', name: 'Hakka Noodles', serving: '1 plate', calories: 400, protein: 9, carbs: 58, fat: 14 },
  { id: 'momos-veg', name: 'Momos (veg, steamed)', serving: '6 pieces', calories: 210, protein: 6, carbs: 36, fat: 5 },
  { id: 'french-fries', name: 'French Fries', serving: '1 medium', calories: 340, protein: 4, carbs: 44, fat: 16 },
  { id: 'salad-chicken', name: 'Chicken Salad', serving: '1 bowl', calories: 280, protein: 26, carbs: 10, fat: 15 },

  // ── Drinks ──
  { id: 'coffee-milk', name: 'Coffee (with milk & sugar)', serving: '1 cup', calories: 80, protein: 2, carbs: 10, fat: 3 },
  { id: 'coffee-black', name: 'Black Coffee', serving: '1 cup', calories: 5, protein: 0.3, carbs: 0, fat: 0 },
  { id: 'juice-orange', name: 'Orange Juice', serving: '1 glass', calories: 110, protein: 2, carbs: 26, fat: 0.5 },
  { id: 'cola', name: 'Cola', serving: '1 can (330 ml)', calories: 140, protein: 0, carbs: 39, fat: 0 },
  { id: 'coconut-water', name: 'Coconut Water', serving: '1 glass', calories: 45, protein: 1.7, carbs: 9, fat: 0.5 },
  { id: 'buttermilk', name: 'Buttermilk / Chaas', serving: '1 glass', calories: 40, protein: 2, carbs: 5, fat: 1 },
];

/** Substring search over names; empty query returns nothing. */
export function searchFoods(query: string, limit = 8): FoodItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: FoodItem[] = [];
  const contains: FoodItem[] = [];
  for (const f of FOOD_DB) {
    const name = f.name.toLowerCase();
    if (name.startsWith(q)) starts.push(f);
    else if (name.includes(q)) contains.push(f);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
