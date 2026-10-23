// lib/taxonomy.js
//
// What the inventory categories are and what they mean. This lived hardcoded in
// four files, which is how "Non-Alcoholic" ended up needing four separate
// edits. One place now.
//
// Spirits are split by type rather than sitting in one bucket, so the pickers
// can rank vodkas above gins and reporting can show what you actually hold.
// Anything reading these should use the helpers, not compare strings directly.

export const SPIRIT_CATEGORIES = [
  'Vodka',
  'Gin',
  'Rum',
  'Whisky',
  'Tequila & Mezcal',
  'Cognac & Brandy',
];

// 'Spirit' stays in the alcohol list on purpose. Rows carry it until they've
// been recategorised, and an un-migrated bottle must still cost as alcohol.
export const LEGACY_SPIRIT = 'Spirit';

export const ALCOHOL_CATEGORIES = [
  ...SPIRIT_CATEGORIES,
  LEGACY_SPIRIT,
  'Liqueur',
  'Shots/Shooters',
  'Wine',
  'Prosecco',
  'Champagne',
  'Beer',
];

export const NON_ALCOHOLIC = 'Non-Alcoholic';

// Everything, in the order it should appear in a dropdown: spirits together,
// then the rest of the bar, then the non-drinks.
export const CATEGORIES = [
  // Bar — alcohol first
  ...SPIRIT_CATEGORIES,
  'Liqueur',
  'Shots/Shooters',
  'Beer',
  'Wine',
  'Prosecco',
  'Champagne',
  // Soft drinks
  NON_ALCOHOLIC,
  'Mixer',
  // Cocktail-making
  'Syrups & Cordials',
  'Bitters',
  'Purées',
  'Prep & Kit',
  // Internal
  'Quote Options',
];

export const isSpirit = cat => SPIRIT_CATEGORIES.includes(cat) || cat === LEGACY_SPIRIT;

// Non-alcoholic is checked first: a 0% beer is a drink cost, not alcohol spend.
export const isAlcohol = cat => cat !== NON_ALCOHOLIC && ALCOHOL_CATEGORIES.includes(cat);

/** Which Event Costing type a purchase of this category belongs under. */
export function costTypeFor(cat) {
  if (cat === NON_ALCOHOLIC) return 'Mixers';
  if (isAlcohol(cat)) return 'Alcohol';
  if (['Mixer', 'Soft Drink', 'Syrups & Cordials', 'Bitters', 'Purées'].includes(cat)) return 'Mixers';
  if (cat === 'Ice') return 'Ice';
  if (cat === 'Garnish') return 'Garnish';
  return 'Other/Misc'; // Prep & Kit, Quote Options
}

// Run sheet headings. One heading per kind of product, whatever it's for: the
// back bar's soft drinks and the cocktails' mixers are the same crates in the
// van, so they're one list (the row says what each is used for).
export const SPIRITS_SECTION = 'Spirits, beer & wine';
export const CHILLED_SECTION = 'Chilled \u2014 critical';
export const MIXERS_SECTION = 'Mixers & soft drinks';
export const GARNISH_SECTION = 'Garnish & consumables';
export const RUNSHEET_SECTIONS = [SPIRITS_SECTION, CHILLED_SECTION, MIXERS_SECTION];

// Recipe units only a garnish or consumable is measured in. Every ingredient in
// the library measured this way is fruit, herbs, a rim, a pinch of something
// or a sugar cube: bought per event and costed, not counted out of stock.
const GARNISH_UNITS = ['piece', 'slice', 'sprig', 'wedge', 'cube', 'spoon', 'whole', 'twist', 'peel', 'pinch', 'leaf'];

/**
 * Which heading this ingredient loads under on the van. Garnishes are spotted
 * by name and unit as well as category, because most of them aren't stock
 * items at all, so there's often no category to go on.
 */
export function sectionFor(name, cat, unit) {
  if (/espresso|cream|milk/i.test(name || '')) return CHILLED_SECTION;
  if (cat === 'Garnish' || /garnish/i.test(name || '') || GARNISH_UNITS.includes(String(unit || '').toLowerCase())) return GARNISH_SECTION;
  if (cat === NON_ALCOHOLIC) return MIXERS_SECTION;
  if (isAlcohol(cat)) return SPIRITS_SECTION;
  return MIXERS_SECTION;
}

/**
 * Maps a quote builder spirit row ("Whiskey", "Beer / Lager") onto an inventory
 * category, so the product picker ranks the right stock to the top. Now that
 * spirits are split by type this is mostly one-to-one.
 */
const ROW_TO_CATEGORY = [
  [/vodka/i, 'Vodka'],
  [/\bgin\b/i, 'Gin'],
  [/\brum\b|cacha/i, 'Rum'],
  [/whisk|bourbon|scotch/i, 'Whisky'],
  [/tequila|mezcal/i, 'Tequila & Mezcal'],
  [/cognac|brandy|armagnac/i, 'Cognac & Brandy'],
  [/liqueur|aperol|passoa|kahlua|schnapps|campari/i, 'Liqueur'],
  [/prosecco/i, 'Prosecco'],
  [/champagne/i, 'Champagne'],
  [/non.?alcohol|alcohol.?free|\b0%/i, NON_ALCOHOLIC],
  [/\bwine\b/i, 'Wine'],
  [/beer|lager|cider/i, 'Beer'],
  [/soft|mixer|juice|tonic|soda/i, 'Mixer'],
  [/garnish|fruit|fresh/i, 'Garnish'],
  [/\bice\b/i, 'Ice'],
  [/spirit/i, LEGACY_SPIRIT],
];

export const stockCategoryFor = rowLabel =>
  (ROW_TO_CATEGORY.find(([re]) => re.test(rowLabel || '')) || [])[1] || null;
