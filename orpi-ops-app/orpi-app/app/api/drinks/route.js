// app/api/drinks/route.js
//
// The drinks library, live from Notion. Joins three databases into the exact
// shape the run sheet already expects, so a recipe edited in Notion reaches the
// app without anyone rebuilding a file.
//
// Three queries, roughly 750 rows. Cached in memory for five minutes because
// the run sheet gets opened repeatedly on event day and the library changes
// weekly at most.

import { latestUnitCosts, unitCostFor } from '@/lib/pricing';

const TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const DB_DRINKS = process.env.NOTION_DB_DRINKS || '3426ca9d054980b193cadeca4f2bb1b4';
const DB_INVENTORY = process.env.NOTION_DB_INVENTORY || '2e16ca9d054980cf978edf55d1d40efb';
// Note this is the DATABASE id, not the data source id — Notion has both and
// they differ. Only the database id works with /databases/{id}/query.
const DB_RECIPE = process.env.NOTION_DB_RECIPE_INGREDIENTS || '3d66ca9d054980e9a77dc47797741176';
const DB_PURCHASES = process.env.NOTION_DB_PURCHASES || '2e16ca9d054980879bc5ef22eb00f97d';

const CACHE_MS = 5 * 60 * 1000;
let cache = { at: 0, data: null };

