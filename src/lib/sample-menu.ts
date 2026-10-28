// Placeholder menu until the hotel shares its real menu and prices.
export const SAMPLE_CATEGORIES = ["Starters", "Main course", "Breads", "Rice & biryani", "Desserts", "Drinks"];

export const SAMPLE_MENU: { category: string; name: string; description: string; price: number; veg: boolean; bestseller?: boolean }[] = [
  { category: "Starters", name: "Paneer Tikka", description: "Chargrilled paneer cubes with peppers and mint chutney", price: 280, veg: true, bestseller: true },
  { category: "Starters", name: "Hara Bhara Kebab", description: "Spinach and green pea patties, crisp outside", price: 220, veg: true },
  { category: "Starters", name: "Veg Manchurian", description: "Vegetable dumplings in a tangy Indo-Chinese sauce", price: 210, veg: true },
  { category: "Starters", name: "Chicken Tikka", description: "Boneless chicken marinated in yoghurt and spices, from the tandoor", price: 340, veg: false, bestseller: true },
  { category: "Main course", name: "Paneer Butter Masala", description: "Soft paneer in a rich tomato and butter gravy", price: 290, veg: true, bestseller: true },
  { category: "Main course", name: "Dal Makhani", description: "Black lentils slow-cooked overnight with cream", price: 240, veg: true },
  { category: "Main course", name: "Dal Tadka", description: "Yellow lentils tempered with cumin and garlic", price: 190, veg: true },
  { category: "Main course", name: "Kadhai Chicken", description: "Chicken tossed with peppers, onion and fresh-ground kadhai masala", price: 360, veg: false },
  { category: "Main course", name: "Mutton Rogan Josh", description: "Slow-cooked mutton in a Kashmiri chilli gravy", price: 420, veg: false },
  { category: "Breads", name: "Butter Naan", description: "Tandoor-baked, brushed with butter", price: 60, veg: true },
  { category: "Breads", name: "Tandoori Roti", description: "Whole wheat, from the tandoor", price: 30, veg: true },
  { category: "Breads", name: "Lachha Paratha", description: "Flaky layered paratha", price: 70, veg: true },
  { category: "Rice & biryani", name: "Veg Biryani", description: "Basmati rice layered with vegetables, served with raita", price: 260, veg: true },
  { category: "Rice & biryani", name: "Chicken Biryani", description: "Dum-cooked basmati and chicken, served with raita", price: 340, veg: false, bestseller: true },
  { category: "Rice & biryani", name: "Jeera Rice", description: "Basmati rice with cumin", price: 160, veg: true },
  { category: "Desserts", name: "Gulab Jamun (2 pcs)", description: "Warm, soaked in cardamom syrup", price: 90, veg: true },
  { category: "Desserts", name: "Kesar Kulfi", description: "Saffron and pistachio frozen dessert", price: 110, veg: true },
  { category: "Drinks", name: "Masala Chaas", description: "Spiced buttermilk", price: 70, veg: true },
  { category: "Drinks", name: "Sweet Lassi", description: "Thick churned yoghurt", price: 90, veg: true },
  { category: "Drinks", name: "Masala Chai", description: "Ginger and cardamom tea", price: 40, veg: true },
];
