'use client';
import { stockCategoryFor } from '@/lib/taxonomy';
import { matchScore, inStock, nearMatches } from '@/lib/matching';
import { createClient } from '@/lib/supabaseBrowser';
import { useEffect, useState } from 'react';
import AppShell from '../AppShell';

let idCounter = 0;
const uid = () => `item_${++idCounter}_${Date.now()}`;

const DEF_WD = ['Budweiser / Peroni', 'Ombre Juices', 'Pimms Cocktails', 'Prosecco'];
// Extra inclusions typed per-quote. The main "what's included" list is now
// GENERATED from the package + toggles (see buildInclusions) so the client PDF
// can never promise glassware on a plastics job or a tasting they don't get.
const DEF_EXTRA_INCL = [];
const DEF_SPIRITS = [
  { cat: 'Vodka', items: ['Absolut'] },
  { cat: 'Whiskey', items: ['Jameson'] },
  { cat: 'Rum', items: ['Bacardi Carta Blanca', "Captain's Spiced"] },
  { cat: 'Gin', items: ["Gordon's Pink", "Gordon's Dry"] },
  { cat: 'Wine', items: ['House Red', 'House White'] },
  { cat: 'Beer / Lager', items: ['Corona', 'Budweiser'] },
];
const DEF_SOFT = ['Coca-Cola', 'Coke Zero', 'Lemonade', 'Lemonade Zero', 'Tonic', 'Soda', 'Water', 'Cranberry Juice', 'Tropical Juice'];
const DEF_ADDONS = [
  { label: 'Toast package', desc: 'Chilled Prosecco poured for every guest during speeches for the toast', price: '', on: false },
  { label: 'Personalised bar accessories', desc: 'Bar mats (keepsake), drinks coasters, cocktail napkins & cocktail toppers/stirrers printed with event name, logo or monogram', price: '', on: false },
  { label: 'Flair bartending show', desc: 'Theatrical bar performance (subject to venue)', price: '', on: false },
  { label: 'Bar hire', desc: '4m round LED bar, non-LED bar, or bespoke unit', price: '', on: false },
  { label: 'Bar van', desc: 'Fully equipped outdoor bar van', price: '', on: false },
  { label: 'Custom bar print', desc: 'Branded bar front print', price: '', on: false },
  { label: 'Ripple machine', desc: 'Prints images onto the surface of drinks', price: '', on: false },
  { label: 'Champagne tower', desc: 'Tiered glass tower — filled and cascaded', price: '', on: false },
  { label: 'Cocktail masterclass', desc: 'Interactive session hosted by ORPI staff', price: '', on: false },
  { label: 'Neon signage', desc: 'Custom neon sign for the bar or event space', price: '', on: false },
  { label: 'Extended bar hours', desc: 'Additional service time (per hour)', price: '', on: false },
  { label: 'Additional staff', desc: 'Extra ORPI staff (per person)', price: '', on: false },
];
const DEF_COMP = ['Dry ice', 'Bubble smoke gun'];

// Half-hour slots from late morning through to 4am, because bars close late.
// Stored as minutes-from-midnight so a 1am finish is 25 hours, not "earlier
// than the start".
const TIME_SLOTS = (() => {
  const out = [];
  for (let m = 11 * 60; m <= 28 * 60; m += 30) {
    const h24 = Math.floor(m / 60) % 24;
    const mins = m % 60;
    const ampm = h24 >= 12 ? 'pm' : 'am';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    out.push({ v: m, label: `${h12}${mins ? ':' + String(mins).padStart(2, '0') : ''}${ampm}` });
  }
  return out;
})();
const slotLabel = v => (TIME_SLOTS.find(t => t.v === Number(v)) || {}).label || '';

const DURATIONS = (() => {
  const out = [];
  for (let h = 1; h <= 12; h += 0.5) out.push(`${h} hour${h === 1 ? '' : 's'}`);
  return out;
})();

// Spirits are split by type in inventory now, so a Vodka row matches Vodka
// stock directly. See lib/taxonomy for the mapping.
const stockCatFor = stockCategoryFor;

function withIds(arr) { return arr.map(v => ({ id: uid(), text: v, on: true })); }
function spiritsWithIds(rows) { return rows.map(r => ({ id: uid(), cat: r.cat, on: true, items: withIds(r.items) })); }
function addonsWithIds(arr) { return arr.map(a => ({ id: uid(), ...a })); }

// ── Cost model ───────────────────────────────────────────────
// Per-head figures pulled from real Event Costing rows in Notion, weighted
// across completed events (Jul 2025 – Aug 2026). Change them here, once.
//   Alcohol  £7.50  historical weighted average, alcohol only
//   Mixers   £1.00  16 events / 2,150 guests (weighted £0.89, median £1.00)
//   Ice      £1.00  18 events / 2,966 guests (weighted £0.94, median £1.00)
//   Garnish  £0.50  ESTIMATE — Notion has no Garnish cost type yet, so this is
//                   the only line still guessed. Add the type and it goes real.
// Drinkware is per unit, not per head. Actual glassware spend runs £2.49/head
// weighted, which at £0.65 a glass implies ~3.8 glasses a head — hence the
// default of 4, not the 5 the old panel assumed.
const COST = {
  alcoholPerHead: 7.50,
  mixersPerHead: 1.00,
  icePerHead: 1.00,
  garnishPerHead: 0.50,
  glassRate: 0.65,
  plasticRate: 0.15,
  staffRate: 16,
  leadRate: 18,
  prepRate: 16,            // shadow rate — prep is absorbed by directors
  setupHrs: 4,             // on site 4 hours before service
  packdownHrs: 1.5,
  tastingThreshold: 150,   // guests at/above which a tasting is included
  tastingChargePerHead: 20,
  tastingIngredientsPerHead: 10,
  tastingStaffHours: 3,
  tastingDefaultGuests: 4,
};

// ── What the £7.50 is actually made of ──────────────────────────────
// Every alcohol line ever logged in Event Costing, split by category. Syrups
// were miscategorised as Alcohol (£0.05/head) and are stripped out here — they
// belong under mixers. That leaves a £7.45 base.
// Components switch off when the client quote doesn't include them, which is
// why dropping wine from a package actually moves the cost.
const ALCOHOL_MIX = [
  { key: 'spirits',  label: 'Spirits',  perHead: 6.07, tiered: true },
  { key: 'beer',     label: 'Beer',     perHead: 0.54 },
  { key: 'liqueurs', label: 'Liqueurs', perHead: 0.44 },
  { key: 'prosecco', label: 'Prosecco', perHead: 0.30 },
  { key: 'wine',     label: 'Wine',     perHead: 0.10 },
];

// ── Welcome drinks ──────────────────────────────────────────────────
// The standard tray: prosecco, beers, one welcome cocktail, one welcome
// mocktail. Costed per serve from ORPI's own prices — prosecco is Freixenet at
// £7.23/75cl over six 125ml pours, beer is Birra Moretti 330ml, and the two
// mixed drinks are the medians of the eight welcome cocktails and eight welcome
// mocktails in the library.
//
// Same rule as ALCOHOL_MIX: a component only costs anything when it's actually
// on the tray, read from the welcome drinks list on the client quote. Take the
// prosecco off and the cost drops.
const WELCOME_MIX = [
  { key: 'prosecco', label: 'Prosecco',         perServe: 1.21 },
  { key: 'beer',     label: 'Beer',             perServe: 0.85 },
  { key: 'cocktail', label: 'Welcome cocktail', perServe: 2.11 },
  { key: 'mocktail', label: 'Welcome mocktail', perServe: 1.09 },
];

// How many drinks a guest gets through per hour of arrival drinks. A guess
// until enough events close through the run sheet to measure it — editable on
// the quote so it can be corrected without a deploy.
const WELCOME_PER_HOUR = 1.0;

// Spirit grade multiplier, applied to the spirits component only — upgrading
// the vodka doesn't make the beer cost more.
// Derived from real purchase prices: premium brands (Grey Goose, Ciroc,
// Hennessy, Black Label, Woodford, Bombay) run £34.95/litre against £21.62 for
// the house list, and past events blend the two at roughly 46/54. Index 1.00
// is that historical blend, which is what produced the £7.50 figure — so
// "premium" is an uplift on the blend, not on a clean house baseline.
const SPIRIT_TIERS = {
  house:    { label: 'House',    index: 0.83, note: 'Absolut, Gordon\'s, Jameson, Bacardi' },
  standard: { label: 'Standard', index: 1.00, note: 'the house/premium mix we actually book' },
  premium:  { label: 'Premium',  index: 1.33, note: 'Grey Goose, Ciroc, Black Label throughout' },
  luxury:   { label: 'Luxury',   index: 1.85, note: 'estimate — no luxury events logged yet' },
};

// Drinkware presets → units per head. "Mixed" is the normal ORPI night:
// real glass through service, plastics for the late-night tail.
const DRINKWARE = {
  mixed:   { label: 'Glass + late-night plastics', glass: 4, plastic: 1.5 },
  glass:   { label: 'Glassware only',              glass: 5, plastic: 0 },
  plastic: { label: 'Plastics only',               glass: 0, plastic: 6 },
};

// Every cost that should be considered before a quote goes out. `auto` lines
// are computed by the model and resolve themselves; the rest need either a
// one-off cost line or an explicit "n/a" before the margin figure commits.
const COST_CHECKS = [
  { key: 'alcohol',     label: 'Alcohol',                   auto: true },
  { key: 'welcome',     label: 'Welcome drinks',            auto: 'conditional' },
  { key: 'mixers',      label: 'Mixers & soft drinks',      auto: true },
  { key: 'ice',         label: 'Ice',                       auto: true },
  { key: 'garnish',     label: 'Garnishes & sundries',      auto: true },
  { key: 'drinkware',   label: 'Glassware / plastics',      auto: true },
  { key: 'staff',       label: 'Staff (incl. set-up)',      auto: true },
  { key: 'tasting',     label: 'Drinks tasting',            auto: 'conditional' },
  { key: 'travel',      label: 'Staff travel (receipts)' },
  { key: 'van',         label: 'Van, fuel & parking' },
  { key: 'prints',      label: 'Printed menus & signage' },
  { key: 'barhire',     label: 'Bar hire, structure & décor' },
  { key: 'equipment',   label: 'Equipment hire' },
  { key: 'accom',       label: 'Accommodation' },
  { key: 'contingency', label: 'Contingency' },
];

// Base price-per-head defaults. NOTE: these were set against the old
// alcohol-only cost model. True cost per head is now ~£17–18 on a mid-size
// event, so Premium still clears 60% but the cheaper packages do not —
// revisit this table before leaning on the suggested-price button.
// { glass, plastic } per package. Suggested only — the typed base always wins.
const PPH = {
  'Premium': { glass: 45, plastic: 35 },
  'Ultimate': { glass: 55, plastic: 45 },
  'Full Bar': { glass: 40, plastic: 30 },
  'Cocktail Experience': { glass: 24, plastic: 20 },
  'Welcome Drinks Only': { glass: 15, plastic: 12 },
  'Bar Only (client supplies alcohol)': { glass: 15, plastic: 12 },
  'Custom': { glass: 0, plastic: 0 },
};

// Default crew at 1 per 50 guests: one lead, the rest bartenders. Returned
// only when the user hasn't set their own crew — staffRows === null means
// "use the default", any array means they've taken control of it.
function defaultCrew(guests) {
  const g = Number(guests) || 0;
  if (!g) return [];
  const n = Math.max(1, Math.ceil(g / 50));
  const crew = [{ id: 'crew_lead', role: 'Lead bartender', count: 1, rate: COST.leadRate }];
  if (n > 1) crew.push({ id: 'crew_bar', role: 'Bartender', count: n - 1, rate: COST.staffRate });
  return crew;
}
function crewFor(s) {
  return Array.isArray(s.staffRows) ? s.staffRows : defaultCrew(s.guests);
}
function num(v, fallback = 0) {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}
function hoursFrom(text) {
  return parseFloat(String(text || '').replace(/[^0-9.]/g, '')) || 0;
}

// Which alcohol components this quote actually includes. Driven by the spirit
// rows on the client-facing quote, so a package without wine isn't costed for
// wine — and the printed inclusions can't claim it either.
function alcoholParts(s) {
  const rows = (s.spiritRows || []).filter(r => r.on && r.items.some(i => i.on && i.text.trim()));
  // "Peroni 0%" matches /beer/ and "Non-Alcoholic Wine" matches /wine/, so
  // alcohol-free rows are filtered out once, up front, rather than guarded at
  // every test below.
  const dry = /non.?alcohol|alcohol.?free|\b0%/i;
  const wet = rows.filter(r => !dry.test(r.cat));
  const has = re => wet.some(r => re.test(r.cat));
  const toastOn = (s.addons || []).some(a => a.on && /toast/i.test(a.label));
  const beer = has(/beer|lager|cider/i);
  const wine = has(/\bwine\b/i);
  const prosecco = has(/prosecco|champagne|sparkl|fizz/i) || toastOn;
  const spirits = wet.some(r => !/beer|lager|cider|\bwine\b|prosecco|champagne|sparkl|fizz/i.test(r.cat));
  return { spirits, beer, wine, prosecco, liqueurs: spirits };
}