const headers = () => ({
  Authorization: `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
});

async function queryAll(dbId, label) {
  const rows = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
      cache: 'no-store',
    });
    if (!res.ok) {
      // 404 almost always means the database isn't shared with the integration,
      // or the id is a data source id rather than a database id.
      const hint = res.status === 404
        ? ' — check the id, and that the database is shared with the integration'
        : '';
      throw new Error(`Notion ${res.status} reading ${label}${hint}`);
    }
    const json = await res.json();
    rows.push(...json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return rows;
}

const title = p => p?.title?.map(t => t.plain_text).join('').trim() || '';
const text = p => p?.rich_text?.map(t => t.plain_text).join('').trim() || '';
const sel = p => p?.select?.name || '';
// Average Unit Cost is a formula and Notion returns those under formula.number,
// not number. Reading it the plain way silently zeroes every drink cost, so
// this checks all three shapes a numeric property can arrive in.
const num = p => {
  if (typeof p?.number === 'number') return p.number;
  if (typeof p?.formula?.number === 'number') return p.formula.number;
  if (typeof p?.rollup?.number === 'number') return p.rollup.number;
  return null;
};
const relIds = p => (p?.relation || []).map(r => r.id.replace(/-/g, ''));
const pid = page => page.id.replace(/-/g, '');

// ORPI's glassware vocabulary. Notion currently says "Rocks Glass"; the bar
// says Loball. Both spellings map to the same place, so renaming the Notion
// select options later needs no code change.
const GLASS_MAP = {
  'Rocks Glass': 'Loball', 'Rocks': 'Loball',
  'Highball Glass': 'Hiball', 'Highball': 'Hiball',
  'Coupe Glass': 'Champagne Coupe', 'Coupe': 'Champagne Coupe',
  'Martini Glass': 'Martini', 'Martini': 'Martini',
  'Champagne Flute': 'Champagne Flute',
  'Wine Glass': 'Wine Glasses', 'Wine': 'Wine Glasses',
  // Shooters go in disposables, so they never belong on a hire order.
  'Shot Glass': 'Plastic Shot', 'Shot': 'Plastic Shot',
  // One drink, and in practice it's poured into a loball.
  'Margarita Glass': 'Loball', 'Margarita': 'Loball',
};
const shortGlass = g => GLASS_MAP[g] || (g || '').replace(/ Glass$/, '');
// Flagged so the run sheet can keep them out of a hire order.
export const DISPOSABLE_GLASS = ['Plastic Shot'];

const GSEC = 'Garnish & consumables';
// Mirrors secOf in the run sheet so both sides group ingredients identically.
function sectionFor(name, cat) {
  if (/espresso|cream|milk/i.test(name)) return 'Chilled \u2014 critical';
  if (cat === 'Garnish') return GSEC;
  if (['Spirit', 'Liqueur', 'Wine', 'Prosecco', 'Champagne', 'Beer'].includes(cat)) return 'Cocktail spirits';
  return 'Mixers & juices';
}

async function build() {
  const [drinkPages, invPages, recipePages, purchasePages] = await Promise.all([
    queryAll(DB_DRINKS, 'Drinks Library'),
    queryAll(DB_INVENTORY, 'Inventory Items'),
    queryAll(DB_RECIPE, 'Recipe Ingredients'),
    queryAll(DB_PURCHASES, 'Inventory Purchases'),
  ]);

  // What each bottle costs to replace today — see lib/pricing for the rule.
  const priceIndex = latestUnitCosts(purchasePages);

  // Inventory first — recipes cost against it.
  const invById = {};
  const inventory = invPages.map(page => {
    const p = page.properties;
    const v = num(p['Container Volume ml']) || 0;
    const uc = unitCostFor(pid(page), priceIndex, page);
    const item = {
      n: title(p['Item Name']),
      cat: sel(p['Catagory']) || 'Other',   // yes, spelled that way in Notion
      v,
      cpm: v > 0 ? uc / v : 0,
      uc,
      size: text(p['Size']),
      stock: num(p['Current Stock']) ?? 0,
      // Surfaced so the run sheet can show where a price came from.
      pricedOn: priceIndex[pid(page)]?.boughtOn || null,
    };
    if (item.n) invById[pid(page)] = item;
    return item;
  }).filter(i => i.n);

  // Ingredients, grouped under the drink they belong to.
  const byDrink = {};
  for (const page of recipePages) {
    const p = page.properties;
    const drinkIds = relIds(p['\u{1F378} ORPI Drinks Library']);
    if (!drinkIds.length) continue;
    const item = invById[relIds(p['\u{1F37A} Inventory Items'])[0]];
    const q = num(p['Quantity']) || 0;
    const name = title(p['Ingredient']) || text(p['Ingredient']);
    const ing = {
      n: name,
      q,
      u: sel(p['Unit']) || text(p['Unit']) || 'ml',
      s: item ? item.n : '',
      sec: sectionFor(name, item ? item.cat : 'Other'),
      // Same formula the bundled file uses: quantity x cost per ml.
      c: item ? Math.round(q * item.cpm * 10000) / 10000 : 0,
    };
    (byDrink[drinkIds[0]] ||= []).push(ing);
  }

  const drinks = drinkPages.map(page => {
    const p = page.properties;
    const ing = byDrink[pid(page)] || [];
    return {
      name: title(p['Drink Name']),
      type: sel(p['Drink Type']),
      cat: sel(p['Category']),
      tier: sel(p['Tier']) || 'Standard',
      glass: shortGlass(sel(p['Glassware'])),
      ice: sel(p['Ice']) || 'None',
      method: (sel(p['Method']) || '').toUpperCase(),
      gar: text(p['Garnish']),
      rim: text(p['Rim']),
      ing,
      cost: Math.round(ing.reduce((s, i) => s + i.c, 0) * 100) / 100,
    };
  })
    // Retired drinks stay in Notion for history but shouldn't be pickable.
    .filter(d => d.name && d.type !== 'Retired')
    .sort((a, b) => a.name.localeCompare(b.name));

  return { generatedAt: new Date().toISOString(), source: 'notion', drinks, inventory };
}

export async function GET() {
  if (!TOKEN) return Response.json({ error: 'NOTION_TOKEN not set' }, { status: 500 });

  if (cache.data && Date.now() - cache.at < CACHE_MS) {
    return Response.json({ ...cache.data, cached: true });
  }

  try {
    const data = await build();
    cache = { at: Date.now(), data };
    return Response.json(data);
  } catch (err) {
    // Stale beats nothing — a van with a flaky connection still needs recipes.
    if (cache.data) return Response.json({ ...cache.data, cached: true, stale: true });
    return Response.json({ error: err.message }, { status: 502 });
  }
}
