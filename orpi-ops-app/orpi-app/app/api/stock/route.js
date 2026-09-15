// app/api/stock/route.js
//
// The inventory list. Read by the stock take page, the quote builder's cost
// lines, and anywhere else that needs to pick a stock item.
//
// Unit cost here is the LATEST purchase price, not a running average, matching
// how the drinks library and event costing price things — see lib/pricing.

import { latestUnitCosts, unitCostFor } from '@/lib/pricing';

const TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const DB_INVENTORY = process.env.NOTION_DB_INVENTORY || '2e16ca9d054980cf978edf55d1d40efb';
const DB_PURCHASES = process.env.NOTION_DB_PURCHASES || '2e16ca9d054980879bc5ef22eb00f97d';

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
      method: 'POST', headers: headers(),
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
      cache: 'no-store',
    });
    if (!res.ok) {
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
const num = p => {
  if (typeof p?.number === 'number') return p.number;
  if (typeof p?.formula?.number === 'number') return p.formula.number;
  if (typeof p?.rollup?.number === 'number') return p.rollup.number;
  return null;
};

export async function GET() {
  if (!TOKEN) return Response.json({ error: 'NOTION_TOKEN not set' }, { status: 500 });

  try {
    const [invPages, purchasePages] = await Promise.all([
      queryAll(DB_INVENTORY, 'Inventory Items'),
      queryAll(DB_PURCHASES, 'Inventory Purchases'),
    ]);

    const priceIndex = latestUnitCosts(purchasePages);

    const items = invPages
      .map(page => {
        const p = page.properties;
        const id = page.id;
        const volume = num(p['Container Volume ml']) || 0;
        const unitCost = unitCostFor(id.replace(/-/g, ''), priceIndex, page);
        return {
          id,
          name: title(p['Item Name']),
          category: sel(p['Catagory']) || 'Other',   // spelled that way in Notion
          size: text(p['Size']),
          unit: sel(p['Unit']) || text(p['Unit']) || '',
          containerMl: volume,
          currentStock: num(p['Current Stock']) ?? 0,
          parLevel: num(p['Par Level']),
          needsSetup: !!p['Needs setup']?.checkbox,
          // Named averageUnitCost for the callers that already expect it, but
          // it's the latest purchase price.
          averageUnitCost: unitCost,
          costPerMl: volume > 0 ? unitCost / volume : 0,
          pricedOn: priceIndex[id.replace(/-/g, '')]?.boughtOn || null,
        };
      })
      .filter(i => i.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    return Response.json({ items });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}
