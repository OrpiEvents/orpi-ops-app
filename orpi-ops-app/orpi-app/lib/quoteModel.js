// lib/quoteModel.js
//
// The pure costing + inclusions model behind the quote builder. Extracted from
// QuoteClient so the internal builder AND the client-facing invoice page render
// from one source and can never drift apart — the same worry that drives the
// generated inclusions and PKG_SHOWS. No React, no browser APIs, so it's safe
// to import from a server component too.

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
export const COST = {
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
export const ALCOHOL_MIX = [
  { key: 'spirits',  label: 'Spirits',  perHead: 6.07, tiered: true },
  { key: 'beer',     label: 'Beer',     perHead: 0.54 },
  { key: 'liqueurs', label: 'Liqueurs', perHead: 0.44 },
  { key: 'prosecco', label: 'Prosecco', perHead: 0.30 },
  { key: 'wine',     label: 'Wine',     perHead: 0.10 },
];

// ── Welcome drinks ──────────────────────────────────────────────────
// The standard tray: prosecco, beers, one welcome cocktail, one welcome
// mocktail. Costed per serve from ORPI's own prices.
export const WELCOME_MIX = [
  { key: 'prosecco', label: 'Prosecco',         perServe: 1.21 },
  { key: 'beer',     label: 'Beer',             perServe: 0.85 },
  { key: 'cocktail', label: 'Welcome cocktail', perServe: 2.11 },
  { key: 'mocktail', label: 'Welcome mocktail', perServe: 1.09 },
];

// How many drinks a guest gets through per hour of arrival drinks.
export const WELCOME_PER_HOUR = 1.0;

// Spirit grade multiplier, applied to the spirits component only.
export const SPIRIT_TIERS = {
  house:    { label: 'House',    index: 0.83, note: 'Absolut, Gordon\'s, Jameson, Bacardi' },
  standard: { label: 'Standard', index: 1.00, note: 'the house/premium mix we actually book' },
  premium:  { label: 'Premium',  index: 1.33, note: 'Grey Goose, Ciroc, Black Label throughout' },
  luxury:   { label: 'Luxury',   index: 1.85, note: 'estimate — no luxury events logged yet' },
};

// Drinkware presets → units per head.
export const DRINKWARE = {
  mixed:   { label: 'Glass + late-night plastics', glass: 4, plastic: 1.5 },
  glass:   { label: 'Glassware only',              glass: 5, plastic: 0 },
  plastic: { label: 'Plastics only',               glass: 0, plastic: 6 },
};

// Every cost that should be considered before a quote goes out.
export const COST_CHECKS = [
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

// Base price-per-head defaults. Suggested only — the typed base always wins.
export const PPH = {
  'Premium': { glass: 45, plastic: 35 },
  'Ultimate': { glass: 55, plastic: 45 },
  'Full Bar': { glass: 40, plastic: 30 },
  'Cocktail Experience': { glass: 24, plastic: 20 },
  'Welcome Drinks Only': { glass: 15, plastic: 12 },
  'Bar Only (client supplies alcohol)': { glass: 15, plastic: 12 },
  'Custom': { glass: 0, plastic: 0 },
};

// What a client is buying, per package. The quote reads from this rather than
// showing every section regardless — a Bar Only quote listing our spirits is
// promising something the client is supplying themselves, and a Welcome Drinks
// quote with a full back bar on it invites an awkward conversation on the day.
export const PKG_SHOWS = {
  'Premium':                            { alcohol: true,  softs: true,  cocktails: true,  welcome: true },
  'Ultimate':                           { alcohol: true,  softs: true,  cocktails: true,  welcome: true },
  'Full Bar':                           { alcohol: true,  softs: true,  cocktails: false, welcome: true },
  'Cocktail Experience':                { alcohol: false, softs: true,  cocktails: true,  welcome: true },
  'Welcome Drinks Only':                { alcohol: false, softs: true,  cocktails: false, welcome: true },
  'Bar Only (client supplies alcohol)': { alcohol: false, softs: true,  cocktails: true,  welcome: true },
  'Custom':                             { alcohol: true,  softs: true,  cocktails: true,  welcome: true },
};
export const pkgShows = pkg => PKG_SHOWS[pkg] || PKG_SHOWS['Custom'];

// Which of the four welcome components are actually on the tray, classified
// most specific first.
export const WELCOME_MATCH = [
  ['mocktail', /mocktail|virgin|non.?alcohol|alcohol.?free|juice|ombre|lemonade|press[eé]|soft/i],
  ['cocktail', /cocktail|spritz|pimms|aperol|hugo|bellini|martini|punch|sangria|mojito/i],
  ['prosecco', /prosecco|champagne|cava|sparkl|fizz|bubbl|moet|freixenet|lanson/i],
  ['beer',     /beer|lager|cider|peroni|moretti|budweiser|\bbud\b|kingfisher|estrella|corona|heineken|stella|birra/i],
];

// Default crew at 1 per 50 guests: one lead, the rest bartenders.
export function defaultCrew(guests) {
  const g = Number(guests) || 0;
  if (!g) return [];
  const n = Math.max(1, Math.ceil(g / 50));
  const crew = [{ id: 'crew_lead', role: 'Lead bartender', count: 1, rate: COST.leadRate }];
  if (n > 1) crew.push({ id: 'crew_bar', role: 'Bartender', count: n - 1, rate: COST.staffRate });
  return crew;
}
export function crewFor(s) {
  return Array.isArray(s.staffRows) ? s.staffRows : defaultCrew(s.guests);
}
export function num(v, fallback = 0) {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}
export function hoursFrom(text) {
  return parseFloat(String(text || '').replace(/[^0-9.]/g, '')) || 0;
}

// Which alcohol components this quote actually includes. Driven by the spirit
// rows on the client-facing quote, so a package without wine isn't costed for
// wine — and the printed inclusions can't claim it either.
export function alcoholParts(s, orpiOnly = false) {
  // orpiOnly drops client-supplied items, so a bar where the client brings the
  // beer isn't costed for it — the item still prints on the quote, just labelled.
  const live = i => i.on && i.text.trim() && (!orpiOnly || (i.by || 'orpi') !== 'client');
  const rows = (s.spiritRows || []).filter(r => r.on && r.items.some(live));
  // "Peroni 0%" matches /beer/ and "Non-Alcoholic Wine" matches /wine/, so
  // alcohol-free rows are filtered out once, up front.
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
export function alcoholLine(s) {
  const parts = alcoholParts(s, true);
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
export function alcoholPerHead(s) {
  // No ORPI-supplied drinking spirits to cost here: Bar Only uses the client's
  // own, and Welcome Drinks Only has only the arrival tray (costed separately).
  if (s.pkg === 'Bar Only (client supplies alcohol)' || s.pkg === 'Welcome Drinks Only') return 0;
  const manual = parseFloat(s.alcoholOverride);
  if (!isNaN(manual) && manual >= 0) return manual;
  const parts = alcoholParts(s, true);
  const tier = SPIRIT_TIERS[s.spiritTier] || SPIRIT_TIERS.standard;
  return ALCOHOL_MIX.reduce((sum, m) => {
    if (!parts[m.key]) return sum;
    return sum + m.perHead * (m.tiered ? tier.index : 1);
  }, 0);
}

export function welcomeParts(s, orpiOnly = false) {
  const out = { prosecco: false, beer: false, cocktail: false, mocktail: false };
  if (!s.wdOn) return out;
  (s.wdItems || []).forEach(i => {
    if (!i.on || !i.text.trim()) return;
    if (orpiOnly && (i.by || 'orpi') === 'client') return;
    const hit = WELCOME_MATCH.find(([, re]) => re.test(i.text));
    if (hit) out[hit[0]] = true;
  });
  return out;
}

// Welcome drinks cost per head.
export function welcomePerHead(s) {
  if (!s.wdOn) return 0;
  const parts = welcomeParts(s, true);
  const live = WELCOME_MIX.filter(m => parts[m.key]);
  if (!live.length) return 0;
  const perDrink = live.reduce((t, m) => t + m.perServe, 0) / live.length;
  const perHour = num(s.wdPerHour, WELCOME_PER_HOUR);
  return hoursFrom(s.wdDur) * perHour * perDrink;
}

// Is a tasting part of this quote? 'auto' follows the guest threshold; the
// other three are manual overrides for the odd case.
export function tastingState(s) {
  const g = Number(s.guests) || 0;
  if (s.tastingMode === 'included') return 'included';
  if (s.tastingMode === 'charged') return 'charged';
  if (s.tastingMode === 'none') return 'none';
  return g >= COST.tastingThreshold ? 'included' : 'none';
}

// The single source of truth for what this event costs us. Both the internal
// panel and the generated client inclusions read from here, so the two can't
// drift apart.
export function computeCosts(s) {
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
  const prepHrs = num(s.prepHrs);
  const prepRate = num(s.prepRate, 0);
  const prepCost = prepHrs * prepRate;
  const prepShadow = prepHrs * COST.prepRate;

  const isClientAlcohol = s.pkg === 'Bar Only (client supplies alcohol)';
  const alcPerHead = alcoholPerHead(s);
  const alcCost = alcPerHead * g;
  const alcParts = alcoholParts(s, true);
  const alcManual = !isNaN(parseFloat(s.alcoholOverride)) && parseFloat(s.alcoholOverride) >= 0;
  // Client-supplied soft drinks come off the flat mixer cost proportionally.
  const softsList = (s.softItems || []).filter(i => i.on && i.text.trim());
  const orpiSofts = softsList.filter(i => (i.by || 'orpi') !== 'client');
  const softFrac = softsList.length ? orpiSofts.length / softsList.length : 1;
  const mixersCost = COST.mixersPerHead * g * softFrac;
  const iceCost = COST.icePerHead * g;
  const garnishCost = COST.garnishPerHead * g;

  // Arrival drinks, costed separately from the bar.
  const wdParts = welcomeParts(s, true);
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

  const oneOffs = (s.costLines || []).reduce((sum, l) => sum + num(l.qty) * num(l.unitCost), 0);

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

// Which checklist lines are still hanging.
export function unresolvedChecks(s) {
  const tagged = new Set((s.costLines || []).map(l => l.check).filter(Boolean));
  return COST_CHECKS.filter(c => {
    if (c.auto) return false;
    if ((s.costChecks || {})[c.key] === 'na') return false;
    return !tagged.has(c.key);
  });
}

// The client-facing inclusions list, generated rather than typed, so it always
// matches the quote it's printed on.
export function buildInclusions(s) {
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

  (s.inclItems || []).filter(i => i.on && i.text.trim()).forEach(i => out.push(i.text.trim()));
  return out;
}

// ── Formatting ───────────────────────────────────────────────
export function fmtDate(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }
export function fmtDatePretty(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; } }
export function fmtDateLong(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } }
export function gbp(n) { return '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
