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
  tags?: string[];
}

export type FoodGroupId = 'quick' | 'indian' | 'protein' | 'breakfast' | 'snacks' | 'drinks' | 'fruit' | 'global';

export const FOOD_GROUPS: { id: FoodGroupId; label: string }[] = [
  { id: 'quick', label: 'Quick' },
  { id: 'indian', label: 'Indian' },
  { id: 'protein', label: 'Protein' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'snacks', label: 'Snacks' },
  { id: 'drinks', label: 'Drinks' },
  { id: 'fruit', label: 'Fruit' },
  { id: 'global', label: 'Global' },
];

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

  // ── More Indian breads, grains & bowls ──
  { id: 'phulka', name: 'Phulka', serving: '1 medium', calories: 80, protein: 3, carbs: 16, fat: 1 },
  { id: 'bajra-roti', name: 'Bajra Roti', serving: '1 medium', calories: 120, protein: 4, carbs: 22, fat: 2 },
  { id: 'jowar-roti', name: 'Jowar Roti', serving: '1 medium', calories: 110, protein: 3.5, carbs: 22, fat: 1.5 },
  { id: 'missi-roti', name: 'Missi Roti', serving: '1 medium', calories: 170, protein: 6, carbs: 27, fat: 5 },
  { id: 'rumali-roti', name: 'Rumali Roti', serving: '1 piece', calories: 160, protein: 5, carbs: 30, fat: 3 },
  { id: 'kulcha', name: 'Kulcha', serving: '1 piece', calories: 240, protein: 7, carbs: 42, fat: 6 },
  { id: 'appam', name: 'Appam', serving: '2 pieces', calories: 180, protein: 3, carbs: 38, fat: 2 },
  { id: 'puttu', name: 'Puttu', serving: '1 cup', calories: 210, protein: 5, carbs: 46, fat: 2 },
  { id: 'lemon-rice', name: 'Lemon Rice', serving: '1 cup', calories: 270, protein: 5, carbs: 48, fat: 7 },
  { id: 'curd-rice', name: 'Curd Rice', serving: '1 cup', calories: 220, protein: 7, carbs: 36, fat: 6 },
  { id: 'pulao-veg', name: 'Veg Pulao', serving: '1 plate', calories: 360, protein: 8, carbs: 58, fat: 11 },
  { id: 'quinoa-cooked', name: 'Quinoa (cooked)', serving: '1 cup', calories: 220, protein: 8, carbs: 39, fat: 3.5 },
  { id: 'millet-khichdi', name: 'Millet Khichdi', serving: '1 bowl', calories: 240, protein: 8, carbs: 42, fat: 5 },
  { id: 'brown-rice', name: 'Brown Rice', serving: '1 cup', calories: 215, protein: 5, carbs: 45, fat: 1.8 },

  // ── Indian curries, sabzis & regional meals ──
  { id: 'moong-dal', name: 'Moong Dal', serving: '1 bowl', calories: 150, protein: 10, carbs: 22, fat: 3 },
  { id: 'masoor-dal', name: 'Masoor Dal', serving: '1 bowl', calories: 165, protein: 11, carbs: 24, fat: 3 },
  { id: 'kadhi', name: 'Kadhi', serving: '1 bowl', calories: 170, protein: 6, carbs: 16, fat: 9 },
  { id: 'baingan-bharta', name: 'Baingan Bharta', serving: '1 bowl', calories: 150, protein: 3, carbs: 14, fat: 9 },
  { id: 'gobi-sabzi', name: 'Gobi Sabzi', serving: '1 bowl', calories: 120, protein: 4, carbs: 14, fat: 6 },
  { id: 'lauki-sabzi', name: 'Lauki Sabzi', serving: '1 bowl', calories: 90, protein: 3, carbs: 10, fat: 5 },
  { id: 'matar-paneer', name: 'Matar Paneer', serving: '1 bowl', calories: 320, protein: 15, carbs: 18, fat: 22 },
  { id: 'kadai-paneer', name: 'Kadai Paneer', serving: '1 bowl', calories: 360, protein: 16, carbs: 15, fat: 26 },
  { id: 'chicken-tikka', name: 'Chicken Tikka', serving: '6 pieces', calories: 280, protein: 34, carbs: 5, fat: 13 },
  { id: 'tandoori-chicken', name: 'Tandoori Chicken', serving: '1 leg quarter', calories: 320, protein: 38, carbs: 4, fat: 16 },
  { id: 'fish-curry', name: 'Fish Curry', serving: '1 bowl', calories: 260, protein: 26, carbs: 8, fat: 14 },
  { id: 'prawn-curry', name: 'Prawn Curry', serving: '1 bowl', calories: 240, protein: 28, carbs: 8, fat: 11 },
  { id: 'thali-veg', name: 'Veg Thali', serving: '1 plate', calories: 720, protein: 22, carbs: 105, fat: 24 },
  { id: 'thali-nonveg', name: 'Non-Veg Thali', serving: '1 plate', calories: 850, protein: 42, carbs: 95, fat: 34 },
  { id: 'sattu-drink', name: 'Sattu Drink', serving: '1 glass', calories: 160, protein: 8, carbs: 28, fat: 2 },

  // ── Breakfast & light meals ──
  { id: 'plain-dosa', name: 'Plain Dosa', serving: '1 piece', calories: 170, protein: 4, carbs: 30, fat: 4 },
  { id: 'uttapam', name: 'Uttapam', serving: '1 piece', calories: 260, protein: 7, carbs: 42, fat: 8 },
  { id: 'medu-vada', name: 'Medu Vada', serving: '2 pieces', calories: 260, protein: 8, carbs: 32, fat: 11 },
  { id: 'besan-chilla', name: 'Besan Chilla', serving: '2 pieces', calories: 220, protein: 12, carbs: 26, fat: 8 },
  { id: 'moong-chilla', name: 'Moong Dal Chilla', serving: '2 pieces', calories: 210, protein: 14, carbs: 28, fat: 5 },
  { id: 'dhokla', name: 'Dhokla', serving: '4 pieces', calories: 180, protein: 7, carbs: 32, fat: 3 },
  { id: 'thepla', name: 'Thepla', serving: '2 pieces', calories: 240, protein: 7, carbs: 36, fat: 8 },
  { id: 'egg-bhurji', name: 'Egg Bhurji', serving: '2 eggs', calories: 240, protein: 15, carbs: 5, fat: 18 },
  { id: 'scrambled-eggs', name: 'Scrambled Eggs', serving: '2 eggs', calories: 200, protein: 13, carbs: 2, fat: 15 },
  { id: 'greek-yogurt', name: 'Greek Yogurt', serving: '1 cup', calories: 130, protein: 20, carbs: 8, fat: 0 },
  { id: 'overnight-oats', name: 'Overnight Oats', serving: '1 jar', calories: 320, protein: 15, carbs: 48, fat: 9 },
  { id: 'protein-smoothie', name: 'Protein Smoothie', serving: '1 glass', calories: 300, protein: 25, carbs: 35, fat: 7 },
  { id: 'avocado-toast', name: 'Avocado Toast', serving: '1 toast', calories: 260, protein: 8, carbs: 28, fat: 14 },
  { id: 'pancakes', name: 'Pancakes', serving: '2 medium', calories: 350, protein: 9, carbs: 56, fat: 10 },

  // ── Lean proteins & fitness staples ──
  { id: 'egg-white', name: 'Egg Whites', serving: '4 whites', calories: 68, protein: 14, carbs: 1, fat: 0 },
  { id: 'turkey-breast', name: 'Turkey Breast', serving: '100 g', calories: 135, protein: 30, carbs: 0, fat: 1.5 },
  { id: 'salmon', name: 'Salmon', serving: '100 g', calories: 208, protein: 22, carbs: 0, fat: 13 },
  { id: 'tuna', name: 'Tuna', serving: '100 g', calories: 132, protein: 29, carbs: 0, fat: 1 },
  { id: 'shrimp', name: 'Shrimp', serving: '100 g', calories: 99, protein: 24, carbs: 0.2, fat: 0.3 },
  { id: 'lean-beef', name: 'Lean Beef', serving: '100 g', calories: 217, protein: 26, carbs: 0, fat: 12 },
  { id: 'chickpeas-boiled', name: 'Chickpeas (boiled)', serving: '1 cup', calories: 270, protein: 15, carbs: 45, fat: 4 },
  { id: 'black-beans', name: 'Black Beans', serving: '1 cup', calories: 227, protein: 15, carbs: 41, fat: 1 },
  { id: 'lentils-boiled', name: 'Lentils (boiled)', serving: '1 cup', calories: 230, protein: 18, carbs: 40, fat: 1 },
  { id: 'tempeh', name: 'Tempeh', serving: '100 g', calories: 195, protein: 20, carbs: 8, fat: 11 },
  { id: 'cottage-cheese', name: 'Cottage Cheese', serving: '1 cup', calories: 220, protein: 28, carbs: 6, fat: 10 },
  { id: 'protein-bar', name: 'Protein Bar', serving: '1 bar', calories: 220, protein: 20, carbs: 22, fat: 7 },

  // ── Fruits, vegetables & salads ──
  { id: 'watermelon', name: 'Watermelon', serving: '2 cups', calories: 90, protein: 2, carbs: 23, fat: 0 },
  { id: 'strawberries', name: 'Strawberries', serving: '1 cup', calories: 50, protein: 1, carbs: 12, fat: 0.5 },
  { id: 'blueberries', name: 'Blueberries', serving: '1 cup', calories: 85, protein: 1, carbs: 21, fat: 0.5 },
  { id: 'kiwi', name: 'Kiwi', serving: '2 pieces', calories: 90, protein: 2, carbs: 22, fat: 1 },
  { id: 'pear', name: 'Pear', serving: '1 medium', calories: 100, protein: 1, carbs: 27, fat: 0 },
  { id: 'guava', name: 'Guava', serving: '1 medium', calories: 68, protein: 2.6, carbs: 14, fat: 1 },
  { id: 'dates', name: 'Dates', serving: '3 pieces', calories: 200, protein: 2, carbs: 54, fat: 0 },
  { id: 'spinach', name: 'Spinach', serving: '1 cup cooked', calories: 40, protein: 5, carbs: 7, fat: 0.5 },
  { id: 'broccoli', name: 'Broccoli', serving: '1 cup', calories: 55, protein: 4, carbs: 11, fat: 0.5 },
  { id: 'sweet-potato', name: 'Sweet Potato', serving: '1 medium', calories: 115, protein: 2, carbs: 27, fat: 0 },
  { id: 'boiled-potato', name: 'Potato (boiled)', serving: '1 medium', calories: 160, protein: 4, carbs: 37, fat: 0 },
  { id: 'corn-cob', name: 'Corn on the Cob', serving: '1 cob', calories: 120, protein: 4, carbs: 27, fat: 1.5 },
  { id: 'green-salad', name: 'Green Salad', serving: '1 bowl', calories: 80, protein: 3, carbs: 12, fat: 3 },
  { id: 'sprout-salad', name: 'Sprout Salad', serving: '1 bowl', calories: 140, protein: 9, carbs: 24, fat: 2 },

  // ── Snacks, sweets & street food ──
  { id: 'bhel-puri', name: 'Bhel Puri', serving: '1 plate', calories: 220, protein: 6, carbs: 42, fat: 4 },
  { id: 'pani-puri', name: 'Pani Puri', serving: '6 pieces', calories: 180, protein: 4, carbs: 34, fat: 4 },
  { id: 'sev-puri', name: 'Sev Puri', serving: '6 pieces', calories: 300, protein: 7, carbs: 42, fat: 12 },
  { id: 'vada-pav', name: 'Vada Pav', serving: '1 piece', calories: 300, protein: 7, carbs: 45, fat: 11 },
  { id: 'kathi-roll-paneer', name: 'Paneer Kathi Roll', serving: '1 roll', calories: 430, protein: 17, carbs: 48, fat: 19 },
  { id: 'kathi-roll-chicken', name: 'Chicken Kathi Roll', serving: '1 roll', calories: 480, protein: 28, carbs: 48, fat: 20 },
  { id: 'dabeli', name: 'Dabeli', serving: '1 piece', calories: 310, protein: 8, carbs: 48, fat: 10 },
  { id: 'khandvi', name: 'Khandvi', serving: '6 pieces', calories: 160, protein: 7, carbs: 20, fat: 6 },
  { id: 'protein-makhana', name: 'Makhana Chaat', serving: '1 bowl', calories: 180, protein: 6, carbs: 28, fat: 5 },
  { id: 'trail-mix', name: 'Trail Mix', serving: '30 g', calories: 150, protein: 5, carbs: 14, fat: 9 },
  { id: 'popcorn', name: 'Popcorn', serving: '3 cups', calories: 100, protein: 3, carbs: 19, fat: 1.5 },
  { id: 'ice-cream', name: 'Ice Cream', serving: '1 scoop', calories: 140, protein: 3, carbs: 18, fat: 7 },
  { id: 'kheer', name: 'Kheer', serving: '1 bowl', calories: 260, protein: 7, carbs: 42, fat: 8 },
  { id: 'rasgulla', name: 'Rasgulla', serving: '1 piece', calories: 125, protein: 2, carbs: 25, fat: 1 },

  // ── Global meals ──
  { id: 'chicken-wrap', name: 'Chicken Wrap', serving: '1 wrap', calories: 420, protein: 28, carbs: 42, fat: 16 },
  { id: 'paneer-wrap', name: 'Paneer Wrap', serving: '1 wrap', calories: 450, protein: 20, carbs: 46, fat: 21 },
  { id: 'burrito-bowl', name: 'Burrito Bowl', serving: '1 bowl', calories: 650, protein: 32, carbs: 78, fat: 22 },
  { id: 'sushi', name: 'Sushi Rolls', serving: '8 pieces', calories: 320, protein: 14, carbs: 58, fat: 5 },
  { id: 'ramen', name: 'Ramen', serving: '1 bowl', calories: 520, protein: 20, carbs: 70, fat: 18 },
  { id: 'pho', name: 'Pho', serving: '1 bowl', calories: 420, protein: 25, carbs: 60, fat: 10 },
  { id: 'tacos-chicken', name: 'Chicken Tacos', serving: '2 tacos', calories: 360, protein: 24, carbs: 38, fat: 13 },
  { id: 'falafel-bowl', name: 'Falafel Bowl', serving: '1 bowl', calories: 560, protein: 18, carbs: 68, fat: 24 },
  { id: 'hummus', name: 'Hummus', serving: '3 tbsp', calories: 100, protein: 4, carbs: 8, fat: 6 },
  { id: 'caesar-salad', name: 'Caesar Salad', serving: '1 bowl', calories: 330, protein: 12, carbs: 14, fat: 25 },
  { id: 'grilled-cheese', name: 'Grilled Cheese Sandwich', serving: '1 sandwich', calories: 380, protein: 14, carbs: 36, fat: 21 },
  { id: 'tomato-soup', name: 'Tomato Soup', serving: '1 bowl', calories: 120, protein: 3, carbs: 22, fat: 3 },

  // ── Drinks & hydration ──
  { id: 'green-tea', name: 'Green Tea', serving: '1 cup', calories: 2, protein: 0, carbs: 0, fat: 0 },
  { id: 'lemon-water', name: 'Lemon Water', serving: '1 glass', calories: 10, protein: 0, carbs: 3, fat: 0 },
  { id: 'electrolyte-drink', name: 'Electrolyte Drink', serving: '1 bottle', calories: 60, protein: 0, carbs: 15, fat: 0 },
  { id: 'sports-drink', name: 'Sports Drink', serving: '1 bottle', calories: 130, protein: 0, carbs: 34, fat: 0 },
  { id: 'sugarcane-juice', name: 'Sugarcane Juice', serving: '1 glass', calories: 180, protein: 0, carbs: 44, fat: 0 },
  { id: 'smoothie-fruit', name: 'Fruit Smoothie', serving: '1 glass', calories: 240, protein: 6, carbs: 48, fat: 3 },
  { id: 'cold-coffee', name: 'Cold Coffee', serving: '1 glass', calories: 210, protein: 6, carbs: 32, fat: 7 },
  { id: 'beer', name: 'Beer', serving: '1 pint', calories: 200, protein: 2, carbs: 15, fat: 0 },
];

