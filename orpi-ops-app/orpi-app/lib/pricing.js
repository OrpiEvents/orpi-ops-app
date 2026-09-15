// lib/pricing.js
//
// One rule about what a bottle costs, used by every route that needs to know.
//
// We price at a QUANTITY-WEIGHTED AVERAGE of recent purchases, not the single
// latest one. ORPI buys the same product from different suppliers, so the most
// recent price is partly a coin flip — whichever supplier happened to be used
// last. Averaging over a window smooths that without hiding a real trend, and
// since events are quoted months ahead, an average predicts cost-at-delivery
// better than a snapshot of today.
//
// Weighted, not a plain mean: 24 bottles at £17 and one at £24 should land near
// £17, because that's what the stock actually cost.
//
// Emergency buys are excluded. A bottle grabbed from a corner shop on the way
// to a venue is a real cost and gets charged to that event, but it isn't your
// buying price and shouldn't set the benchmark. That's the "Ad-hoc / emergency
// buy" checkbox.
//
// Fallbacks, in order, so nothing ever silently costs zero:
//   1. weighted average of normal purchases inside the window
//   2. most recent normal purchase of any age (slow-moving stock)
//   3. most recent ad-hoc purchase (only ever bought in a panic)
//   4. the Average Unit Cost formula on the item (never purchased at all)

// How far back to average. Three months balances smoothing against staleness;
// raise it for stable prices, lower it if prices are moving fast.
export const PRICE_WINDOW_DAYS = 90;

const asNumber = p => {
  if (typeof p?.number === 'number') return p.number;
  // Formulas and rollups hide their value one level down.
  if (typeof p?.formula?.number === 'number') return p.formula.number;
  if (typeof p?.rollup?.number === 'number') return p.rollup.number;
  return null;
};

const relatedId = p => p?.relation?.[0]?.id?.replace(/-/g, '') || null;

function readPurchase(page) {
  const props = page.properties || {};
  const itemId = relatedId(props['\u{1F37A} Inventory Items']);
  const unitCost = asNumber(props['Unit Cost']);
  if (!itemId || !(unitCost > 0)) return null;
  return {
    itemId,
    unitCost,
    // Quantity drives the weighting. Missing or zero counts as one, so a row
    // with no quantity still contributes rather than vanishing.
    qty: Math.max(1, asNumber(props['Quantity Bought']) || 1),
    boughtOn: props['Date Bought']?.date?.start || page.created_time?.split('T')[0] || '',
    adHoc: !!props['Ad-hoc / emergency buy']?.checkbox,
    supplier: props['Supplier']?.select?.name || '',
  };
}

/**
 * Builds { inventoryPageId: { unitCost, basis, from, to, purchases, suppliers } }
 * from Inventory Purchases pages. `basis` records which rule produced the
 * number, so the app can show where a price came from.
 */
export function latestUnitCosts(purchasePages, windowDays = PRICE_WINDOW_DAYS) {
  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString().split('T')[0];

  const byItem = {};
  for (const page of purchasePages) {
    const row = readPurchase(page);
    if (!row) continue;
    (byItem[row.itemId] ||= []).push(row);
  }

  const out = {};
  for (const [itemId, rows] of Object.entries(byItem)) {
    const normal = rows.filter(r => !r.adHoc);
    const inWindow = normal.filter(r => r.boughtOn >= cutoff);

    if (inWindow.length) {
      const spend = inWindow.reduce((t, r) => t + r.unitCost * r.qty, 0);
      const units = inWindow.reduce((t, r) => t + r.qty, 0);
      const dates = inWindow.map(r => r.boughtOn).sort();
      out[itemId] = {
        unitCost: spend / units,
        basis: inWindow.length === 1 ? 'single purchase in window' : `${windowDays}-day weighted average`,
        from: dates[0],
        to: dates[dates.length - 1],
        purchases: inWindow.length,
        suppliers: [...new Set(inWindow.map(r => r.supplier).filter(Boolean))],
      };
      continue;
    }

    // Nothing recent. Use the newest normal purchase whatever its age rather
    // than pretend a slow-moving bottle is free.
    const newest = [...(normal.length ? normal : rows)].sort((a, b) => (a.boughtOn < b.boughtOn ? 1 : -1))[0];
    out[itemId] = {
      unitCost: newest.unitCost,
      basis: normal.length ? 'last purchase, older than window' : 'emergency purchase only',
      from: newest.boughtOn,
      to: newest.boughtOn,
      purchases: 1,
      suppliers: [newest.supplier].filter(Boolean),
    };
  }

  return out;
}

/**
 * What this item costs per unit. Falls back to the Average Unit Cost formula
 * when nothing has ever been bought, so a brand new product still costs
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
