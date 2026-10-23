// lib/runsheetNames.js
//
// Product names drift. Notion renames an item ("Schweppes Soda Water 1L" became
// "Schweppes Soda Water", "Coke 1.5L Bottle" became "Coca-Cola 1.5L"), but a run
// sheet saved before the rename still has the old name in its back bar, its
// counts and its shopping list — so the sheet showed the same bottle twice,
// once under each name. These helpers resolve an old name to today's inventory
// item, and move a run sheet's saved data across to it, so every product has
// one row.
//
// No React, no browser APIs: the run sheet uses them, and so can a test.

const ACCENTS = /[̀-ͯ]/g;
// Words that differ between how the same bottle gets written down. Stripped
// from both sides, so "Courvoisier VS Cognac Brandy" and "Courvoisier VS" meet.
const CATEGORY_WORDS = new Set(['vodka', 'gin', 'rum', 'whisky', 'whiskey', 'bourbon', 'tequila', 'cognac', 'brandy', 'liqueur', 'beer', 'lager', 'cider', 'wine', 'prosecco', 'champagne', 'the', 'and']);
const PACK_WORDS = new Set(['bottle', 'bottles', 'can', 'cans', 'pack', 'case', 'box', 'jar', 'tin', 'tub']);
// Same product, different spelling.
const ALIASES = [[/\bcoke\b/g, 'coca cola'], [/\bslimeline\b/g, 'slimline']];
const SIZE_ANY = /(\d+(?:\.\d+)?)\s*(ml|cl|ltr|litres?|liters?|l)\b/gi;
const SIZE_ONE = /(\d+(?:\.\d+)?)\s*(ml|cl|ltr|litres?|liters?|l)\b/i;

/** Bottle size in ml from a name or size field ("1.5L", "70cl", "200ml = 200 dashes"), or null. */
export function sizeMl(s) {
  const m = SIZE_ONE.exec(String(s || ''));
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  if (u === 'ml') return Math.round(n);
  if (u === 'cl') return Math.round(n * 10);
  return Math.round(n * 1000);
}

const singular = w => {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';   // berries → berry
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1); // gordons → gordon
  return w;
};

/**
 * What's left of a product name once size, packaging, punctuation, accents and
 * category words are gone. Two names with the same key are the same product,
 * give or take the bottle size — sizeMl settles that.
 */
export function nameKey(s) {
  let t = String(s || '').toLowerCase().normalize('NFD').replace(ACCENTS, '');
  t = t.replace(/[‘’'`]/g, '');            // gordon's → gordons
  t = t.replace(/\([^)]*\)/g, ' ');                   // "(bunch)", "(400g)"
  t = t.replace(SIZE_ANY, ' ').replace(/\b\d+(?:\.\d+)?\s*(g|kg)\b/g, ' ');
  t = t.replace(/[^a-z0-9%]+/g, ' ');
  for (const [re, to] of ALIASES) t = t.replace(re, to);
  return t.split(' ')
    .filter(w => w && !CATEGORY_WORDS.has(w) && !PACK_WORDS.has(w))
    .map(singular)
    .join(' ');
}

// Garnishes get written a dozen ways across recipes: "Fresh Mint" and "Fresh
// Mint Leaves", "Edible Flower Garnish" and "Edible Flowers Garnish". They're
// bought as one thing, so they get one row.
const GARNISH_NOISE = new Set(['garnish', 'fresh', 'leaf', 'leave', 'sprig']);
export function garnishKey(s) {
  return nameKey(s).split(' ').filter(w => w && !GARNISH_NOISE.has(w)).join(' ') || nameKey(s);
}

/**
 * resolve(name) → today's inventory name for `name`, or null when there's no
 * confident match. Exact names win; otherwise the same key, and when the key
 * covers more than one bottle (Absolut 1L and 70cl) the size has to agree.
 * A single match with a different known size is refused: Smirnoff 1L is not
 * the 70cl bottle, even if it's the only Smirnoff in stock.
 */
export function makeResolver(inventory) {
  const byName = new Set();
  const byKey = new Map();
  for (const it of inventory || []) {
    if (!it || !it.n) continue;
    byName.add(it.n);
    const k = nameKey(it.n);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(it);
  }
  const itemSize = it => sizeMl(it.n) ?? sizeMl(it.size);
  return function resolve(name) {
    const raw = String(name || '').trim();
    if (!raw) return null;
    if (byName.has(raw)) return raw;
    const k = nameKey(raw);
    if (!k) return null;
    const cands = byKey.get(k);
    if (!cands || !cands.length) return null;
    const want = sizeMl(raw);
    if (cands.length === 1) {
      const have = itemSize(cands[0]);
      return want && have && want !== have ? null : cands[0].n;
    }
    if (!want) return null;
    const sized = cands.filter(c => itemSize(c) === want);
    return sized.length === 1 ? sized[0].n : null;
  };
}

// ── Moving a saved run sheet onto today's names ─────────────────────────────
const num = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
// Two rows that were the same bottle each had their own Out and In box, so the
// counts add up.
const sumCounts = (a, b) => (num(a) ?? 0) + (num(b) ?? 0);
// Text fields holding a number ("6", "12.50"): add when both are numbers,
// otherwise keep whichever was filled in.
const sumText = (a, b) => {
  const x = num(a), y = num(b);
  if (x !== null && y !== null) return String(Math.round((x + y) * 100) / 100);
  return String(a ?? '').trim() ? a : b;
};
const keepFirst = a => a;
const keepClient = (a, b) => (a === 'client' || b === 'client' ? 'client' : a);

function renameKeys(obj, ren, merge) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  let changed = false;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const nk = ren(k);
    if (nk !== k) changed = true;
    if (Object.prototype.hasOwnProperty.call(out, nk)) { out[nk] = merge(out[nk], v); changed = true; }
    else out[nk] = v;
  }
  return changed ? out : obj;
}

