export type CatalogPresetCategory = {
  name: string;
  icon: string;
};

export type CatalogPresetProduct = {
  id: string;
  name: string;
  category: string;
  pricingMode: "fixed" | "per_kg";
  price: number;
  unit: string;
  imageUrl: string;
  minStock: number;
  openingStock: number;
};

export type CatalogPreset = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  categories: CatalogPresetCategory[];
  products: CatalogPresetProduct[];
};

export const CATALOG_PRESETS: CatalogPreset[] = [
  {
    id: "lechon-house",
    label: "Lechon House",
    shortLabel: "Lechon",
    description: "A ready-to-sell Filipino roast menu with rice, sauces, drinks, and combo-friendly staples.",
    icon: "pig",
    categories: [
      { name: "Lechon", icon: "pig" },
      { name: "Rice & Sides", icon: "rice" },
      { name: "Drinks", icon: "drink" },
      { name: "Sauces & Extras", icon: "sauce" },
      { name: "Combos", icon: "package" },
    ],
    products: [
      { id: "whole-lechon-small", name: "Whole Lechon (Small)", category: "Lechon", pricingMode: "per_kg", price: 650, unit: "kg", imageUrl: "/food/whole-lechon-small.webp", minStock: 1, openingStock: 2 },
      { id: "whole-lechon-medium", name: "Whole Lechon (Medium)", category: "Lechon", pricingMode: "per_kg", price: 700, unit: "kg", imageUrl: "/food/whole-lechon-medium.webp", minStock: 1, openingStock: 2 },
      { id: "lechon-belly", name: "Lechon Belly", category: "Lechon", pricingMode: "per_kg", price: 720, unit: "kg", imageUrl: "/food/lechon-belly-one.webp", minStock: 2, openingStock: 4 },
      { id: "lechon-paksiw", name: "Lechon Paksiw", category: "Lechon", pricingMode: "fixed", price: 180, unit: "bowl", imageUrl: "/food/lechon-paksiw.webp", minStock: 3, openingStock: 8 },
      { id: "java-rice", name: "Java Rice", category: "Rice & Sides", pricingMode: "fixed", price: 45, unit: "cup", imageUrl: "/food/java-rice.webp", minStock: 10, openingStock: 30 },
      { id: "garlic-rice", name: "Garlic Rice", category: "Rice & Sides", pricingMode: "fixed", price: 40, unit: "cup", imageUrl: "/food/restaurant-garlic-rice.webp", minStock: 10, openingStock: 30 },
      { id: "iced-tea", name: "Iced Tea", category: "Drinks", pricingMode: "fixed", price: 50, unit: "glass", imageUrl: "/food/pizza-iced-tea.webp", minStock: 10, openingStock: 30 },
      { id: "softdrinks", name: "Softdrinks (Can)", category: "Drinks", pricingMode: "fixed", price: 60, unit: "can", imageUrl: "/food/pizza-cola.webp", minStock: 10, openingStock: 24 },
      { id: "lechon-sauce", name: "Lechon Sauce", category: "Sauces & Extras", pricingMode: "fixed", price: 25, unit: "cup", imageUrl: "/food/mang-tomas.webp", minStock: 10, openingStock: 30 },
      { id: "lechon-combo", name: "Lechon Meal Combo", category: "Combos", pricingMode: "fixed", price: 299, unit: "meal", imageUrl: "/food/lechon-meal-combo.webp", minStock: 5, openingStock: 12 },
    ],
  },
  {
    id: "cafe",
    label: "Cafe",
    shortLabel: "Cafe",
    description: "A compact cafe starter menu for espresso drinks, non-coffee favorites, pastries, and add-ons.",
    icon: "drink",
    categories: [
      { name: "Coffee", icon: "drink" },
      { name: "Non-coffee", icon: "drink" },
      { name: "Pastries", icon: "package" },
      { name: "Add-ons", icon: "plus" },
    ],
    products: [
      { id: "espresso", name: "Espresso", category: "Coffee", pricingMode: "fixed", price: 120, unit: "cup", imageUrl: "/food/cafe-espresso.webp", minStock: 10, openingStock: 30 },
      { id: "americano", name: "Americano", category: "Coffee", pricingMode: "fixed", price: 140, unit: "cup", imageUrl: "/food/cafe-americano.webp", minStock: 10, openingStock: 30 },
      { id: "cafe-latte", name: "Cafe Latte", category: "Coffee", pricingMode: "fixed", price: 170, unit: "cup", imageUrl: "/food/cafe-latte.webp", minStock: 10, openingStock: 30 },
      { id: "iced-latte", name: "Iced Latte", category: "Coffee", pricingMode: "fixed", price: 190, unit: "cup", imageUrl: "/food/cafe-iced-latte.webp", minStock: 10, openingStock: 30 },
      { id: "matcha-latte", name: "Matcha Latte", category: "Non-coffee", pricingMode: "fixed", price: 190, unit: "cup", imageUrl: "/food/cafe-matcha-latte.webp", minStock: 10, openingStock: 30 },
      { id: "croissant", name: "Butter Croissant", category: "Pastries", pricingMode: "fixed", price: 150, unit: "pc", imageUrl: "/food/bakery-croissant.webp", minStock: 8, openingStock: 18 },
      { id: "blueberry-muffin", name: "Blueberry Muffin", category: "Pastries", pricingMode: "fixed", price: 135, unit: "pc", imageUrl: "/food/cafe-blueberry-muffin.webp", minStock: 8, openingStock: 18 },
      { id: "extra-shot", name: "Extra Espresso Shot", category: "Add-ons", pricingMode: "fixed", price: 40, unit: "shot", imageUrl: "/food/cafe-espresso.webp", minStock: 10, openingStock: 30 },
    ],
  },
  {
    id: "coffee-house",
    label: "Coffee House",
    shortLabel: "Coffee House",
    description: "A fuller coffee-house lineup with signature drinks, cold brew, refreshers, and bakery pairings.",
    icon: "drink",
    categories: [
      { name: "Signature Coffee", icon: "drink" },
      { name: "Cold Brew", icon: "drink" },
      { name: "Tea & Refreshers", icon: "drink" },
      { name: "Bakery", icon: "package" },
    ],
    products: [
      { id: "cappuccino", name: "Cappuccino", category: "Signature Coffee", pricingMode: "fixed", price: 180, unit: "cup", imageUrl: "/food/coffee-house-cappuccino.webp", minStock: 10, openingStock: 30 },
      { id: "spanish-latte", name: "Spanish Latte", category: "Signature Coffee", pricingMode: "fixed", price: 200, unit: "cup", imageUrl: "/food/coffee-house-spanish-latte.webp", minStock: 10, openingStock: 30 },
      { id: "mocha", name: "Mocha", category: "Signature Coffee", pricingMode: "fixed", price: 210, unit: "cup", imageUrl: "/food/coffee-house-mocha.webp", minStock: 10, openingStock: 30 },
      { id: "cold-brew", name: "Cold Brew", category: "Cold Brew", pricingMode: "fixed", price: 190, unit: "bottle", imageUrl: "/food/coffee-house-cold-brew.webp", minStock: 8, openingStock: 20 },
      { id: "vanilla-cold-brew", name: "Vanilla Cold Brew", category: "Cold Brew", pricingMode: "fixed", price: 220, unit: "bottle", imageUrl: "/food/coffee-house-cold-brew.webp", minStock: 8, openingStock: 20 },
      { id: "calamansi-tea", name: "Calamansi Tea", category: "Tea & Refreshers", pricingMode: "fixed", price: 150, unit: "glass", imageUrl: "/food/coffee-house-calamansi-tea.webp", minStock: 8, openingStock: 20 },
      { id: "cheesecake-slice", name: "Cheesecake Slice", category: "Bakery", pricingMode: "fixed", price: 220, unit: "slice", imageUrl: "/food/coffee-house-cheesecake.webp", minStock: 5, openingStock: 12 },
      { id: "cinnamon-roll", name: "Cinnamon Roll", category: "Bakery", pricingMode: "fixed", price: 160, unit: "pc", imageUrl: "/food/bakery-cinnamon-roll.webp", minStock: 8, openingStock: 18 },
    ],
  },
  {
    id: "bakery",
    label: "Bakery",
    shortLabel: "Bakery",
    description: "A neighborhood bakery catalog for breads, pastries, cakes, and a few easy beverage add-ons.",
    icon: "package",
    categories: [
      { name: "Breads", icon: "package" },
      { name: "Pastries", icon: "package" },
      { name: "Cakes", icon: "package" },
      { name: "Beverages", icon: "drink" },
    ],
    products: [
      { id: "pandesal", name: "Pandesal", category: "Breads", pricingMode: "fixed", price: 10, unit: "pc", imageUrl: "/food/bakery-pandesal.webp", minStock: 20, openingStock: 60 },
      { id: "ensaymada", name: "Ensaymada", category: "Breads", pricingMode: "fixed", price: 55, unit: "pc", imageUrl: "/food/bakery-ensaymada.webp", minStock: 10, openingStock: 24 },
      { id: "bakery-croissant", name: "Butter Croissant", category: "Pastries", pricingMode: "fixed", price: 120, unit: "pc", imageUrl: "/food/bakery-croissant.webp", minStock: 10, openingStock: 24 },
      { id: "bakery-cinnamon-roll", name: "Cinnamon Roll", category: "Pastries", pricingMode: "fixed", price: 140, unit: "pc", imageUrl: "/food/bakery-cinnamon-roll.webp", minStock: 10, openingStock: 24 },
      { id: "banana-bread", name: "Banana Bread", category: "Pastries", pricingMode: "fixed", price: 150, unit: "slice", imageUrl: "/food/bakery-banana-bread.webp", minStock: 8, openingStock: 18 },
      { id: "chocolate-cake-slice", name: "Chocolate Cake Slice", category: "Cakes", pricingMode: "fixed", price: 220, unit: "slice", imageUrl: "/food/bakery-chocolate-cake-slice.webp", minStock: 5, openingStock: 12 },
      { id: "bakery-iced-coffee", name: "Iced Coffee", category: "Beverages", pricingMode: "fixed", price: 160, unit: "cup", imageUrl: "/food/cafe-iced-latte.webp", minStock: 10, openingStock: 30 },
    ],
  },
  {
    id: "pizza-house",
    label: "Pizza House",
    shortLabel: "Pizza",
    description: "A quick-service pizza menu with signature pies, sides, pasta, and familiar cold drinks.",
    icon: "package",
    categories: [
      { name: "Pizza", icon: "package" },
      { name: "Pasta", icon: "package" },
      { name: "Sides", icon: "rice" },
      { name: "Drinks", icon: "drink" },
    ],
    products: [
      { id: "pepperoni-pizza", name: "Pepperoni Pizza", category: "Pizza", pricingMode: "fixed", price: 550, unit: "box", imageUrl: "/food/pizza-pepperoni.webp", minStock: 3, openingStock: 8 },
      { id: "margherita-pizza", name: "Margherita Pizza", category: "Pizza", pricingMode: "fixed", price: 480, unit: "box", imageUrl: "/food/pizza-margherita.webp", minStock: 3, openingStock: 8 },
      { id: "hawaiian-pizza", name: "Hawaiian Pizza", category: "Pizza", pricingMode: "fixed", price: 520, unit: "box", imageUrl: "/food/pizza-hawaiian.webp", minStock: 3, openingStock: 8 },
      { id: "spaghetti-bolognese", name: "Spaghetti Bolognese", category: "Pasta", pricingMode: "fixed", price: 260, unit: "bowl", imageUrl: "/food/pizza-spaghetti-bolognese.webp", minStock: 5, openingStock: 12 },
      { id: "garlic-bread", name: "Garlic Bread", category: "Sides", pricingMode: "fixed", price: 180, unit: "order", imageUrl: "/food/pizza-garlic-bread.webp", minStock: 5, openingStock: 15 },
      { id: "chicken-wings", name: "Chicken Wings", category: "Sides", pricingMode: "fixed", price: 320, unit: "order", imageUrl: "/food/pizza-chicken-wings.webp", minStock: 5, openingStock: 12 },
      { id: "cola", name: "Cola", category: "Drinks", pricingMode: "fixed", price: 80, unit: "bottle", imageUrl: "/food/pizza-cola.webp", minStock: 12, openingStock: 30 },
      { id: "pizza-iced-tea", name: "Iced Tea", category: "Drinks", pricingMode: "fixed", price: 100, unit: "glass", imageUrl: "/food/pizza-iced-tea.webp", minStock: 12, openingStock: 30 },
    ],
  },
  {
    id: "restaurant",
    label: "Restaurant",
    shortLabel: "Restaurant",
    description: "A flexible Filipino restaurant starter menu covering appetizers, mains, rice meals, and drinks.",
    icon: "box",
    categories: [
      { name: "Appetizers", icon: "package" },
      { name: "Mains", icon: "box" },
      { name: "Rice Meals", icon: "rice" },
      { name: "Drinks", icon: "drink" },
    ],
    products: [
      { id: "chicken-inasal", name: "Chicken Inasal", category: "Mains", pricingMode: "fixed", price: 260, unit: "plate", imageUrl: "/food/restaurant-inasal.webp", minStock: 5, openingStock: 15 },
      { id: "pork-adobo", name: "Pork Adobo", category: "Mains", pricingMode: "fixed", price: 240, unit: "plate", imageUrl: "/food/restaurant-pork-adobo.webp", minStock: 5, openingStock: 15 },
      { id: "beef-tapa", name: "Beef Tapa", category: "Rice Meals", pricingMode: "fixed", price: 280, unit: "plate", imageUrl: "/food/restaurant-beef-tapa.webp", minStock: 5, openingStock: 15 },
      { id: "crispy-kare-kare", name: "Crispy Pork Kare-Kare", category: "Mains", pricingMode: "fixed", price: 320, unit: "bowl", imageUrl: "/food/restaurant-kare-kare.webp", minStock: 4, openingStock: 10 },
      { id: "sinigang-baboy", name: "Sinigang na Baboy", category: "Mains", pricingMode: "fixed", price: 330, unit: "bowl", imageUrl: "/food/restaurant-sinigang.webp", minStock: 4, openingStock: 10 },
      { id: "lumpia", name: "Lumpiang Shanghai", category: "Appetizers", pricingMode: "fixed", price: 180, unit: "order", imageUrl: "/food/restaurant-lumpia.webp", minStock: 5, openingStock: 15 },
      { id: "restaurant-garlic-rice", name: "Garlic Rice", category: "Rice Meals", pricingMode: "fixed", price: 45, unit: "cup", imageUrl: "/food/restaurant-garlic-rice.webp", minStock: 10, openingStock: 30 },
      { id: "restaurant-iced-tea", name: "Iced Tea", category: "Drinks", pricingMode: "fixed", price: 80, unit: "glass", imageUrl: "/food/pizza-iced-tea.webp", minStock: 10, openingStock: 30 },
      { id: "restaurant-softdrinks", name: "Softdrinks (Can)", category: "Drinks", pricingMode: "fixed", price: 60, unit: "can", imageUrl: "/food/pizza-cola.webp", minStock: 10, openingStock: 24 },
    ],
  },
];

export function getCatalogPreset(id: string | null | undefined) {
  return CATALOG_PRESETS.find((preset) => preset.id === id) ?? null;
}