// The client-facing phrase for the alcohol line, built from what's actually on.
function alcoholLine(s) {
  const parts = alcoholParts(s);
  const grade = SPIRIT_TIERS[s.spiritTier] ? SPIRIT_TIERS[s.spiritTier].label : 'House';
  const bits = [];
  if (parts.spirits) bits.push(`${grade === 'Standard' ? 'House' : grade} spirits`);
  if (parts.beer) bits.push('beer');
  if (parts.wine) bits.push('wine');
  if (parts.prosecco) bits.push('prosecco');
  if (!bits.length) return null;
  if (bits.length === 1) return bits[0];
  return bits.slice(0, -1).join(', ') + ' & ' + bits[bits.length - 1];
}

// Alcohol cost per head: sum the live components, tier the spirits, and let a
// typed override beat the lot.
function alcoholPerHead(s) {
  if (s.pkg === 'Bar Only (client supplies alcohol)') return 0;
  const manual = parseFloat(s.alcoholOverride);
  if (!isNaN(manual) && manual >= 0) return manual;
  const parts = alcoholParts(s);
  const tier = SPIRIT_TIERS[s.spiritTier] || SPIRIT_TIERS.standard;
  return ALCOHOL_MIX.reduce((sum, m) => {
    if (!parts[m.key]) return sum;
    return sum + m.perHead * (m.tiered ? tier.index : 1);
  }, 0);
}

// Which of the four welcome components are actually on the tray, read from the
// welcome drinks list the client sees. Classified most specific first, so
// "Pimms Cocktails" lands as a cocktail rather than being caught by something
// broader, and "Ombre Juices" as the mocktail it is.
const WELCOME_MATCH = [
  ['mocktail', /mocktail|virgin|non.?alcohol|alcohol.?free|juice|ombre|lemonade|press[eé]|soft/i],
  ['cocktail', /cocktail|spritz|pimms|aperol|hugo|bellini|martini|punch|sangria|mojito/i],
  ['prosecco', /prosecco|champagne|cava|sparkl|fizz|bubbl|moet|freixenet|lanson/i],
  ['beer',     /beer|lager|cider|peroni|moretti|budweiser|\bbud\b|kingfisher|estrella|corona|heineken|stella|birra/i],
];

function welcomeParts(s) {
  const out = { prosecco: false, beer: false, cocktail: false, mocktail: false };
  if (!s.wdOn) return out;
  (s.wdItems || []).forEach(i => {
    if (!i.on || !i.text.trim()) return;
    const hit = WELCOME_MATCH.find(([, re]) => re.test(i.text));
    if (hit) out[hit[0]] = true;
  });
  return out;
}

// Welcome drinks cost per head. Drinks per head comes from the duration already
// on the quote; the cost of each one is the average of whatever's on the tray,
// since a guest takes one drink from the selection rather than one of each.
function welcomePerHead(s) {
  if (!s.wdOn) return 0;
  const parts = welcomeParts(s);
  const live = WELCOME_MIX.filter(m => parts[m.key]);
  if (!live.length) return 0;
  const perDrink = live.reduce((t, m) => t + m.perServe, 0) / live.length;
  const perHour = num(s.wdPerHour, WELCOME_PER_HOUR);
  return hoursFrom(s.wdDur) * perHour * perDrink;
}

// Is a tasting part of this quote? 'auto' follows the guest threshold; the
// other three are manual overrides for the odd case.
function tastingState(s) {
  const g = Number(s.guests) || 0;
  if (s.tastingMode === 'included') return 'included';
  if (s.tastingMode === 'charged') return 'charged';
  if (s.tastingMode === 'none') return 'none';
  return g >= COST.tastingThreshold ? 'included' : 'none';
}

// The single source of truth for what this event costs us. Both the internal
// panel and the generated client inclusions read from here, so the two can't
// drift apart.
function computeCosts(s) {
  const g = Number(s.guests) || 0;
  const serviceHrs = hoursFrom(s.duration);
  const setupHrs = num(s.setupHrs, COST.setupHrs);
  const packdownHrs = num(s.packdownHrs, COST.packdownHrs);
  const paidHrs = setupHrs + serviceHrs + packdownHrs;

  const crew = crewFor(s);
  const headcount = crew.reduce((n, r) => n + num(r.count), 0);
  const crewCostPerHour = crew.reduce((sum, r) => sum + num(r.count) * num(r.rate), 0);
  const staffCost = crewCostPerHour * paidHrs;

  // Prep is real time that currently costs no cash — the directors absorb it.
  // Shown as a shadow figure so it's visible without distorting margin. Put a
  // rate in the box the day someone starts getting paid for it.
  const prepHrs = num(s.prepHrs);
  const prepRate = num(s.prepRate, 0);
  const prepCost = prepHrs * prepRate;
  const prepShadow = prepHrs * COST.prepRate;

  const isClientAlcohol = s.pkg === 'Bar Only (client supplies alcohol)';
  const alcPerHead = alcoholPerHead(s);
  const alcCost = alcPerHead * g;
  const alcParts = alcoholParts(s);
  const alcManual = !isNaN(parseFloat(s.alcoholOverride)) && parseFloat(s.alcoholOverride) >= 0;
  const mixersCost = COST.mixersPerHead * g;
  const iceCost = COST.icePerHead * g;
  const garnishCost = COST.garnishPerHead * g;

  // Arrival drinks, costed separately from the bar. Zero the moment welcome
  // drinks are switched off, or when nothing on the tray is recognisable.
  const wdParts = welcomeParts(s);
  const wdPerHead = welcomePerHead(s);
  const wdCost = wdPerHead * g;
  const wdHours = s.wdOn ? hoursFrom(s.wdDur) : 0;
  const wdPerHour = num(s.wdPerHour, WELCOME_PER_HOUR);
  const wdDrinks = wdHours * wdPerHour;
  const wdLive = WELCOME_MIX.filter(m => wdParts[m.key]);

  const glassPerHead = num(s.glassPerHead, DRINKWARE.mixed.glass);
  const plasticPerHead = num(s.plasticPerHead, DRINKWARE.mixed.plastic);
  const glassCost = glassPerHead * COST.glassRate * g;
  const plasticCost = plasticPerHead * COST.plasticRate * g;
  const drinkwareCost = glassCost + plasticCost;

  const tasting = tastingState(s);
  const tGuests = num(s.tastingGuests, COST.tastingDefaultGuests);
  const tastingCost = tasting === 'none' ? 0
    : tGuests * COST.tastingIngredientsPerHead + COST.tastingStaffHours * COST.staffRate;
  const tastingCharge = tasting === 'charged' ? tGuests * COST.tastingChargePerHead : 0;

  const oneOffs = s.costLines.reduce((sum, l) => sum + num(l.qty) * num(l.unitCost), 0);

  const internalCost = alcCost + wdCost + mixersCost + iceCost + garnishCost
    + drinkwareCost + staffCost + prepCost + tastingCost + oneOffs;

  return {
    g, serviceHrs, setupHrs, packdownHrs, paidHrs, crew, headcount, crewCostPerHour,
    staffCost, prepHrs, prepCost, prepShadow, isClientAlcohol, alcPerHead, alcCost,
    alcParts, alcManual,
    wdParts, wdPerHead, wdCost, wdHours, wdPerHour, wdDrinks, wdLive,
    mixersCost, iceCost, garnishCost, glassPerHead, plasticPerHead, glassCost,
    plasticCost, drinkwareCost, tasting, tGuests, tastingCost, tastingCharge,
    oneOffs, internalCost,
    costPerHead: g ? internalCost / g : 0,
  };
}

// Which checklist lines are still hanging. Auto lines resolve themselves; a
// manual line is settled by an "n/a" tick or by a one-off cost tagged to it.
function unresolvedChecks(s) {
  const tagged = new Set(s.costLines.map(l => l.check).filter(Boolean));
  return COST_CHECKS.filter(c => {
    if (c.auto) return false; // tasting included/charged is costed in the model
    if ((s.costChecks || {})[c.key] === 'na') return false;
    return !tagged.has(c.key);
  });
}

// The client-facing inclusions list, generated rather than typed, so it always
// matches the quote it's printed on.
function buildInclusions(s) {
  const c = computeCosts(s);
  const out = [];

  if (pkgShows(s.pkg).cocktails && (s.nct > 0 || s.nmt > 0)) {
    out.push(`${s.nct} bespoke cocktail${s.nct !== 1 ? 's' : ''} & ${s.nmt} mocktail${s.nmt !== 1 ? 's' : ''} from our menu`);
  }
  out.push(c.headcount
    ? `Professional bar team — ${c.headcount} ORPI staff for your ${c.g} guests`
    : 'Professional bar staff scaled to your guest count');

  if (c.glassPerHead > 0 && c.plasticPerHead > 0) out.push('Standard glassware, with premium disposables late in the night');
  else if (c.glassPerHead > 0) out.push('Standard glassware throughout');
  else if (c.plasticPerHead > 0) out.push('Premium disposable barware throughout');

  out.push('Cubed & crushed ice');
  out.push('Garnishes, straws & napkins');
  out.push('Bar caddies & bar-top styling');
  out.push('Standard back-bar décor');
  out.push('Bespoke printed menus');
  out.push('Set-up, service & pack-down');
  out.push('Stock planning & bar management');
  const shows = pkgShows(s.pkg);
  const alc = shows.alcohol ? alcoholLine(s) : null;
  if (alc) out.push(alc.charAt(0).toUpperCase() + alc.slice(1));
  // Say it plainly rather than leave a gap the client has to notice.
  if (!shows.alcohol && s.pkg === 'Bar Only (client supplies alcohol)') {
    out.push('Full bar service — you supply the alcohol');
  }
  if (pkgShows(s.pkg).softs) out.push('Full soft drinks & mixer range');
  if (c.tasting === 'included') out.push('Pre-event drinks tasting');
  if (s.wdOn) out.push(`${s.wdDur} of welcome drinks on arrival`);

  s.inclItems.filter(i => i.on && i.text.trim()).forEach(i => out.push(i.text.trim()));
  return out;
}

// ── Client message ───────────────────────────────────────────
// The WhatsApp/email message that goes out with the quote, built from the
// quote itself so it can never say something the PDF doesn't.

// "Mendhi/Sangeet" reads badly in "Kaveena's ..." — these are the versions a
// client sees.
const ETYPE_SAID = {
  'Wedding Reception': 'Wedding Reception',
  'Mendhi/Sangeet': 'Mendhi',
  'Jago': 'Jago',
  'Engagement': 'Engagement',
  'Birthday Party': 'Birthday',
  'Corporate': 'Event',
  'House Party': 'Party',
  'Other': 'Event',
};

// What a client is buying, per package. The PDF reads from this rather than
// showing every section regardless — a Bar Only quote listing our spirits is
// promising something the client is supplying themselves, and a Welcome Drinks
// quote with a full back bar on it invites an awkward conversation on the day.
const PKG_SHOWS = {
  'Premium':                            { alcohol: true,  softs: true,  cocktails: true,  welcome: true },
  'Ultimate':                           { alcohol: true,  softs: true,  cocktails: true,  welcome: true },
  'Full Bar':                           { alcohol: true,  softs: true,  cocktails: true,  welcome: true },
  'Cocktail Experience':                { alcohol: false, softs: true,  cocktails: true,  welcome: true },
  'Welcome Drinks Only':                { alcohol: false, softs: true,  cocktails: false, welcome: true },
  'Bar Only (client supplies alcohol)': { alcohol: false, softs: true,  cocktails: true,  welcome: true },
  'Custom':                             { alcohol: true,  softs: true,  cocktails: true,  welcome: true },
};
const pkgShows = pkg => PKG_SHOWS[pkg] || PKG_SHOWS['Custom'];

const PKG_SAID = {
  'Premium': 'Premium Bar Service',
  'Ultimate': 'Unlimited Bar Service',
  'Full Bar': 'Full Open Bar Service',
  'Cocktail Experience': 'Cocktail Experience',
  'Welcome Drinks Only': 'Welcome Drinks Service',
  'Bar Only (client supplies alcohol)': 'Bar Service',
  'Custom': 'Bar Service',
};