const NK = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Renames every product name saved on one run sheet event to today's inventory
 * name: back bar lines, Out and In counts, the shopping list and what it cost,
 * garnish costs, price fixes, who supplies what, brand swaps, per-drink product
 * changes and added ingredients. Products that have since reached Inventory
 * drop off the "not in inventory" list. Closed events are history and are left
 * exactly as they were. Returns the same object when nothing needed changing,
 * so it's safe to run on every load.
 */
export function migrateEventNames(ev, resolve) {
  if (!ev || ev.closedAt) return ev;
  // A product someone added on this sheet and hasn't pushed to Inventory yet
  // was added on purpose ("Schweppes Ginger Ale 2L" when only the 1L is
  // stocked), so it keeps its name.
  const ownNew = new Set((Array.isArray(ev.newInv) ? ev.newInv : []).filter(p => p && p.n && !p.pushed).map(p => p.n));
  const ren = n => (ownNew.has(n) ? n : resolve(n) || n);
  const next = { ...ev };
  let changed = false;
  const put = (field, value) => { if (value !== ev[field]) { next[field] = value; changed = true; } };

  if (Array.isArray(ev.extra)) {
    const seen = new Set();
    let touched = false;
    const lines = [];
    for (const e of ev.extra) {
      const raw = (e && e.n) || '';
      const n = raw.trim() ? ren(raw.trim()) : raw;
      if (n && seen.has(n)) { touched = true; continue; }   // two lines, one bottle
      if (n) seen.add(n);
      if (n !== raw) touched = true;
      lines.push(n !== raw ? { ...e, n } : e);
    }
    if (touched) put('extra', lines);
  }

  put('out', renameKeys(ev.out, ren, sumCounts));
  put('back', renameKeys(ev.back, ren, sumCounts));
  put('buy', renameKeys(ev.buy, ren, sumText));
  put('buySpend', renameKeys(ev.buySpend, ren, sumText));
  put('gCost', renameKeys(ev.gCost, ren, sumText));
  put('priceFix', renameKeys(ev.priceFix, ren, keepFirst));
  // Supplier keys are stored lower-cased.
  const ownNewNK = new Set([...ownNew].map(NK));
  put('supplier', renameKeys(ev.supplier, k => {
    if (ownNewNK.has(k)) return k;
    const c = resolve(k);
    return c ? NK(c) : k;
  }, keepClient));

  if (ev.swap && typeof ev.swap === 'object') {
    let touched = false;
    const sw = {};
    for (const [from, to] of Object.entries(ev.swap)) {
      const f = ren(from), t = ren(to);
      if (f !== from || t !== to) touched = true;
      if (f === t) { touched = true; continue; }                 // swapping a bottle for itself
      if (Object.prototype.hasOwnProperty.call(sw, f)) { touched = true; continue; }
      sw[f] = t;
    }
    if (touched) put('swap', sw);
  }

  if (ev.prod && typeof ev.prod === 'object') {
    let touched = false;
    const pr = {};
    for (const [drink, byIdx] of Object.entries(ev.prod)) {
      if (!byIdx || typeof byIdx !== 'object') { pr[drink] = byIdx; continue; }
      const m = {};
      for (const [i, p] of Object.entries(byIdx)) {
        const np = typeof p === 'string' && p ? ren(p) : p;
        if (np !== p) touched = true;
        m[i] = np;
      }
      pr[drink] = m;
    }
    if (touched) put('prod', pr);
  }

  if (ev.add && typeof ev.add === 'object') {
    let touched = false;
    const ad = {};
    for (const [drink, rows] of Object.entries(ev.add)) {
      ad[drink] = Array.isArray(rows) ? rows.map(r => {
        if (!r || !r.s) return r;
        const s = ren(r.s);
        if (s === r.s) return r;
        touched = true;
        return { ...r, s };
      }) : rows;
    }
    if (touched) put('add', ad);
  }

  // Pushed products are in Inventory now, maybe under a tidier name; an unpushed
  // one only drops off once Inventory has that exact name.
  if (Array.isArray(ev.newInv)) {
    const kept = ev.newInv.filter(p => {
      if (!p || !p.n) return true;
      const hit = resolve(p.n);
      return !(hit && (p.pushed || hit === p.n));
    });
    if (kept.length !== ev.newInv.length) put('newInv', kept);
  }

  return changed ? next : ev;
}
