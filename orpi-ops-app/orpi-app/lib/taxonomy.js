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
  'Wine',
  'Prosecco',
  'Champagne',
  'Beer',
];

export const NON_ALCOHOLIC = 'Non-Alcoholic';

// Everything, in the order it should appear in a dropdown: spirits together,
// then the rest of the bar, then the non-drinks.
export const CATEGORIES = [
  ...SPIRIT_CATEGORIES,
  'Liqueur',
  'Wine',
  'Prosecco',
  'Champagne',
  'Beer',
  NON_ALCOHOLIC,
  'Mixer',
  'Soft Drink',
  'Garnish',
  'Ice',
  'Other',
];

export const isSpirit = cat => SPIRIT_CATEGORIES.includes(cat) || cat === LEGACY_SPIRIT;

// Non-alcoholic is checked first: a 0% beer is a drink cost, not alcohol spend.
export const isAlcohol = cat => cat !== NON_ALCOHOLIC && ALCOHOL_CATEGORIES.includes(cat);

/** Which Event Costing type a purchase of this category belongs under. */
export function costTypeFor(cat) {
  if (cat === NON_ALCOHOLIC) return 'Mixers';
  if (isAlcohol(cat)) return 'Alcohol';
  if (cat === 'Mixer' || cat === 'Soft Drink') return 'Mixers';
  if (cat === 'Ice') return 'Ice';
  if (cat === 'Garnish') return 'Garnish';
  return 'Other/Misc';
}

export const GARNISH_SECTION = 'Garnish & consumables';

/** Which heading this ingredient loads under on the van. */
export function sectionFor(name, cat) {
  if (/espresso|cream|milk/i.test(name)) return 'Chilled \u2014 critical';
  if (cat === 'Garnish') return GARNISH_SECTION;
  if (cat === NON_ALCOHOLIC) return 'Mixers & juices';
  if (isAlcohol(cat)) return 'Cocktail spirits';
  return 'Mixers & juices';
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