const QUICK_FOOD_IDS = [
  'roti', 'rice-cooked', 'dal-tadka', 'curd', 'banana', 'egg-boiled',
  'chicken-breast', 'paneer-raw', 'oats', 'poha', 'idli', 'chai',
  'apple', 'whey', 'sprouts', 'coffee-black',
];

const GROUP_TERMS: Record<Exclude<FoodGroupId, 'quick'>, string[]> = {
  indian: ['roti', 'paratha', 'rice', 'dal', 'paneer', 'sabzi', 'biryani', 'dosa', 'idli', 'poha', 'upma', 'khichdi', 'thali', 'chaat', 'puri', 'pav', 'vada', 'lassi', 'chai', 'kheer', 'kulcha', 'appam', 'puttu', 'chilla', 'dhokla', 'thepla'],
  protein: ['chicken', 'egg', 'fish', 'mutton', 'paneer', 'tofu', 'soya', 'whey', 'sprouts', 'yogurt', 'salmon', 'tuna', 'shrimp', 'beef', 'lentils', 'chickpeas', 'beans', 'tempeh', 'protein'],
  breakfast: ['oats', 'muesli', 'cornflakes', 'bread', 'egg', 'omelette', 'poha', 'upma', 'idli', 'dosa', 'uttapam', 'chilla', 'dhokla', 'thepla', 'yogurt', 'smoothie', 'pancakes', 'toast'],
  snacks: ['samosa', 'pakora', 'makhana', 'biscuits', 'chips', 'chocolate', 'bhel', 'puri', 'vada', 'roll', 'dabeli', 'khandvi', 'trail', 'popcorn', 'bar', 'fries', 'momos', 'ice cream', 'rasgulla', 'jalebi', 'jamun'],
  drinks: ['chai', 'coffee', 'juice', 'cola', 'water', 'lassi', 'buttermilk', 'chaas', 'tea', 'drink', 'smoothie', 'beer'],
  fruit: ['banana', 'apple', 'mango', 'orange', 'grapes', 'papaya', 'pomegranate', 'watermelon', 'strawberries', 'blueberries', 'kiwi', 'pear', 'guava', 'dates'],
  global: ['pasta', 'pizza', 'burger', 'sandwich', 'rice', 'noodles', 'fries', 'salad', 'wrap', 'burrito', 'sushi', 'ramen', 'pho', 'tacos', 'falafel', 'hummus', 'soup', 'toast'],
};

function searchableText(food: FoodItem): string {
  return [food.name, food.serving, ...(food.tags ?? [])].join(' ').toLowerCase();
}

export function foodsForGroup(group: FoodGroupId, limit = 12): FoodItem[] {
  if (group === 'quick') {
    const byId = new Map(FOOD_DB.map(food => [food.id, food]));
    return QUICK_FOOD_IDS.map(id => byId.get(id)).filter(Boolean).slice(0, limit) as FoodItem[];
  }
  const terms = GROUP_TERMS[group];
  return FOOD_DB.filter(food => {
    const haystack = searchableText(food);
    return terms.some(term => haystack.includes(term));
  }).slice(0, limit);
}

/** Substring search over names, servings, and tags; empty query returns nothing. */
export function searchFoods(query: string, limit = 12): FoodItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: FoodItem[] = [];
  const contains: FoodItem[] = [];
  for (const f of FOOD_DB) {
    const name = f.name.toLowerCase();
    const haystack = searchableText(f);
    if (name.startsWith(q)) starts.push(f);
    else if (haystack.includes(q)) contains.push(f);
  }
  return [...starts, ...contains].slice(0, limit);
}