function fmtOrdinal(d) {
  if (!d) return null;
  try {
    const dt = new Date(d + 'T12:00:00');
    const day = dt.getDate();
    const suf = (day % 10 === 1 && day !== 11) ? 'st'
      : (day % 10 === 2 && day !== 12) ? 'nd'
      : (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
    return `${day}${suf} ${dt.toLocaleDateString('en-GB', { month: 'long' })} ${dt.getFullYear()}`;
  } catch { return d; }
}

function joinList(arr) {
  const a = arr.filter(Boolean);
  if (!a.length) return null;
  if (a.length === 1) return a[0];
  return a.slice(0, -1).join(', ') + ' & ' + a[a.length - 1];
}

// Builds the message and reports anything it had to leave a gap for, so a
// half-finished quote can't be sent looking complete.
function buildClientMessage(s, total) {
  const gaps = [];
  const need = (v, label) => { if (v == null || v === '' ) { gaps.push(label); return `[${label}]`; } return v; };

  const c = computeCosts(s);
  const L = [];

  const etype = ETYPE_SAID[s.etype] || s.etype || 'event';
  L.push('Hiii! Hope you\'re keeping well!');
  L.push('');
  L.push(`Here's the quote for ${need(s.client && s.client.trim(), 'client name')}'s ${etype} \u{1F389}`);
  L.push('');
  L.push(`\u{1F4CD} ${need(s.venue && s.venue.trim(), 'venue')}`);
  L.push(`\u{1F4C5} ${need(fmtOrdinal(s.edate), 'event date')}`);
  L.push(`\u{23F1}\u{FE0F} ${need(s.duration && s.duration.trim(), 'duration')}${s.etime && s.etime.trim() ? `, ${s.etime.trim()}` : ' (timings TBC)'}`);
  L.push(`\u{1F465} ${need(s.guests, 'guest count')} guests`);
  L.push('');

  L.push(`\u{1F379} ${PKG_SAID[s.pkg] || 'Bar Service'} including:`);

  // Spirits: grade word plus the brands actually ticked on the quote.
  const parts = alcoholParts(s);
  if (parts.spirits) {
    const tier = SPIRIT_TIERS[s.spiritTier] || SPIRIT_TIERS.standard;
    const grade = (tier.label === 'Standard' || tier.label === 'House') ? 'House' : tier.label;
    const brands = s.spiritRows
      .filter(r => r.on && !/beer|lager|cider|\bwine\b|prosecco|champagne|sparkl/i.test(r.cat))
      .flatMap(r => r.items.filter(i => i.on && i.text.trim()).map(i => i.text.trim()));
    const shown = brands.slice(0, 5).join(', ');
    const suffix = brands.length > 5 ? ' + more' : '';
    L.push(`\u{1F943} ${grade} spirits${shown ? ` (${shown}${suffix})` : ''}`);
  }

  const bw = joinList([parts.beer && 'beer', parts.wine && 'wine', parts.prosecco && 'prosecco']);
  if (bw) L.push(`\u{1F37A} Full ${bw} selection`);

  if (s.nct > 0 || s.nmt > 0) {
    const named = [...s.cocktailNames.slice(0, s.nct), ...s.mocktailNames.slice(0, s.nmt)].filter(n => n && n.trim());
    const count = [
      s.nct > 0 && `${s.nct} cocktail${s.nct !== 1 ? 's' : ''}`,
      s.nmt > 0 && `${s.nmt} mocktail${s.nmt !== 1 ? 's' : ''}`,
    ].filter(Boolean).join(' & ');
    const total2 = s.nct + s.nmt;
    L.push(`\u{1F378} ${count}${named.length === total2 ? ` (${named.join(', ')})` : ' (TBC)'}`);
  }

  const softs = s.softItems.filter(i => i.on && i.text.trim());
  if (softs.length) L.push('\u{1F964} Full soft drinks selection');

  if (s.wdOn) {
    const wd = s.wdItems.filter(i => i.on && i.text.trim()).map(i => i.text.trim());
    L.push(`\u{1F942} ${s.wdDur} of welcome drinks${wd.length ? ` (${wd.join(', ')})` : ''}`);
  }

  // Bar, glassware and décor on one line — the bar itself only if it's hired.
  // Any ticked add-on that is actually a bar unit leads this line. Prints,
  // accessories and masterclasses mention "bar" too, so they're excluded.
  const barAddon = s.addons.find(a => a.on && /\bbar\b/i.test(a.label) && !/print|accessor|menu|masterclass|staff|hour/i.test(a.label));
  const drink = c.glassPerHead > 0 ? 'full glassware' : 'premium disposable barware';
  L.push(`\u{2728} ${joinList([barAddon && barAddon.label, drink, 'garnishes', 'bar d\u00e9cor'])}`);

  if (c.headcount) L.push(`\u{1F454} Minimum ${c.headcount} ORPI staff`);

  // These land mid-sentence, so drop the leading capital unless it's an
  // acronym or brand that's capitalised throughout.
  const deCap = t => (t === t.toUpperCase() ? t : t.charAt(0).toLowerCase() + t.slice(1));
  const comp = s.compItems.filter(i => i.on && i.text.trim()).map(i => deCap(i.text.trim()));
  if (comp.length) L.push(`\u{1F381} Complimentary ${comp.join(' + ')}`);

  // Priced extras are named but never itemised — same rule as the PDF.
  const extras = s.addons
    .filter(a => a.on && parseFloat(a.price) > 0 && !(barAddon && a.id === barAddon.id))
    .map(a => a.label);
  if (extras.length) L.push(`\u{1F38A} Plus ${joinList(extras)}`);

  if (c.tasting === 'included') L.push('\u{1F37E} Pre-event drinks tasting included');

  L.push('');
  L.push(`\u{1F4B7} Total: ${total > 0 ? '\u00a3' + Math.round(total).toLocaleString('en-GB') : need(null, 'total')}`);
  L.push('');
  L.push('Let us know if anything needs tweaking - happy to help! \u{1F64C}');
  L.push('');
  L.push(s.salesPerson === 'Ruds' ? 'Rudhra' : s.salesPerson);
  L.push('ORPI Events');

  return { text: L.join('\n'), gaps: [...new Set(gaps)] };
}

// ── Quote drafts ───────────────────────────────────────────────
// A quote is an hour of decisions — packages, crew, drinkware, the drinks list,
// the margin. Saving to Notion records the headline figure; this keeps the
// whole thing, so coming back to change a guest count doesn't mean rebuilding
// it from scratch.
//
// Keyed by enquiry, in the same shared table the run sheet uses, so a quote
// started on a laptop can be finished anywhere.
const draftKey = enquiryId => `quote:${enquiryId}`;

async function loadDraft(enquiryId) {
  if (!enquiryId) return null;
  try {
    const { data } = await createClient()
      .from('app_state').select('value').eq('key', draftKey(enquiryId)).maybeSingle();
    return data?.value || null;
  } catch { return null; }
}

async function saveDraft(enquiryId, state) {
  if (!enquiryId) return false;
  try {
    const { error } = await createClient().from('app_state').upsert({
      key: draftKey(enquiryId), value: state, updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    return !error;
  } catch { return false; }
}

function freshState() {
  return {
    doctype: 'quote', invNum: '', date: new Date().toISOString().split('T')[0], due: '', salesPerson: 'Ruds',
    enquiryId: null, client: '', etype: 'Wedding Reception', venue: '', edate: '', etime: '', guests: '',
    pkg: 'Full Bar', duration: '', setup: '',
    // Bar open/close as half-hour slots. Picking both fills etime and duration.
    startMin: '', endMin: '',
    // Paid staff hours are set-up + service + pack-down, not service alone.
    // Service comes from `duration`; these two are the parts that were missing.
    setupHrs: String(COST.setupHrs), packdownHrs: String(COST.packdownHrs),
    // Prep (batching, syrups, garnish prep) is currently absorbed by the
    // directors, so it carries hours but no rate. Set a rate to make it real.
    prepHrs: '', prepRate: '',
    // null = use the 1-per-50 default crew; an array = Ruds has set it himself
    staffRows: null,
    drinkware: 'mixed', glassPerHead: DRINKWARE.mixed.glass, plasticPerHead: DRINKWARE.mixed.plastic,
    tastingMode: 'auto', tastingGuests: COST.tastingDefaultGuests,
    // Spirit grade drives the alcohol cost per head. Override beats it outright.
    spiritTier: 'standard', alcoholOverride: '',
    costChecks: {},
    wdOn: true, wdDur: '2 hours', wdItems: withIds(DEF_WD), wdPerHour: WELCOME_PER_HOUR,
    inclItems: withIds(DEF_EXTRA_INCL),
    spiritRows: spiritsWithIds(DEF_SPIRITS),
    softItems: withIds(DEF_SOFT),
    nct: 3, nmt: 2, cocktailNames: ['', '', ''], mocktailNames: ['', ''],
    addons: addonsWithIds(DEF_ADDONS),
    compItems: withIds(DEF_COMP),
    notes: '', base: '', disc: '',
    // ── Internal costing (never printed on client quote) ──
    // Each line has: { id, category, name, qty, unitCost, inventoryId? }
    // inventoryId links to a live Inventory Item so unit cost stays current
    // if we edit before saving. Free-text lines don't need it.
    costLines: [],
    marginPct: '60',
  };
}

export default function QuoteClient({ userEmail }) {
  const [s, setS] = useState(freshState);
  const [enquiries, setEnquiries] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [templateMsg, setTemplateMsg] = useState('');

  // Fields that survive being "reset" back to default — client-specific
  // things (name, date, guests, base price, invoice number) are always
  // wiped when loading the template; brand structure carries over.
  const TEMPLATE_FIELDS = [
    'salesPerson', 'pkg', 'duration', 'setup', 'startMin', 'endMin',
    'setupHrs', 'packdownHrs', 'drinkware', 'glassPerHead', 'plasticPerHead',
    'tastingMode', 'tastingGuests', 'spiritTier',
    'wdOn', 'wdDur', 'wdItems', 'wdPerHour',
    'inclItems', 'spiritRows', 'softItems',
    'nct', 'nmt', 'addons', 'compItems',
  ];
  const templateKey = `orpi-quote-template::${userEmail || 'default'}`;

  useEffect(() => {
    fetch('/api/enquiries').then(r => r.json()).then(res => {
      if (!res.error) setEnquiries(res.enquiries || []);
    });
    fetch('/api/stock').then(r => r.json()).then(res => {
      if (!res.error) setStockItems(res.items || []);
    });
    // Auto-load the saved template on first render (if one exists) so a
    // fresh quote starts from your saved structure, not the built-in default.
    try {
      const raw = localStorage.getItem(templateKey);
      if (raw) {
        const saved = JSON.parse(raw);
        setS(prev => ({ ...prev, ...saved }));
      }
    } catch { /* ignore corrupt or missing */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveAsTemplate() {
    try {
      const toSave = {};
      TEMPLATE_FIELDS.forEach(k => { toSave[k] = s[k]; });
      localStorage.setItem(templateKey, JSON.stringify(toSave));
      setTemplateMsg('✓ Saved as your default quote template');
      setTimeout(() => setTemplateMsg(''), 3500);
    } catch (err) {
      alert('Could not save template: ' + err.message);
    }
  }

  function clearTemplate() {
    if (!confirm('Reset your default quote template? Future quotes will start from the built-in default.')) return;
    try {
      localStorage.removeItem(templateKey);
      setTemplateMsg('Default template cleared');
      setTimeout(() => setTemplateMsg(''), 3500);
    } catch {}
  }

  function set(patch) { setS(prev => ({ ...prev, ...patch })); }

  const [draftMsg, setDraftMsg] = useState('');
  const [draftDirty, setDraftDirty] = useState(false);

  // Auto-save once there's an enquiry to file it against. Debounced so it isn't
  // writing on every keystroke, and quiet about it — the only time you should
  // notice is when it fails.
  useEffect(() => {
    if (!s.enquiryId) return;
    setDraftDirty(true);
    const t = setTimeout(async () => {
      const ok = await saveDraft(s.enquiryId, { ...s, savedAt: new Date().toISOString() });
      setDraftDirty(false);
      setDraftMsg(ok ? `Draft saved ${new Date().toLocaleTimeString().slice(0, 5)}` : 'Draft not saved — no connection');
    }, 1200);
    return () => clearTimeout(t);
  }, [s]);

  async function loadFromEnquiry(id) {
    if (!id) return;
    const e = enquiries.find(x => x.id === id);
    if (!e) return;

    // If this enquiry was quoted before, pick up where it was left rather than
    // starting again. Asks first, because the current quote may be wanted.
    const saved = await loadDraft(id);
    if (saved) {
      const when = saved.savedAt ? new Date(saved.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
      const ok = confirm(
        `There's a saved quote for ${e.name || 'this enquiry'}${when ? ` from ${when}` : ''}.\n\n`
        + 'Open it? Cancel starts a fresh quote from the enquiry details.'
      );
      if (ok) {
        setS({ ...freshState(), ...saved, enquiryId: id });
        setDraftMsg('Saved quote opened');
        return;
      }
    }

    set({
      enquiryId: e.id, client: e.name || '', venue: e.venue || '',
      edate: e.eventDate || '', guests: e.guestCount ?? '',
      etype: e.eventType || s.etype,
    });
  }

  const addonTotal = s.addons.filter(a => a.on && parseFloat(a.price) > 0).reduce((sum, a) => sum + parseFloat(a.price), 0);
  const base = parseFloat(s.base) || 0;
  const disc = parseFloat(s.disc) || 0;
  const total = Math.max(0, base + addonTotal - disc);
  const dep = total * 0.5;

  async function saveToNotion() {
    if (!s.client.trim()) { alert('Please enter a client name first.'); return; }
    setSaving(true);
    setSaveMsg('');
    try {
      // Compose brand strings from the quote's structured entry
      // — these become the "review & confirm" seed on the booking's
      // Event-specific selections when the enquiry is marked Won.
      const quotedSpirits = s.spiritRows
        .filter(r => r.on)
        .map(r => {
          const items = r.items.filter(i => i.on && i.text.trim()).map(i => i.text.trim());
          return items.length ? `${r.cat}: ${items.join(', ')}` : null;
        })
        .filter(Boolean)
        .join('\n');
      const quotedSoftDrinks = s.softItems
        .filter(i => i.on && i.text.trim())
        .map(i => i.text.trim())
        .join(', ');
      // Beer is a sub-row of spirits with cat 'Beer / Lager' — extracted
      // separately so it can be edited independently on the booking.
      const beerRow = s.spiritRows.find(r => /beer|lager/i.test(r.cat));
      const quotedBeer = beerRow?.on
        ? beerRow.items.filter(i => i.on && i.text.trim()).map(i => i.text.trim()).join(', ')
        : '';

      const res = await fetch('/api/quotes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enquiryId: s.enquiryId, name: s.client, amount: base, doctype: s.doctype,
          quotedSpirits, quotedBeer, quotedSoftDrinks,
        }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);

      // Anything on this quote that stock has never heard of becomes a draft
      // inventory row, ticked "Needs setup". No size, no price — those get
      // filled in by whoever buys it, which is the only person who knows
      // whether it's the 70cl or the 1L.
      const drinks = [
        ...s.spiritRows.filter(r => r.on).flatMap(r =>
          r.items.filter(i => i.on && i.text.trim()).map(i => ({ name: i.text.trim(), cat: stockCatFor(r.cat) }))),
        ...s.softItems.filter(i => i.on && i.text.trim()).map(i => ({ name: i.text.trim(), cat: 'Mixer' })),
        ...s.wdItems.filter(i => i.on && i.text.trim()).map(i => ({ name: i.text.trim(), cat: null })),
      ];
      const seen = new Set();
      const drafts = drinks.filter(d => {
        const k = d.name.toLowerCase();
        if (seen.has(k) || inStock(d.name, stockItems)) return false;
        seen.add(k);
        return true;
      });

      let extra = '';
      if (drafts.length) {
        const r = await fetch('/api/inventory/draft', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: drafts }),
        }).then(x => x.json()).catch(() => ({ error: 'request failed' }));
        extra = r.error
          ? ` · couldn't add ${drafts.length} new product${drafts.length === 1 ? '' : 's'} to Inventory`
          : ` · ${r.created} new product${r.created === 1 ? '' : 's'} added to Inventory, needs setup`;
      }

      setSaveMsg('✓ Saved to Notion' + extra);
      setTimeout(() => setSaveMsg(''), 6000);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function resetAll() {
    if (!confirm('Reset the quote builder? Client-specific fields will be cleared; your saved template (if any) will be restored.')) return;
    const fresh = freshState();
    try {
      const raw = localStorage.getItem(templateKey);
      if (raw) {
        const saved = JSON.parse(raw);
        setS({ ...fresh, ...saved });
        return;
      }
    } catch { /* fall through to blank */ }
    setS(fresh);
  }

  // ── Cost line handlers ──────────────────────────────────────────────
  function addCostLine(partial = {}) {
    const line = {
      id: uid(),
      category: 'Alcohol',
      name: '',
      qty: '',
      unitCost: '',
      inventoryId: null,
      check: null,   // ties this line to a COST_CHECKS key, if it came from one
      ...partial,
    };
    setS(prev => ({ ...prev, costLines: [...prev.costLines, line] }));
  }

  function updateCostLine(id, patch) {
    setS(prev => ({
      ...prev,
      costLines: prev.costLines.map(l => l.id === id ? { ...l, ...patch } : l),
    }));
  }

  function removeCostLine(id) {
    setS(prev => ({ ...prev, costLines: prev.costLines.filter(l => l.id !== id) }));
  }

  // Toggles a checklist line between "not applicable" and unresolved.
  function toggleCheck(key) {
    setS(prev => {
      const next = { ...(prev.costChecks || {}) };
      if (next[key] === 'na') delete next[key]; else next[key] = 'na';
      return { ...prev, costChecks: next };
    });
  }

  return (
    <AppShell active="/quotes" userEmail={userEmail}>
      <QuoteBuilderUI
        s={s} set={set} enquiries={enquiries} loadFromEnquiry={loadFromEnquiry}
        addonTotal={addonTotal} total={total} dep={dep}
        saving={saving} saveMsg={saveMsg} saveToNotion={saveToNotion} resetAll={resetAll}
        draftMsg={draftMsg} draftDirty={draftDirty}
        saveAsTemplate={saveAsTemplate} clearTemplate={clearTemplate} templateMsg={templateMsg}
        stockItems={stockItems}
        addCostLine={addCostLine} updateCostLine={updateCostLine} removeCostLine={removeCostLine}
        toggleCheck={toggleCheck}
      />
    </AppShell>
  );
}

function QuoteBuilderUI({ s, set, enquiries, loadFromEnquiry, addonTotal, total, dep, saving, saveMsg, saveToNotion, resetAll, draftMsg, draftDirty, saveAsTemplate, clearTemplate, templateMsg, stockItems, addCostLine, updateCostLine, removeCostLine, toggleCheck }) {
  // Open and close times drive both the client-facing range and the service
  // hours the cost model bills against — set once, used twice.
  function setTimes(startMin, endMin) {
    const a = Number(startMin), b = Number(endMin);
    const patch = { startMin, endMin };
    if (startMin && endMin && b > a) {
      const hrs = (b - a) / 60;
      patch.etime = `${slotLabel(a)} – ${slotLabel(b)}`;
      patch.duration = `${hrs} hour${hrs === 1 ? '' : 's'}`;
    }
    set(patch);
  }

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Quote builder</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>Build, preview live, print as PDF — saves to Notion</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select onChange={e => loadFromEnquiry(e.target.value)} defaultValue="" style={selStyle}>
            <option value="">Load from enquiry…</option>
            {enquiries.map(e => <option key={e.id} value={e.id}>{e.name} — {fmtDate(e.eventDate)}</option>)}
          </select>
          <button onClick={() => window.print()} style={btnBlack} title="For a clean PDF, untick 'Headers and footers' in the print dialog under 'More settings'">🖨 Download PDF</button>
        </div>
      </div>

      <div className="no-print" style={{ background: '#fdf8ec', border: '1px solid var(--gold)', color: '#7a6300', padding: '8px 14px', borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
        💡 In the print dialog, expand <strong>More settings</strong> → untick <strong>Headers and footers</strong> for a clean PDF (removes the URL &amp; timestamp).
      </div>

      <div className="print-grid-collapse" style={{ display: 'grid', gridTemplateColumns: '340px 340px 1fr', gap: 20, alignItems: 'start' }}>
        <div className="no-print" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 20, position: 'sticky', top: 24, maxHeight: 'calc(100vh - 60px)', overflowY: 'auto' }}>
          <SectionHead>Document</SectionHead>
          <ThreeCol>
            <Field label="Type">
              <select style={selStyle} value={s.doctype} onChange={e => set({ doctype: e.target.value })}>
                <option value="quote">Quotation</option>
                <option value="deposit">Deposit Invoice</option>
                <option value="balance">Balance Invoice</option>
              </select>
            </Field>
            <Field label="Invoice no."><input style={inputStyle} value={s.invNum} onChange={e => set({ invNum: e.target.value })} placeholder="ORPI-001" /></Field>
            <Field label="Date"><input type="date" style={inputStyle} value={s.date} onChange={e => set({ date: e.target.value })} /></Field>
          </ThreeCol>
          <TwoCol>
            <Field label="Valid / due"><input type="date" style={inputStyle} value={s.due} onChange={e => set({ due: e.target.value })} /></Field>
            <Field label="Sales person">
              <select style={selStyle} value={s.salesPerson} onChange={e => set({ salesPerson: e.target.value })}>
                {['Ruds', 'Rahul', 'Punit', 'Snehal'].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
          </TwoCol>

          <SectionHead>Client &amp; event</SectionHead>
          <TwoCol>
            <Field label="Client name"><input style={inputStyle} value={s.client} onChange={e => set({ client: e.target.value })} /></Field>
            <Field label="Event type">
              <select style={selStyle} value={s.etype} onChange={e => set({ etype: e.target.value })}>
                {['Wedding Reception', 'Mendhi/Sangeet', 'Jago', 'Engagement', 'Birthday Party', 'Corporate', 'House Party', 'Other'].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
          </TwoCol>
          <TwoCol>
            <Field label="Venue"><input style={inputStyle} value={s.venue} onChange={e => set({ venue: e.target.value })} /></Field>
            <Field label="Event date"><input type="date" style={inputStyle} value={s.edate} onChange={e => set({ edate: e.target.value })} /></Field>
          </TwoCol>
          <ThreeCol>
            <Field label="Guests"><input type="number" style={inputStyle} value={s.guests} onChange={e => set({ guests: e.target.value })} /></Field>
            <Field label="Package">
              <select style={selStyle} value={s.pkg} onChange={e => set({ pkg: e.target.value })}>
                {['Premium', 'Ultimate', 'Full Bar', 'Cocktail Experience', 'Welcome Drinks Only', 'Bar Only (client supplies alcohol)', 'Custom'].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Setup access">
              <select style={selStyle} value={s.setup} onChange={e => set({ setup: e.target.value })}>
                <option value="">TBC</option>
                {TIME_SLOTS.map(t => <option key={t.v} value={t.label}>{t.label}</option>)}
                {s.setup && !TIME_SLOTS.some(t => t.label === s.setup) && <option value={s.setup}>{s.setup}</option>}
              </select>
            </Field>
          </ThreeCol>
          {/* Picking both ends fills in the printed time range and the duration
              the cost model reads. Duration stays editable for a TBC quote. */}
          <ThreeCol>
            <Field label="Bar opens">
              <select style={selStyle} value={s.startMin} onChange={e => setTimes(e.target.value, s.endMin)}>
                <option value="">TBC</option>
                {TIME_SLOTS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Bar closes">
              <select style={selStyle} value={s.endMin} onChange={e => setTimes(s.startMin, e.target.value)}>
                <option value="">TBC</option>
                {TIME_SLOTS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Duration">
              <select style={selStyle} value={s.duration} onChange={e => set({ duration: e.target.value })}>
                <option value="">TBC</option>
                {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                {s.duration && !DURATIONS.includes(s.duration) && <option value={s.duration}>{s.duration}</option>}
              </select>
            </Field>
          </ThreeCol>

          <SectionHead>Welcome drinks</SectionHead>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
            <input type="checkbox" checked={s.wdOn} onChange={e => set({ wdOn: e.target.checked })} />
            <label style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>Include welcome drinks</label>
            <select style={{ ...selStyle, width: 110 }} value={s.wdDur} onChange={e => set({ wdDur: e.target.value })}>
              {['1 hour', '1.5 hours', '2 hours', '2.5 hours', '3 hours'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <EditableList items={s.wdItems} onChange={items => set({ wdItems: items })} addLabel="+ Add item" stock={stockItems} />

          <SectionHead>Extra inclusions</SectionHead>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, lineHeight: 1.5 }}>
            The main included-in-your-package list is generated from the package, crew and
            drinkware, so it always matches this quote. Add anything extra here.
          </div>
          <EditableList items={s.inclItems} onChange={items => set({ inclItems: items })} addLabel="+ Add inclusion" />

          <SectionHead>Spirits &amp; alcohol</SectionHead>
          <SpiritEditor rows={s.spiritRows} onChange={rows => set({ spiritRows: rows })} stock={stockItems} />
          <NewStockNote
            names={[
              ...s.spiritRows.flatMap(r => r.items.map(i => i.text)),
              ...s.softItems.map(i => i.text),
              ...s.wdItems.map(i => i.text),
            ]}
            stock={stockItems}
          />

          <SectionHead>Soft drinks &amp; mixers</SectionHead>
          <EditableList items={s.softItems} onChange={items => set({ softItems: items })} addLabel="+ Add item" stock={stockItems} prefer="mixer" />

          <SectionHead>Cocktails &amp; mocktails</SectionHead>
          <TwoCol>
            <Field label="Cocktails">
              <select style={selStyle} value={s.nct} onChange={e => {
                const n = parseInt(e.target.value);
                const names = [...s.cocktailNames]; while (names.length < n) names.push('');
                set({ nct: n, cocktailNames: names });
              }}>
                <option value={0}>None</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Mocktails">
              <select style={selStyle} value={s.nmt} onChange={e => {
                const n = parseInt(e.target.value);
                const names = [...s.mocktailNames]; while (names.length < n) names.push('');
                set({ nmt: n, mocktailNames: names });
              }}>
                <option value={0}>None</option>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          </TwoCol>
          {s.nct > 0 && <NameList label="Cocktail names" names={s.cocktailNames.slice(0, s.nct)} onChange={names => set({ cocktailNames: names })} />}
          {s.nmt > 0 && <NameList label="Mocktail names" names={s.mocktailNames.slice(0, s.nmt)} onChange={names => set({ mocktailNames: names })} />}

          <SectionHead>Add-ons &amp; extras</SectionHead>
          <AddonEditor addons={s.addons} onChange={addons => set({ addons })} />

          <SectionHead>Complimentary</SectionHead>
          <EditableList items={s.compItems} onChange={items => set({ compItems: items })} addLabel="+ Add item" />

          <SectionHead>Notes</SectionHead>
          <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={s.notes} onChange={e => set({ notes: e.target.value })} placeholder="Any notes or conditions…" />

          <SectionHead>Pricing</SectionHead>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
            Crew, hours, drinkware and tasting all live in the cost panel to the right —
            change them there and both this quote and the margin update together.
          </div>
          <TwoCol>
            <Field label="Target margin %"><input type="number" style={inputStyle} value={s.marginPct} onChange={e => set({ marginPct: e.target.value })} step="5" /></Field>
            <Field label="Cost per head"><input style={{ ...inputStyle, background: 'var(--off)', color: 'var(--muted)' }} value={gbp(computeCosts(s).costPerHead)} disabled /></Field>
          </TwoCol>
          {(() => {
            const g = Number(s.guests) || 0;
            const tier = s.drinkware === 'plastic' ? 'plastic' : 'glass';
            const pph = (PPH[s.pkg] || { glass: 0, plastic: 0 })[tier] || 0;
            const suggested = g * pph;
            if (!g || !pph) return null;
            return (
              <div style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#7a6300', margin: '4px 0 10px' }}>
                Suggested base: <strong>{gbp(suggested)}</strong> &nbsp;({g} × £{pph}/head, {tier}) &nbsp;
                <button type="button" onClick={() => set({ base: String(suggested) })} style={{ background: 'none', border: '1px solid var(--gold)', color: '#7a6300', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', marginLeft: 4 }}>Use</button>
              </div>
            );
          })()}
          <ThreeCol>
            <Field label="Base price (£)"><input type="number" style={inputStyle} value={s.base} onChange={e => set({ base: e.target.value })} step="50" /></Field>
            <Field label="Discount (£)"><input type="number" style={inputStyle} value={s.disc} onChange={e => set({ disc: e.target.value })} step="10" /></Field>
            <Field label="Total"><input style={{ ...inputStyle, background: 'var(--off)', color: 'var(--muted)' }} value={gbp(total)} disabled /></Field>
          </ThreeCol>

          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <button onClick={saveToNotion} disabled={saving} style={btnBlack}>{saving ? 'Saving…' : 'Save to Notion'}</button>
            <button onClick={() => window.print()} style={btnGold}>🖨 Download PDF</button>
            <button onClick={resetAll} style={btnOutline}>Reset</button>
          </div>
          {saveMsg && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--success)' }}>{saveMsg}</div>}
          {/* Quiet unless something's wrong. Saving to Notion records the
              headline; this is the whole quote, kept so it can be reopened. */}
          {s.enquiryId && (
            <div style={{ marginTop: 6, fontSize: 11, color: draftMsg.includes('not saved') ? 'var(--danger)' : 'var(--muted)' }}>
              {draftDirty ? 'Saving draft…' : (draftMsg || 'Draft saves automatically')}
            </div>
          )}
          {!s.enquiryId && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              Link an enquiry above and this quote saves itself — otherwise it's lost on refresh.
            </div>
          )}

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', marginBottom: 6 }}>Your default template</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
              Save the current quote structure (welcome drinks, spirits, inclusions, add-ons) as your default. Every new quote will start from these settings — client details always start blank.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveAsTemplate} style={btnOutline}>Save as default</button>
              <button onClick={clearTemplate} style={btnOutline}>Clear default</button>
            </div>
            {templateMsg && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--success)' }}>{templateMsg}</div>}
          </div>
        </div>

        <InternalCostingPanel
          s={s} set={set} stockItems={stockItems}
          total={total}
          addCostLine={addCostLine} updateCostLine={updateCostLine} removeCostLine={removeCostLine}
          toggleCheck={toggleCheck}
        />

        <QuotePreview s={s} addonTotal={addonTotal} total={total} dep={dep} />
      </div>

      <ClientMessage s={s} total={total} />
    </div>
  );
}

// ---- Client message ---------------------------------------------------------
// Sits under the builder. Built from the quote above it, so the message and the
// PDF can't drift apart.
function ClientMessage({ s, total }) {
  const [copied, setCopied] = useState(false);
  const [asEmail, setAsEmail] = useState(false);
  const { text, gaps } = buildClientMessage(s, total);
  const subject = `Your quote \u2014 ${ETYPE_SAID[s.etype] || 'event'}${s.edate ? `, ${fmtOrdinal(s.edate)}` : ''}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(asEmail ? `Subject: ${subject}\n\n${text}` : text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      alert('Copy failed \u2014 select the text and copy it manually.');
    }
  }

  return (
    <div className="no-print" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginTop: 20, maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Message to client</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
            Built from the quote above. Copy straight into WhatsApp or email.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {[[false, 'WhatsApp'], [true, 'Email']].map(([v, label]) => (
            <button key={label} onClick={() => setAsEmail(v)}
              style={{
                padding: '5px 12px', fontSize: 11.5, borderRadius: 5, cursor: 'pointer',
                border: asEmail === v ? '1px solid var(--gold)' : '1px solid var(--border)',
                background: asEmail === v ? 'var(--gold-bg)' : '#fff',
                color: asEmail === v ? '#7a6300' : 'var(--muted)', fontWeight: asEmail === v ? 600 : 400,
              }}>{label}</button>
          ))}
        </div>
      </div>

      {gaps.length > 0 && (
        <div style={{ background: '#fef6e4', border: '1px solid var(--gold)', borderRadius: 6, padding: '8px 12px', fontSize: 11.5, color: '#7a6300', margin: '12px 0', lineHeight: 1.5 }}>
          Still blank: <strong>{gaps.join(', ')}</strong>. Fill {gaps.length === 1 ? 'it' : 'them'} in above and this updates.
        </div>
      )}

      {asEmail && (
        <div style={{ margin: '12px 0 0' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>Subject</div>
          <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 11px', fontSize: 12.5 }}>{subject}</div>
        </div>
      )}

      <textarea readOnly value={text}
        style={{
          width: '100%', minHeight: 420, resize: 'vertical', marginTop: 12, padding: '14px 16px',
          border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, lineHeight: 1.6,
          fontFamily: 'var(--sans)', background: 'var(--off)', color: '#1c1b18',
        }} />

      <button onClick={copy} style={{ ...btnBlack, marginTop: 10 }}>
        {copied ? '\u2713 Copied' : 'Copy message'}
      </button>
    </div>
  );
}

// ---- Internal Costing Panel (team-only, never printed) ---------------------
//
// Sits alongside the client-facing quote builder. Every line has a category,
// name, quantity and unit cost; total = sum(qty * unitCost) per line.
// Alcohol lines can optionally link to a live Inventory Item — when linked,
// the unit cost auto-populates from Notion Average Unit Cost.
//
// The bottom summary computes suggested client price = cost / (1 - margin/100).
function InternalCostingPanel({ s, set, stockItems, total: clientTotal, addCostLine, updateCostLine, removeCostLine, toggleCheck }) {
  const c = computeCosts(s);
  const pending = unresolvedChecks(s);
  const tagged = new Set(s.costLines.map(l => l.check).filter(Boolean));

  const marginPct = parseFloat(s.marginPct);
  const validMargin = !isNaN(marginPct) && marginPct >= 0 && marginPct < 100;
  const suggested = validMargin ? c.internalCost / (1 - marginPct / 100) : null;
  const actualQuote = Number(clientTotal) || 0;
  const actualMargin = actualQuote > 0 && c.internalCost > 0 ? ((actualQuote - c.internalCost) / actualQuote) * 100 : null;
  const belowTarget = validMargin && actualMargin != null && actualMargin < marginPct;

  const line = { display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', color: '#444' };
  const muted = { color: 'var(--muted)' };
  const head = { fontSize: 9, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted)', margin: '16px 0 7px' };
  const mini = { width: 42, padding: '3px 5px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, textAlign: 'right' };
  const miniWide = { flex: 1, minWidth: 0, padding: '3px 5px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 };

  function setCrew(rows) { set({ staffRows: rows }); }
  function updateCrew(i, patch) { setCrew(c.crew.map((r, idx) => idx === i ? { ...r, ...patch } : r)); }
  function addCrew() { setCrew([...c.crew, { id: `crew_${Date.now()}`, role: 'Bar back', count: 1, rate: COST.staffRate }]); }
  function removeCrew(i) { setCrew(c.crew.filter((_, idx) => idx !== i)); }

  function pickDrinkware(mode) {
    const d = DRINKWARE[mode];
    set({ drinkware: mode, glassPerHead: d.glass, plasticPerHead: d.plastic });
  }

  return (
    <div className="no-print" style={{ background: '#faf9f6', border: '1px solid var(--border)', borderRadius: 8, padding: 16, alignSelf: 'start', position: 'sticky', top: 20, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Cost &amp; margin</div>
        <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Team only</div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, lineHeight: 1.45 }}>
        Calculated from guests, hours and drinkware. Never shown on the client PDF.
      </p>

      {(!c.g || !c.serviceHrs) && (
        <div style={{ background: '#fff', border: '1px dashed var(--border)', borderRadius: 6, padding: 12, textAlign: 'center', fontSize: 11.5, color: 'var(--muted)', margin: '12px 0', lineHeight: 1.5 }}>
          Enter <strong>guests</strong> and <strong>duration</strong> to see the cost.
        </div>
      )}

      {/* ── Crew & hours ─────────────────────────────────────────────── */}
      <div style={head}>Crew &amp; hours</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9.5, color: 'var(--muted)', marginBottom: 2 }}>Set-up</div>
          <input type="number" step="0.5" value={s.setupHrs} onChange={e => set({ setupHrs: e.target.value })} style={{ ...mini, width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9.5, color: 'var(--muted)', marginBottom: 2 }}>Service</div>
          <input value={c.serviceHrs || ''} disabled title="From the Duration field" style={{ ...mini, width: '100%', background: 'var(--off)', color: 'var(--muted)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9.5, color: 'var(--muted)', marginBottom: 2 }}>Pack-down</div>
          <input type="number" step="0.5" value={s.packdownHrs} onChange={e => set({ packdownHrs: e.target.value })} style={{ ...mini, width: '100%' }} />
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 8, fontStyle: 'italic' }}>
        {c.paidHrs}h paid per crew member
      </div>

      {c.crew.map((r, i) => (
        <div key={r.id || i} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
          <input value={r.role} onChange={e => updateCrew(i, { role: e.target.value })} placeholder="Role" style={miniWide} />
          <input type="number" min="0" value={r.count} onChange={e => updateCrew(i, { count: e.target.value })} style={{ ...mini, width: 36 }} />
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>×£</span>
          <input type="number" min="0" step="0.5" value={r.rate} onChange={e => updateCrew(i, { rate: e.target.value })} style={{ ...mini, width: 44 }} />
          <button onClick={() => removeCrew(i)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: '0 2px' }} title="Remove">✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <button onClick={addCrew} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 10.5, cursor: 'pointer', padding: 0 }}>+ Add crew</button>
        {Array.isArray(s.staffRows) && (
          <button onClick={() => set({ staffRows: null })} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 10.5, cursor: 'pointer', padding: 0 }}>reset to 1 per 50</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>Prep hours</span>
        <input type="number" min="0" step="0.5" value={s.prepHrs} onChange={e => set({ prepHrs: e.target.value })} placeholder="0" style={{ ...mini, width: 36 }} />
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>×£</span>
        <input type="number" min="0" step="0.5" value={s.prepRate} onChange={e => set({ prepRate: e.target.value })} placeholder="0" style={{ ...mini, width: 44 }} />
      </div>
      {c.prepHrs > 0 && c.prepCost === 0 && (
        <div style={{ fontSize: 10, color: '#8a7a3a', fontStyle: 'italic', marginBottom: 8, lineHeight: 1.45 }}>
          Absorbed by directors — {gbp(c.prepShadow)} of unpaid time, not in the cost below.
        </div>
      )}

      {/* ── Alcohol ──────────────────────────────────────────────────────
          Upgrading the spirit list moves the spirits component only. Beer,
          wine and prosecco are flat, and switch off entirely when the package
          doesn't include them. */}
      {!c.isClientAlcohol && (
        <>
          <div style={head}>Alcohol</div>
          <div style={{ display: 'flex', gap: 3, marginBottom: 7 }}>
            {Object.keys(SPIRIT_TIERS).map(k => (
              <button key={k} onClick={() => set({ spiritTier: k })} title={SPIRIT_TIERS[k].note}
                style={{ flex: 1, padding: '5px 1px', fontSize: 9.5, borderRadius: 5, cursor: 'pointer',
                  border: s.spiritTier === k ? '1px solid var(--gold)' : '1px solid var(--border)',
                  background: s.spiritTier === k ? 'var(--gold-bg)' : '#fff',
                  color: s.spiritTier === k ? '#7a6300' : 'var(--muted)',
                  fontWeight: s.spiritTier === k ? 600 : 400, opacity: c.alcManual ? 0.45 : 1 }}>
                {SPIRIT_TIERS[k].label}
              </button>
            ))}
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', marginBottom: 6 }}>
            {ALCOHOL_MIX.map(m => {
              const on = c.alcParts[m.key];
              const tier = SPIRIT_TIERS[s.spiritTier] || SPIRIT_TIERS.standard;
              const v = m.perHead * (m.tiered ? tier.index : 1);
              return (
                <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, padding: '2px 0', color: on ? '#444' : 'var(--muted)' }}>
                  <span style={{ textDecoration: on ? 'none' : 'line-through' }}>
                    {m.label}{m.tiered && on && tier.index !== 1 ? ` · ×${tier.index}` : ''}
                  </span>
                  <span>{on ? '£' + v.toFixed(2) : 'not included'}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>
              {c.alcManual ? 'Override' : 'Per head'}
            </span>
            <input type="number" min="0" step="0.25" value={s.alcoholOverride}
              onChange={e => set({ alcoholOverride: e.target.value })}
              placeholder={c.alcPerHead.toFixed(2)}
              title="Type a figure to override the tiered calculation"
              style={{ ...mini, width: 56, borderColor: c.alcManual ? 'var(--gold)' : 'var(--border)' }} />
            {c.alcManual && (
              <button onClick={() => set({ alcoholOverride: '' })} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 10, cursor: 'pointer', padding: 0 }}>clear</button>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 4, lineHeight: 1.45 }}>
            {c.alcManual
              ? 'Typed figure — tiers ignored until you clear it.'
              : `${SPIRIT_TIERS[s.spiritTier] ? SPIRIT_TIERS[s.spiritTier].note : ''} · £${c.alcPerHead.toFixed(2)}/head`}
          </div>
        </>
      )}

      {/* ── Welcome drinks ───────────────────────────────────────────── */}
      {/* Only appears when welcome drinks are on. Switch them off upstairs and
          the whole section and its cost disappear with it. */}
      {s.wdOn && (
        <>
          <div style={head}>Welcome drinks</div>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', marginBottom: 6 }}>
            {WELCOME_MIX.map(m => {
              const on = c.wdParts[m.key];
              return (
                <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, padding: '2px 0', color: on ? '#444' : 'var(--muted)' }}>
                  <span style={{ textDecoration: on ? 'none' : 'line-through' }}>{m.label}</span>
                  <span>{on ? '£' + m.perServe.toFixed(2) + ' a serve' : 'not on the tray'}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>Drinks per head, per hour</span>
            <input type="number" min="0" step="0.25" value={s.wdPerHour}
              onChange={e => set({ wdPerHour: e.target.value })}
              placeholder={String(WELCOME_PER_HOUR)}
              title="How hard the crowd goes on arrival. A guess until enough events have closed to measure it."
              style={{ ...mini, width: 56 }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 4, lineHeight: 1.45 }}>
            {c.wdLive.length === 0
              ? 'Nothing on the welcome list is recognisable as a drink, so this costs nothing. Check the items upstairs.'
              : `${c.wdDrinks} drink${c.wdDrinks === 1 ? '' : 's'} a head over ${s.wdDur}, averaged across ${c.wdLive.length} option${c.wdLive.length === 1 ? '' : 's'} — £${c.wdPerHead.toFixed(2)}/head.`}
          </div>
        </>
      )}

      {/* ── Drinkware ────────────────────────────────────────────────── */}
      <div style={head}>Drinkware</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 7 }}>
        {Object.keys(DRINKWARE).map(k => (
          <button key={k} onClick={() => pickDrinkware(k)} title={DRINKWARE[k].label}
            style={{ flex: 1, padding: '5px 2px', fontSize: 10, borderRadius: 5, cursor: 'pointer',
              border: s.drinkware === k ? '1px solid var(--gold)' : '1px solid var(--border)',
              background: s.drinkware === k ? 'var(--gold-bg)' : '#fff',
              color: s.drinkware === k ? '#7a6300' : 'var(--muted)', fontWeight: s.drinkware === k ? 600 : 400 }}>
            {k === 'mixed' ? 'Mixed' : k === 'glass' ? 'Glass' : 'Plastic'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Glass/head</span>
          <input type="number" min="0" step="0.5" value={s.glassPerHead} onChange={e => set({ glassPerHead: e.target.value })} style={{ ...mini, width: 40 }} />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Plastic/head</span>
          <input type="number" min="0" step="0.5" value={s.plasticPerHead} onChange={e => set({ plasticPerHead: e.target.value })} style={{ ...mini, width: 40 }} />
        </div>
      </div>

      {/* ── Tasting ──────────────────────────────────────────────────── */}
      <div style={head}>Drinks tasting</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
        <select value={s.tastingMode} onChange={e => set({ tastingMode: e.target.value })}
          style={{ flex: 1, minWidth: 0, padding: '3px 5px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, background: '#fff' }}>
          <option value="auto">Auto ({COST.tastingThreshold}+ guests)</option>
          <option value="included">Included</option>
          <option value="charged">Charged</option>
          <option value="none">Not offered</option>
        </select>
        <input type="number" min="0" value={s.tastingGuests} onChange={e => set({ tastingGuests: e.target.value })} title="People attending the tasting" style={{ ...mini, width: 36 }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 4, lineHeight: 1.45 }}>
        {c.tasting === 'none' ? 'No tasting on this quote.'
          : c.tasting === 'included' ? `Included — costs us ${gbp(c.tastingCost)} for ${c.tGuests}.`
          : `Charge ${gbp(c.tastingCharge)} (${c.tGuests} × £${COST.tastingChargePerHead}) — costs us ${gbp(c.tastingCost)}.`}
      </div>
      {c.tasting === 'charged' && c.tastingCharge < c.tastingCost && (
        <div style={{ background: '#fef6e4', color: '#b8720a', borderRadius: 5, padding: '6px 9px', fontSize: 10, marginBottom: 4, lineHeight: 1.45 }}>
          You'd be {gbp(c.tastingCost - c.tastingCharge)} down on this tasting. Raise the fee or cut the attendee count.
        </div>
      )}

      {/* ── Cost lines ───────────────────────────────────────────────── */}
      <div style={head}>Costs</div>
      <div style={{ marginBottom: 6 }}>
        {!c.isClientAlcohol && <div style={line}><span style={muted}>Alcohol · £{c.alcPerHead.toFixed(2)}/head</span><span>{gbp(c.alcCost)}</span></div>}
        {c.wdCost > 0 && <div style={line}><span style={muted}>Welcome drinks · £{c.wdPerHead.toFixed(2)}/head</span><span>{gbp(c.wdCost)}</span></div>}
        <div style={line}><span style={muted}>Mixers · £{COST.mixersPerHead.toFixed(2)}/head</span><span>{gbp(c.mixersCost)}</span></div>
        <div style={line}><span style={muted}>Ice · £{COST.icePerHead.toFixed(2)}/head</span><span>{gbp(c.iceCost)}</span></div>
        <div style={line}><span style={muted}>Garnishes · £{COST.garnishPerHead.toFixed(2)}/head</span><span>{gbp(c.garnishCost)}</span></div>
        {c.glassPerHead > 0 && <div style={line}><span style={muted}>Glassware · {c.glassPerHead} × {Math.round(COST.glassRate * 100)}p</span><span>{gbp(c.glassCost)}</span></div>}
        {c.plasticPerHead > 0 && <div style={line}><span style={muted}>Plastics · {c.plasticPerHead} × {Math.round(COST.plasticRate * 100)}p</span><span>{gbp(c.plasticCost)}</span></div>}
        <div style={line}><span style={muted}>Staff · {c.headcount} × {c.paidHrs}h</span><span>{gbp(c.staffCost)}</span></div>
        {c.prepCost > 0 && <div style={line}><span style={muted}>Prep · {c.prepHrs}h</span><span>{gbp(c.prepCost)}</span></div>}
        {c.tastingCost > 0 && <div style={line}><span style={muted}>Drinks tasting · {c.tGuests} guests</span><span>{gbp(c.tastingCost)}</span></div>}
        {c.oneOffs > 0 && <div style={line}><span style={muted}>One-off costs</span><span>{gbp(c.oneOffs)}</span></div>}
      </div>

      {s.costLines.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {s.costLines.map(l => (
            <CostLineRow key={l.id} l={l} stockItems={stockItems} update={patch => updateCostLine(l.id, patch)} remove={() => removeCostLine(l.id)} />
          ))}
        </div>
      )}
      <button onClick={() => addCostLine({ category: 'Other' })} style={{ width: '100%', background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 8px', fontSize: 11, cursor: 'pointer', marginBottom: 4, color: 'var(--muted)' }}>
        + Add a one-off cost
      </button>

      {/* ── Cost checklist ───────────────────────────────────────────────
          Not a to-do list you can tick past. Every line here has to be in the
          model, priced, or explicitly marked n/a before the margin figure
          below will commit — which is what stops a cost being forgotten. */}
      <div style={{ ...head, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>Cost checklist</span>
        <span style={{ color: pending.length ? '#b8720a' : '#2e7d32', letterSpacing: 0, textTransform: 'none', fontSize: 10 }}>
          {pending.length ? `${pending.length} unresolved` : 'all clear'}
        </span>
      </div>
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', marginBottom: 12 }}>
        {COST_CHECKS.map(chk => {
          const isAuto = !!chk.auto;
          const na = (s.costChecks || {})[chk.key] === 'na';
          const added = tagged.has(chk.key);
          const done = isAuto || na || added;
          return (
            <div key={chk.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--off)', fontSize: 11 }}>
              <span style={{ color: done ? '#2e7d32' : '#c9a227', fontSize: 11, width: 11 }}>{done ? '✓' : '○'}</span>
              <span style={{ flex: 1, color: na ? 'var(--muted)' : '#333', textDecoration: na ? 'line-through' : 'none' }}>{chk.label}</span>
              {isAuto ? (
                <span style={{ fontSize: 9.5, color: 'var(--muted)', fontStyle: 'italic' }}>
                  {chk.key === 'welcome' && !s.wdOn ? 'not on this quote' : 'in model'}
                </span>
              ) : added ? (
                <span style={{ fontSize: 9.5, color: '#2e7d32' }}>priced</span>
              ) : (
                <span style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => addCostLine({ category: 'Other', name: chk.label, check: chk.key, qty: 1 })}
                    style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: 9.5, cursor: 'pointer', padding: 0 }}>add</button>
                  <button onClick={() => toggleCheck(chk.key)}
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 9.5, cursor: 'pointer', padding: 0 }}>{na ? 'undo' : 'n/a'}</button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Summary ──────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: 12, opacity: pending.length ? 0.55 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, fontWeight: 600 }}>
          <span>Total cost</span><span>{gbp(c.internalCost)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 10, color: 'var(--muted)' }}>
          <span>per head</span><span>{gbp(c.costPerHead)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 8 }}>
          <span style={{ color: 'var(--muted)' }}>Target margin</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="number" min="0" max="99" step="1" placeholder="—" value={s.marginPct}
              onChange={e => set({ marginPct: e.target.value })}
              style={{ width: 50, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, textAlign: 'right' }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>%</span>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: actualQuote > 0 ? 10 : 0 }}>
          <span style={{ color: 'var(--gold)', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', fontSize: 10 }}>Price to hit margin</span>
          <span style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 500 }}>{suggested != null ? gbp(suggested) : '—'}</span>
        </div>
        {actualQuote > 0 && (
          <div style={{ background: belowTarget ? '#fef6e4' : '#f2f6f2', borderRadius: 5, padding: '8px 10px', fontSize: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
              <span>Your quote</span><span>{gbp(actualQuote)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontWeight: 600, fontSize: 13, color: belowTarget ? '#b8720a' : '#2e7d32' }}>
              <span>Actual margin</span>
              <span>{actualMargin == null ? '—' : `${actualMargin.toFixed(0)}%`}</span>
            </div>
            {belowTarget && (
              <div style={{ fontSize: 10, color: '#b8720a', marginTop: 3, fontStyle: 'italic' }}>
                {(marginPct - actualMargin).toFixed(0)}pp below your {marginPct}% target
              </div>
            )}
          </div>
        )}
      </div>
      {pending.length > 0 && (
        <div style={{ fontSize: 10.5, color: '#b8720a', marginTop: 7, lineHeight: 1.5, fontStyle: 'italic' }}>
          {pending.length} cost{pending.length === 1 ? '' : 's'} not yet accounted for — price {pending.length === 1 ? 'it' : 'them'} or mark n/a and this margin is trustworthy.
        </div>
      )}
    </div>
  );
}

function CostLineRow({ l, stockItems, update, remove }) {
  const isAlcohol = l.category === 'Alcohol';
  const linkedItem = l.inventoryId ? stockItems.find(i => i.id === l.inventoryId) : null;
  const lineTotal = (Number(l.qty) || 0) * (Number(l.unitCost) || 0);
  return (
    <div style={{ padding: '5px 0', borderBottom: '1px solid var(--off)' }}>
      {/* Name row: dropdown for alcohol (from Inventory), free text for everything else */}
      {isAlcohol ? (
        <select
          value={l.inventoryId || ''}
          onChange={e => {
            const id = e.target.value;
            const item = stockItems.find(i => i.id === id);
            if (item) update({ inventoryId: id, name: item.name, unitCost: item.averageUnitCost || l.unitCost });
            else update({ inventoryId: null });
          }}
          style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, background: '#fff', marginBottom: 4 }}
        >
          <option value="">{l.name || '— pick spirit —'}</option>
          {stockItems.map(item => (
            <option key={item.id} value={item.id}>{item.name} ({item.category}) — {gbp(item.averageUnitCost || 0)}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          placeholder="Description"
          value={l.name}
          onChange={e => update({ name: e.target.value })}
          style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, marginBottom: 4 }}
        />
      )}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          type="number"
          step="0.01"
          placeholder="Qty"
          value={l.qty}
          onChange={e => update({ qty: e.target.value })}
          style={{ width: 46, padding: '3px 5px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, textAlign: 'right' }}
        />
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>×</span>
        <input
          type="number"
          step="0.01"
          placeholder="£"
          value={l.unitCost}
          onChange={e => update({ unitCost: e.target.value })}
          disabled={!!linkedItem}
          title={linkedItem ? 'Locked to Inventory Average Unit Cost' : ''}
          style={{ width: 56, padding: '3px 5px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, textAlign: 'right', background: linkedItem ? 'var(--off)' : '#fff' }}
        />
        <div style={{ flex: 1, textAlign: 'right', fontSize: 11, fontWeight: 500 }}>{gbp(lineTotal)}</div>
        <button onClick={remove} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }} title="Remove line">✕</button>
      </div>
    </div>
  );
}

// ---- Reusable editors ------------------------------------------------------

// Inventory-backed text field. Picks from stock, but never blocks typing — a
// brand we've not bought before has to be quotable the moment a client asks
// for it. Anything not in inventory gets a gold dot so it's obvious later.
function Combobox({ value, onChange, options, placeholder, prefer }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null); // null = mirror the committed value
  const text = draft == null ? (value || '') : draft;
  const q = text.trim().toLowerCase();

  const related = (a, b) => {
    if (!a || !b) return false;
    const x = a.toLowerCase(), y = b.toLowerCase();
    return x.includes(y) || y.includes(x);
  };
  // Category matches float up rather than filtering the rest out — an
  // inventory category that doesn't line up with our row name shouldn't hide
  // the whole list.
  const rank = o => (q && o.name.toLowerCase().startsWith(q) ? -4 : 0) + (related(o.category, prefer) ? -2 : 0);
  const list = options
    .filter(o => !q || o.name.toLowerCase().includes(q))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, 8);

  const known = inStock(value, options);
  // Close but not certain: ask before a near-duplicate gets created.
  const near = known ? [] : nearMatches(text, options);

  function commit(name) { onChange(name); setDraft(null); setOpen(false); }

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        value={text}
        placeholder={placeholder}
        onChange={e => { setDraft(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); setDraft(null); }, 140)}
        style={{ ...miniInput, width: '100%', paddingRight: 18 }}
      />
      {(value || '').trim() !== '' && !known && (
        <span title="Not in inventory yet" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', pointerEvents: 'none' }} />
      )}
      {open && (list.length > 0 || (q && !known)) && (
        <div style={{ position: 'absolute', zIndex: 40, top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, marginTop: 2, boxShadow: '0 4px 14px rgba(0,0,0,.09)', maxHeight: 210, overflowY: 'auto' }}>
          {list.map(o => (
            <div key={o.id} onMouseDown={e => { e.preventDefault(); commit(o.name); }}
              style={{ padding: '6px 9px', cursor: 'pointer', borderBottom: '1px solid var(--off)' }}>
              <div style={{ fontSize: 11.5 }}>{o.name}</div>
              {o.category && <div style={{ fontSize: 9.5, color: 'var(--muted)' }}>{o.category}</div>}
            </div>
          ))}
          {q && !known && near.length > 0 && (
            <div style={{ padding: '6px 9px', borderTop: '1px solid var(--off)', background: '#fffdf6' }}>
              <div style={{ fontSize: 9.5, color: 'var(--muted)', marginBottom: 3 }}>Did you mean</div>
              {near.map(o => (
                <div key={o.id} onMouseDown={e => { e.preventDefault(); commit(o.name); }}
                  style={{ fontSize: 11.5, padding: '3px 0', cursor: 'pointer', color: '#7a6300', fontWeight: 500 }}>
                  {o.name}
                </div>
              ))}
            </div>
          )}
          {q && !known && (
            <div onMouseDown={e => { e.preventDefault(); commit(text.trim()); }}
              style={{ padding: '6px 9px', cursor: 'pointer', fontSize: 11, color: near.length ? 'var(--muted)' : '#7a6300', background: near.length ? '#fff' : 'var(--gold-bg)', borderTop: '1px solid var(--off)' }}>
              No — add “{text.trim()}” as a new product
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Counts what's been typed in that stock doesn't know about, so new products
// can be added to Notion in one go rather than hunted for later.
function countNew(names, stock) {
  return names.filter(n => n && n.trim() && !inStock(n, stock || [])).length;
}

function EditableList({ items, onChange, addLabel, stock, prefer }) {
  function update(id, patch) { onChange(items.map(i => i.id === id ? { ...i, ...patch } : i)); }
  function remove(id) { onChange(items.filter(i => i.id !== id)); }
  function add() { onChange([...items, { id: uid(), text: '', on: true }]); }
  return (
    <div>
      {items.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--off)' }}>
          <input type="checkbox" checked={item.on} onChange={e => update(item.id, { on: e.target.checked })} />
          {stock
            ? <Combobox value={item.text} onChange={v => update(item.id, { text: v })} options={stock} prefer={stockCatFor(prefer)} placeholder="Search stock or type a new one" />
            : <input style={{ ...miniInput, flex: 1 }} value={item.text} onChange={e => update(item.id, { text: e.target.value })} />}
          <button onClick={() => remove(item.id)} style={rmBtn}>✕</button>
        </div>
      ))}
      <button onClick={add} style={addLinkStyle}>{addLabel}</button>
    </div>
  );
}

function SpiritEditor({ rows, onChange, stock }) {
  function updateRow(id, patch) { onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r)); }
  function removeRow(id) { onChange(rows.filter(r => r.id !== id)); }
  function addRow() { onChange([...rows, { id: uid(), cat: 'New category', on: true, items: [{ id: uid(), text: '', on: true }] }]); }
  function updateItem(rowId, itemId, patch) {
    onChange(rows.map(r => r.id === rowId ? { ...r, items: r.items.map(i => i.id === itemId ? { ...i, ...patch } : i) } : r));
  }
  function removeItem(rowId, itemId) {
    onChange(rows.map(r => r.id === rowId ? { ...r, items: r.items.filter(i => i.id !== itemId) } : r));
  }
  function addItem(rowId) {
    onChange(rows.map(r => r.id === rowId ? { ...r, items: [...r.items, { id: uid(), text: '', on: true }] } : r));
  }
  return (
    <div>
      {rows.map(row => (
        <div key={row.id} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <input type="checkbox" checked={row.on} onChange={e => updateRow(row.id, { on: e.target.checked })} />
            <input style={{ ...miniInput, fontWeight: 500, maxWidth: 110 }} value={row.cat} onChange={e => updateRow(row.id, { cat: e.target.value })} />
            <button onClick={() => removeRow(row.id)} style={rmBtn}>✕</button>
          </div>
          <div style={{ paddingLeft: 22 }}>
            {row.items.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--off)' }}>
                <input type="checkbox" checked={item.on} onChange={e => updateItem(row.id, item.id, { on: e.target.checked })} />
                {stock
                  ? <Combobox value={item.text} onChange={v => updateItem(row.id, item.id, { text: v })} options={stock} prefer={stockCatFor(row.cat)} placeholder="Search stock or type a new one" />
                  : <input style={{ ...miniInput, flex: 1 }} value={item.text} onChange={e => updateItem(row.id, item.id, { text: e.target.value })} />}
                <button onClick={() => removeItem(row.id, item.id)} style={rmBtn}>✕</button>
              </div>
            ))}
            <button onClick={() => addItem(row.id)} style={{ ...addLinkStyle, fontSize: 11 }}>+ Add</button>
          </div>
        </div>
      ))}
      <button onClick={addRow} style={addLinkStyle}>+ Add category</button>
    </div>
  );
}

function NewStockNote({ names, stock }) {
  if (!stock || !stock.length) return null;
  const n = countNew(names, stock);
  if (!n) return null;
  return (
    <div style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold)', borderRadius: 6, padding: '7px 10px', fontSize: 11, color: '#7a6300', margin: '6px 0 4px', lineHeight: 1.5 }}>
      {n} drink{n === 1 ? '' : 's'} on this quote {n === 1 ? 'is' : 'are'} not in inventory yet (marked with a dot).
      Quote away — just add {n === 1 ? 'it' : 'them'} to Inventory Items before you buy, so the costing picks {n === 1 ? 'it' : 'them'} up.
    </div>
  );
}

function AddonEditor({ addons, onChange }) {
  function update(id, patch) { onChange(addons.map(a => a.id === id ? { ...a, ...patch } : a)); }
  function remove(id) { onChange(addons.filter(a => a.id !== id)); }
  function add() { onChange([...addons, { id: uid(), label: 'Custom add-on', desc: '', price: '', on: true }]); }
  return (
    <div>
      {addons.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--off)' }}>
          <input type="checkbox" checked={a.on} onChange={e => update(a.id, { on: e.target.checked })} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{a.label}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.desc}</div>
          </div>
          <input style={{ ...miniInput, width: 70, textAlign: 'right' }} value={a.price} onChange={e => update(a.id, { price: e.target.value })} placeholder="£" />
          <button onClick={() => remove(a.id)} style={rmBtn}>✕</button>
        </div>
      ))}
      <button onClick={add} style={addLinkStyle}>+ Add custom extra</button>
    </div>
  );
}

function NameList({ label, names, onChange }) {
  function update(i, val) { const copy = [...names]; copy[i] = val; onChange(copy); }
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', margin: '8px 0 4px' }}>{label}</div>
      {names.map((n, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', width: 18 }}>{i + 1}.</span>
          <input style={{ ...miniInput, flex: 1 }} value={n} onChange={e => update(i, e.target.value)} placeholder="TBC" />
        </div>
      ))}
    </div>
  );
}

// ---- Small layout helpers ---------------------------------------------------
function SectionHead({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', padding: '12px 0 7px', borderBottom: '1px solid var(--border)', marginBottom: 10, marginTop: 16 }}>{children}</div>;
}
function TwoCol({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>{children}</div>; }
function ThreeCol({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>{children}</div>; }
function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = { width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 };
const selStyle = { ...inputStyle, cursor: 'pointer' };
const miniInput = { padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12 };
const rmBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, padding: '2px 4px', lineHeight: 1 };
const addLinkStyle = { fontSize: 12, color: 'var(--gold)', cursor: 'pointer', marginTop: 5, display: 'inline-block', background: 'none', border: 'none' };
const btnBlack = { background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13 };
const btnGold = { background: 'var(--gold)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13 };
const btnOutline = { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', fontSize: 13 };

function fmtDate(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }
function fmtDatePretty(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; } }
function fmtDateLong(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } }
function gbp(n) { return '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ---- Printable preview ------------------------------------------------------
function QuotePreview({ s, addonTotal, total, dep }) {
  const docLabels = { quote: 'Quotation', deposit: 'Deposit Invoice', balance: 'Balance Invoice' };
  const wdActive = s.wdItems.filter(i => i.on && i.text.trim());
  const inclusions = buildInclusions(s);
  const shows = pkgShows(s.pkg);
  const softActive = s.softItems.filter(i => i.on && i.text.trim());
  const compActive = s.compItems.filter(i => i.on && i.text.trim());
  const activeSpirits = s.spiritRows.filter(r => r.on).map(r => ({ cat: r.cat, items: r.items.filter(i => i.on && i.text.trim()) })).filter(r => r.items.length);
  const activeAddons = s.addons.filter(a => a.on && parseFloat(a.price) > 0);

  if (!s.client && !s.venue) {
    return <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'center', padding: '60px 40px', color: 'var(--muted)', fontSize: 13 }}>Fill in the builder to preview the quote</div>;
  }

  const rowMuted = { color: '#8a8880', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', padding: '4px 0' };
  const rowValue = { color: '#1c1b18', fontSize: 12, padding: '4px 0' };
  const sectionHead = { fontSize: 10, letterSpacing: '.28em', textTransform: 'uppercase', color: '#0a0a0a', margin: '22px 0 12px', fontWeight: 500, borderBottom: '1px solid #e8e6e0', paddingBottom: 8 };
  const goldLabelSmall = { fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase', color: '#b8953a', marginBottom: 5, fontWeight: 500 };

  return (
    <div className="inv-preview-doc" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', fontFamily: 'var(--sans)' }}>
      {/* ── White header with brand + Ref number ── */}
      <div className="print-avoid-break" style={{ background: '#fff', color: '#0a0a0a', padding: '36px 44px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 30, borderBottom: '1px solid #e8e6e0' }}>
        <div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 30, letterSpacing: '.3em', fontWeight: 500, lineHeight: 1, color: '#0a0a0a' }}>ORPI</div>
          <div style={{ fontSize: 9.5, letterSpacing: '.38em', color: 'var(--gold)', marginTop: 6, fontWeight: 500 }}>MOBILE BAR &amp; EVENTS</div>
          <div style={{ marginTop: 22, fontSize: 10.5, color: '#555', lineHeight: 1.8, letterSpacing: '.02em' }}>
            Unit 5 Clements Court, Clements Lane, Ilford, IG1 2QY<br />
            Rudhra: +44 7424 505763 &nbsp;|&nbsp; Rahul: +44 7405 812971
          </div>
        </div>
        {s.invNum && (
          <div style={{ textAlign: 'right', fontSize: 9.5, letterSpacing: '.16em', color: '#8a8880', lineHeight: 1.8, textTransform: 'uppercase' }}>
            Reference<br />
            <strong style={{ color: '#0a0a0a', fontWeight: 500, letterSpacing: '.2em', fontSize: 12 }}>{s.invNum}</strong>
          </div>
        )}
      </div>
      {/* Gold band */}
      <div style={{ height: 2, background: 'var(--gold)' }} />

      {/* ── Doctype bar ── */}
      <div style={{ padding: '18px 44px', background: '#faf9f6', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #e8e6e0' }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 22, letterSpacing: '.04em', fontStyle: 'italic' }}>{docLabels[s.doctype]}</div>
        <div style={{ fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#666' }}>
          {s.date && <>Issued <strong style={{ color: '#0a0a0a', fontWeight: 500 }}>{fmtDatePretty(s.date)}</strong></>}
          {s.due && <> &nbsp;·&nbsp; {s.doctype === 'quote' ? 'Valid' : 'Due'} <strong style={{ color: '#0a0a0a', fontWeight: 500 }}>{fmtDatePretty(s.due)}</strong></>}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '28px 44px' }}>
        {/* Client + preparer row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, padding: '4px 0 22px', borderBottom: '1px solid #f0eee8' }}>
          <div>
            <div style={goldLabelSmall}>Prepared for</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 20, color: '#0a0a0a' }}>{s.client || '—'}</div>
          </div>
          <div>
            <div style={goldLabelSmall}>Prepared by</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 20, color: '#0a0a0a' }}>{s.salesPerson}</div>
          </div>
        </div>

        {/* Event details */}
        <div style={sectionHead}>Event details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '2px 20px' }}>
          <div style={rowMuted}>Event type</div><div style={rowValue}>{s.etype || '—'}</div>
          <div style={rowMuted}>Venue</div><div style={rowValue}>{s.venue || '—'}</div>
          <div style={rowMuted}>Date</div><div style={rowValue}>{s.edate ? fmtDateLong(s.edate) : '—'}</div>
          <div style={rowMuted}>Service time</div><div style={rowValue}>{s.etime || '—'}</div>
          <div style={rowMuted}>Guests</div><div style={rowValue}>{s.guests || '—'}</div>
          <div style={rowMuted}>Package</div><div style={rowValue}>{s.pkg}</div>
          <div style={rowMuted}>Duration</div><div style={rowValue}>{s.duration || '—'}</div>
          {s.setup && <><div style={rowMuted}>Setup access</div><div style={rowValue}>{s.setup}</div></>}
        </div>

        {/* Package summary — what this specific package includes.
            Makes it crystal clear to the client what they're getting,
            what each package includes for this event. */}
        {s.pkg !== 'Custom' && (
          <div style={{ background: '#faf9f6', border: '1px solid #e8e6e0', borderLeft: '3px solid var(--gold)', padding: '14px 18px', borderRadius: '0 6px 6px 0', marginTop: 22 }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 500, marginBottom: 8, letterSpacing: '.02em' }}>
              The <em style={{ color: 'var(--gold)' }}>{s.pkg}</em> Package
            </div>
            <div style={{ fontSize: 12, color: '#333', lineHeight: 1.6 }}>
              {(s.nct > 0 || s.nmt > 0) && (
                <div><strong>{s.nct} cocktail{s.nct!==1?'s':''} &amp; {s.nmt} mocktail{s.nmt!==1?'s':''}</strong> — chosen from our menu at your tasting</div>
              )}
              {s.pkg === 'Premium' && (
                <div><strong>2 hours cocktail &amp; mocktail service</strong> — bespoke drinks from your chosen menu</div>
              )}
              {s.pkg === 'Ultimate' && (
                <div><strong>Unlimited cocktail &amp; mocktail service all evening</strong> — no time limit on your bar</div>
              )}
              {s.pkg === 'Full Bar' && (
                <div><strong>Full open bar</strong> — house spirits, beers, wines and soft drinks throughout your event</div>
              )}
              {s.pkg === 'Cocktail Experience' && (
                <div><strong>Cocktail &amp; mocktail service</strong> — a curated menu for your event</div>
              )}
              {s.pkg === 'Welcome Drinks Only' && (
                <div><strong>Reception drinks service</strong> — welcome cocktails and mocktails on arrival</div>
              )}
              {s.pkg === 'Bar Only (client supplies alcohol)' && (
                <div><strong>Professional bar service</strong> — our team, bar and expertise; you supply the alcohol</div>
              )}
            </div>
          </div>
        )}
        {/* ── Included in your package ──
            Generated from the package, crew and drinkware rather than typed, so
            it can't promise glassware on a plastics job or a tasting the client
            isn't getting. Boxed and ticked so it reads as value, not small print. */}
        {inclusions.length > 0 && (
          <div className="print-avoid-break" style={{ background: '#faf9f6', border: '1px solid #e8e6e0', borderRadius: 8, padding: '18px 22px', marginTop: 24 }}>
            <div style={{ fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 600, marginBottom: 12 }}>
              Included in your package
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2px 22px' }}>
              {inclusions.map((text, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '4px 0', fontSize: 11.5, color: '#333', lineHeight: 1.45 }}>
                  <span style={{ color: 'var(--gold)', fontSize: 11, lineHeight: 1.45, flexShrink: 0 }}>✓</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Welcome drinks */}
        {shows.welcome && s.wdOn && wdActive.length > 0 && (
          <>
            <div style={sectionHead}>{s.wdDur} welcome drinks</div>
            <div style={{ fontSize: 12, color: '#333' }}>{wdActive.map(i => i.text).join(' · ')}</div>
          </>
        )}

        {/* Spirits & alcohol */}
        {shows.alcohol && activeSpirits.length > 0 && (
          <>
            <div style={sectionHead}>Spirits &amp; alcohol</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {activeSpirits.map(row => (
                <div key={row.cat}>
                  <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gold)', marginBottom: 5 }}>{row.cat}</div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.85, color: '#333' }}>{row.items.map(i => <div key={i.id}>{i.text}</div>)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Soft drinks */}
        {shows.softs && softActive.length > 0 && (
          <>
            <div style={sectionHead}>Soft drinks &amp; mixers</div>
            <div style={{ fontSize: 12, color: '#333' }}>{softActive.map(i => i.text).join(' · ')}</div>
          </>
        )}

        {/* Cocktails & mocktails */}
        {shows.cocktails && (s.nct > 0 || s.nmt > 0) && (
          <>
            <div style={sectionHead}>Cocktails &amp; mocktails</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {s.nct > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gold)', marginBottom: 6 }}>Cocktails ×{s.nct}</div>
                  {s.cocktailNames.slice(0, s.nct).map((n, i) => <div key={i} style={{ fontSize: 12, padding: '2px 0', color: '#333' }}>{i + 1}. {n || 'TBC'}</div>)}
                </div>
              )}
              {s.nmt > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gold)', marginBottom: 6 }}>Mocktails ×{s.nmt}</div>
                  {s.mocktailNames.slice(0, s.nmt).map((n, i) => <div key={i} style={{ fontSize: 12, padding: '2px 0', color: '#333' }}>{i + 1}. {n || 'TBC'}</div>)}
                </div>
              )}
            </div>
          </>
        )}

        {/* Add-ons are folded into the package total — not itemised on the client quote */}

        {/* Complimentary */}
        {compActive.length > 0 && (
          <>
            <div style={sectionHead}>Complimentary</div>
            <div style={{ fontSize: 12, color: '#333' }}>{compActive.map(i => i.text).join(' · ')}</div>
          </>
        )}

        {/* Notes */}
        {s.notes && (
          <div style={{ background: 'var(--gold-bg)', borderLeft: '3px solid var(--gold)', padding: '10px 14px', fontSize: 12, borderRadius: '0 4px 4px 0', marginTop: 18, color: '#555' }}>{s.notes}</div>
        )}
      </div>

      {/* ── Pricing block (light, legible, with bank details) ── */}
      <div className="print-avoid-break" style={{ background: '#faf9f6', color: '#1c1b18', padding: '26px 44px', borderTop: '1px solid #e8e6e0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: '#666' }}>
          <span>Package total</span><span>{gbp((parseFloat(s.base) || 0) + addonTotal)}</span>
        </div>
        {/* Extras embedded in the package price — shown as one figure to the client */}
        {parseFloat(s.disc) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: '#666' }}>
            <span>Discount</span><span>−{gbp(parseFloat(s.disc))}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 14, marginTop: 10, borderTop: '1px solid #d9d5c8', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 500 }}>
            {s.doctype === 'quote' ? 'Total' : s.doctype === 'deposit' ? 'Deposit due (50%)' : 'Balance due'}
          </span>
          <span style={{ fontFamily: 'var(--serif)', fontSize: 32, color: '#0a0a0a', fontWeight: 500 }}>
            {gbp(s.doctype === 'quote' ? total : dep)}
          </span>
        </div>
        {s.doctype === 'quote' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11, color: '#555', marginTop: 10 }}>
              <span>50% deposit on confirmation</span><span>{gbp(dep)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11, color: '#555' }}>
              <span>Balance due 14 days before</span><span>{gbp(dep)}</span>
            </div>
          </>
        )}

        {/* ── Bank details, right beside the amount that needs paying ── */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #d9d5c8', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase', color: '#8a8880', marginBottom: 4 }}>Payee</div>
            <div style={{ fontSize: 12, color: '#0a0a0a', fontWeight: 500 }}>ORPI Events LTD</div>
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase', color: '#8a8880', marginBottom: 4 }}>Sort code</div>
            <div style={{ fontSize: 12, color: '#0a0a0a', fontWeight: 500, letterSpacing: '.06em' }}>04-06-05</div>
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase', color: '#8a8880', marginBottom: 4 }}>Account no.</div>
            <div style={{ fontSize: 12, color: '#0a0a0a', fontWeight: 500, letterSpacing: '.06em' }}>27534338</div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 10.5, color: '#8a8880', fontStyle: 'italic' }}>
          Reference &nbsp;·&nbsp; {s.client || 'Your surname'} &nbsp;+&nbsp; {s.edate ? fmtDatePretty(s.edate) : 'event date'}
        </div>
      </div>

      {/* ── Enhancements you might like (unselected add-ons) ──
          Shown greyed-out below pricing so clients can see what else we
          offer without feeling pitched to. Only appears when there are
          any unselected add-ons — a clean, all-selected quote won't show
          this section at all. */}
      {(() => {
        const unselectedAddons = s.addons.filter(a => !a.on || !parseFloat(a.price));
        if (unselectedAddons.length === 0) return null;
        return (
          <div className="print-avoid-break" style={{ padding: '20px 44px', background: '#fff', borderTop: '1px solid #e8e6e0' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 500, marginBottom: 4, letterSpacing: '.02em', fontStyle: 'italic', color: '#0a0a0a' }}>
              Enhancements you might like
            </div>
            <div style={{ fontSize: 10.5, color: '#8a8880', marginBottom: 14, fontStyle: 'italic' }}>
              Not included in this quote — let us know if you'd like to add any.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
              {unselectedAddons.map(a => (
                <div key={a.id} style={{ opacity: 0.72, borderLeft: '1px solid #e8e6e0', paddingLeft: 12, minHeight: 34 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 500, color: '#333' }}>{a.label}</div>
                  {a.desc && <div style={{ fontSize: 10, color: '#8a8880', marginTop: 2, lineHeight: 1.45 }}>{a.desc}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Key terms ── */}
      <div className="print-avoid-break" style={{ padding: '20px 44px', background: '#fff' }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 500, marginBottom: 10, letterSpacing: '.02em', fontStyle: 'italic' }}>Key terms &amp; conditions</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 10.5, color: '#333', lineHeight: 1.55 }}>
          <div><strong>Booking confirmation</strong> — 50% deposit secures your date; until received, the date remains open.</div>
          <div><strong>Balance</strong> — remaining 50% due no later than 14 days before the event.</div>
          <div><strong>Quote validity</strong> — this quote is valid for 14 days; pricing may change after.</div>
          <div><strong>Guest numbers</strong> — final count required 7 days before; increases charged at agreed rate.</div>
          <div><strong>Cancellation</strong> — {'>'}60 days: deposit retained · within 60: 50% · within 14: 100%.</div>
          <div><strong>Substitutions</strong> — if a spirit brand is unavailable, we substitute for equal/higher quality.</div>
          <div><strong>Access &amp; power</strong> — client provides venue access, parking &amp; power supply.</div>
          <div><strong>Responsible service</strong> — our team serves in line with UK licensing law; we may refuse service.</div>
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>
          Full terms &amp; conditions will be provided on booking confirmation. Paying the deposit confirms your acceptance.
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: '16px 44px', background: '#faf9f6', borderTop: '1px solid #e8e6e0', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8a8880', textAlign: 'center' }}>
        hello@orpi.events &nbsp;·&nbsp; @orpi.events &nbsp;·&nbsp; orpi.events
      </div>
    </div>
  );
}

function DL({ label, value }) {
  return (<><div style={{ fontSize: 11, color: 'var(--muted)', padding: '3px 0' }}>{label}</div><div style={{ fontSize: 11, padding: '3px 0' }}>{value || '—'}</div></>);
}
function Section({ title, children }) {
  return (<div className="print-avoid-break" style={{ marginBottom: 10 }}><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', margin: '12px 0 6px' }}>{title}</div>{children}</div>);
}
function PriceRow({ label, value, muted }) {
  return (<div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: muted ? 11 : 12, color: muted ? '#555' : '#888', borderBottom: '1px solid #1a1a1a' }}><span>{label}</span><span>{value}</span></div>);
}
