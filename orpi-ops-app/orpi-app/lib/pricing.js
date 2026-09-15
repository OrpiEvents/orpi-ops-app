// lib/pricing.js
//
// One rule about what a bottle costs, used by every route that needs to know.
//
// We price at the LATEST purchase, not the average. A quote is a promise about
// what an event will cost to deliver, so it should be built on what replacing
// the stock costs today \u2014 not on an average dragging in what you paid a year
// ago. Averages also hide price rises, which is the opposite of useful.
//
// Emergency buys are excluded. A bottle grabbed from a corner shop on the way
// to a venue is a real cost, and it gets recorded against that event, but it
// isn't your buying price and shouldn't set the benchmark for future quotes.
// That's what the "Ad-hoc / emergency buy" checkbox is for.
//
// If an item has only ever been bought ad-hoc, we use that rather than pretend
// we know nothing.

const asNumber = p => {
  if (typeof p?.number === 'number') return p.number;
  // Formulas and rollups hide their value one level down.
  if (typeof p?.formula?.number === 'number') return p.formula.number;
  if (typeof p?.rollup?.number === 'number') return p.rollup.number;
  return null;
};

const relatedId = p => p?.relation?.[0]?.id?.replace(/-/g, '') || null;

/**
 * Builds { inventoryPageId: { unitCost, boughtOn, adHoc, supplier } } from
 * Inventory Purchases pages. Newest non-emergency purchase wins.
 */
export function latestUnitCosts(purchasePages) {
  const best = {};

  for (const page of purchasePages) {
    const props = page.properties || {};
    const itemId = relatedId(props['\u{1F37A} Inventory Items']);
    const unitCost = asNumber(props['Unit Cost']);
    if (!itemId || !(unitCost > 0)) continue;

    const boughtOn = props['Date Bought']?.date?.start || page.created_time?.split('T')[0] || '';
    const adHoc = !!props['Ad-hoc / emergency buy']?.checkbox;
    const supplier = props['Supplier']?.select?.name || '';
    const candidate = { unitCost, boughtOn, adHoc, supplier };

    const current = best[itemId];
    if (!current) { best[itemId] = candidate; continue; }

    // A normal purchase always beats an emergency one, whatever the dates say.
    if (current.adHoc && !adHoc) { best[itemId] = candidate; continue; }
    if (!current.adHoc && adHoc) continue;

    if (candidate.boughtOn > current.boughtOn) best[itemId] = candidate;
  }

  return best;
}

/**
 * What this item costs per unit right now. Falls back to the Average Unit Cost
 * formula when nothing has been bought yet, so a brand new product still costs
 * something rather than silently zeroing a drink.
 */
export function unitCostFor(itemPageId, priceIndex, inventoryPage) {
  const priced = priceIndex[itemPageId];
  if (priced) return priced.unitCost;
  return asNumber(inventoryPage?.properties?.['Average Unit Cost'])
      ?? asNumber(inventoryPage?.properties?.['Unit Cost'])
      ?? 0;
}

export { asNumber };
