// app/api/purchases/route.js
//
// One entry, three places. Buying something has always meant three separate
// jobs in Notion — log the purchase so the price is right, put the stock on the
// shelf, and charge the event that used it. Doing them by hand meant two of the
// three usually didn't happen.
//
// A saved line does all three:
//   1. Inventory Purchase row      -> sets the rolling average price
//   2. Current Stock += bought      -> the shelf knows it arrived
//   3. Event Costing row for `used` -> the event carries only what it consumed
//      and Current Stock -= used
//
// Net effect on stock is (bought - used), which is the leftover. Buy 6 litres of
// cherry juice for an event, use 2, and the event carries 2 while 4 stay in
// stock — without anyone doing the arithmetic.
//
// Property names are resolved from the live schema rather than hardcoded. These
// databases have been renamed before ('Catagory' is still misspelt) and a write
// that 400s because of an emoji prefix is a bad way to find out.

import { costTypeFor } from '@/lib/taxonomy';

export const maxDuration = 60;

const TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const DB_INVENTORY = process.env.NOTION_DB_INVENTORY || '2e16ca9d054980cf978edf55d1d40efb';
const DB_COSTING = process.env.NOTION_DB_COSTING || '2e36ca9d054980b2b232d8164def4997';
const DB_PURCHASES = process.env.NOTION_DB_PURCHASES || '2e16ca9d054980879bc5ef22eb00f97d';

// Notion allows roughly three requests a second. A six-line receipt is about
// eighteen writes, so pace them rather than get halfway and hit a 429.
const PAUSE = 220;
const pause = ms => new Promise(r => setTimeout(r, ms));

const headers = () => ({
  Authorization: `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
});

const num = p => (typeof p?.number === 'number' ? p.number : null);
const title = p => p?.title?.map(t => t.plain_text).join('').trim() || '';

async function queryAll(dbId, label) {
  const rows = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Notion ${res.status} reading ${label}`);
    const json = await res.json();
    rows.push(...json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return rows;
}

async function schemaOf(dbId, label) {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Notion ${res.status} reading ${label} schema`);
  return (await res.json()).properties || {};
}

// Finds a property by what it IS rather than what it's called, so an emoji
// prefix or a rename doesn't break the write.
const keyByType = (props, type) => Object.keys(props).find(k => props[k]?.type === type);
const keyMatching = (props, type, re) =>
  Object.keys(props).find(k => props[k]?.type === type && re.test(k));

export async function GET() {
  if (!TOKEN) return Response.json({ error: 'NOTION_TOKEN not set' }, { status: 500 });

  try {
    const [purchasePages, inventoryPages] = await Promise.all([
      queryAll(DB_PURCHASES, 'purchases'),
      queryAll(DB_INVENTORY, 'inventory'),
    ]);

    const nameById = {};
    for (const page of inventoryPages) nameById[page.id] = title(page.properties['Item Name']);

    const rows = purchasePages.map(page => {
      const p = page.properties;
      const relKey = keyMatching(p, 'relation', /inventory/i);
      const itemId = p[relKey]?.relation?.[0]?.id || '';
      return {
        id: page.id,
        line: title(p[keyByType(p, 'title')]),
        item: nameById[itemId] || '',
        qty: num(p['Quantity Bought']),
        unitCost: num(p['Unit Cost']),
        supplier: p['Supplier']?.select?.name || '',
        ownedBy: p['Owned By?']?.select?.name || '',
        adHoc: !!p['Ad-hoc / emergency buy']?.checkbox,
        dateBought: p['Date Bought']?.date?.start || page.created_time?.split('T')[0] || '',
      };
    });

    rows.sort((a, b) => (a.dateBought < b.dateBought ? 1 : a.dateBought > b.dateBought ? -1 : 0));

    return Response.json({
      purchases: rows.slice(0, 60),
      suppliers: [...new Set(rows.map(r => r.supplier).filter(Boolean))].sort(),
      owners: [...new Set(rows.map(r => r.ownedBy).filter(Boolean))].sort(),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(request) {
  if (!TOKEN) return Response.json({ error: 'NOTION_TOKEN not set' }, { status: 500 });

  try {
    const {
      dateBought = new Date().toISOString().split('T')[0],
      supplier = '',
      ownedBy = '',
      adHoc = false,
      bookingId = '',
      eventLabel = '',
      lines = [],
    } = await request.json();

    if (!Array.isArray(lines) || !lines.length) {
      return Response.json({ error: 'Nothing to save — add at least one item.' }, { status: 400 });
    }

    const [pSchema, cSchema, invSchema, inventoryPages] = await Promise.all([
      schemaOf(DB_PURCHASES, 'purchases'),
      bookingId ? schemaOf(DB_COSTING, 'event costing') : Promise.resolve({}),
      schemaOf(DB_INVENTORY, 'inventory'),
      queryAll(DB_INVENTORY, 'inventory'),
    ]);

    const pTitle = keyByType(pSchema, 'title');
    const pItemRel = keyMatching(pSchema, 'relation', /inventory/i);
    const cTitle = keyByType(cSchema, 'title');
    const cBookingRel = keyMatching(cSchema, 'relation', /booking|event/i);
    const cItemRel = keyMatching(cSchema, 'relation', /inventory/i);
    const invTitle = keyByType(invSchema, 'title');
    const invCat = Object.keys(invSchema).find(k => /cat[ae]gory/i.test(k));

    // Fresh stock, read once. Trusting the browser's copy would lose whatever
    // the stock take or another close changed in the meantime.
    const stockById = {};
    const catById = {};
    const idByName = {};
    for (const page of inventoryPages) {
      stockById[page.id] = num(page.properties['Current Stock']) ?? 0;
      catById[page.id] = page.properties[invCat]?.select?.name || 'Other';
      const nm = title(page.properties[invTitle]);
      if (nm) idByName[nm.toLowerCase().replace(/\s+/g, ' ').trim()] = page.id;
    }

    const saved = [];
    const createdItems = [];
    const failed = [];
    let spend = 0;
    let charged = 0;

    for (const line of lines) {
      const name = String(line.name || '').trim();
      const qty = Math.max(0, Number(line.qty) || 0);
      const unitCost = Math.max(0, Number(line.unitCost) || 0);
      // Can't use more than was bought. A typo here would otherwise drive stock
      // negative and overcharge the event.
      const used = bookingId ? Math.min(qty, Math.max(0, Number(line.used) || 0)) : 0;

      if (!name) { failed.push({ name: '(unnamed)', why: 'no name' }); continue; }
      if (!qty) { failed.push({ name, why: 'no quantity' }); continue; }

      // Last line of defence against a duplicate row: a caller that didn't send
      // an id might still be naming something that already exists.
      let itemId = line.itemId || idByName[name.toLowerCase().replace(/\s+/g, ' ').trim()] || '';

      // A product nobody has bought before. Created at zero stock — the purchase
      // below is what puts the first bottles on the shelf.
      if (!itemId) {
        const props = { [invTitle]: { title: [{ text: { content: name } }] }, 'Current Stock': { number: 0 } };
        if (line.category && invCat) props[invCat] = { select: { name: line.category } };
        if (line.size && invSchema['Size']) props['Size'] = { rich_text: [{ text: { content: String(line.size) } }] };
        if (line.unit && invSchema['Unit']) props['Unit'] = { select: { name: line.unit } };

        const res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ parent: { database_id: DB_INVENTORY }, properties: props }),
        });
        await pause(PAUSE);
        if (!res.ok) { failed.push({ name, why: 'could not create the inventory item' }); continue; }

        itemId = (await res.json()).id;
        stockById[itemId] = 0;
        catById[itemId] = line.category || 'Other';
        createdItems.push(name);
      }

      const cat = catById[itemId] || line.category || 'Other';

      // 1. The purchase. This is what the rolling average reads, so it carries
      //    the real price paid even when that was a panic buy at a corner shop.
      const pProps = {};
      if (pTitle) {
        const label = eventLabel ? `${name} — ${dateBought} (${eventLabel})` : `${name} — ${dateBought}`;
        pProps[pTitle] = { title: [{ text: { content: label.slice(0, 1900) } }] };
      }
      if (pSchema['Quantity Bought']) pProps['Quantity Bought'] = { number: qty };
      if (pSchema['Unit Cost']) pProps['Unit Cost'] = { number: unitCost };
      if (pSchema['Date Bought']) pProps['Date Bought'] = { date: { start: dateBought } };
      if (supplier && pSchema['Supplier']) pProps['Supplier'] = { select: { name: supplier } };
      if (ownedBy && pSchema['Owned By?']) pProps['Owned By?'] = { select: { name: ownedBy } };
      if (pItemRel) pProps[pItemRel] = { relation: [{ id: itemId }] };
      // Excluded from the benchmark price, not from the event's costs.
      if (adHoc && pSchema['Ad-hoc / emergency buy']) pProps['Ad-hoc / emergency buy'] = { checkbox: true };

      const pRes = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ parent: { database_id: DB_PURCHASES }, properties: pProps }),
      });
      await pause(PAUSE);
      if (!pRes.ok) {
        failed.push({ name, why: `purchase not saved (Notion ${pRes.status})` });
        continue;
      }
      spend += qty * unitCost;

      // 2. The event's share. Priced at what was actually paid for these
      //    bottles, not the benchmark — that spend is real and belongs here.
      let costWritten = false;
      if (bookingId && used > 0 && cTitle) {
        const cProps = {
          [cTitle]: { title: [{ text: { content: name } }] },
          'Cost Type': { select: { name: costTypeFor(cat) } },
          'Quantity Used': { number: used },
          'Locked Unit Cost': { number: unitCost },
        };
        if (cBookingRel) cProps[cBookingRel] = { relation: [{ id: bookingId }] };
        if (cItemRel) cProps[cItemRel] = { relation: [{ id: itemId }] };

        const cRes = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ parent: { database_id: DB_COSTING }, properties: cProps }),
        });
        await pause(PAUSE);
        if (cRes.ok) { costWritten = true; charged += used * unitCost; }
        else failed.push({ name, why: `bought and stocked, but the event cost line failed (Notion ${cRes.status})` });
      }

      // 3. Stock, in one write. Bought minus used is the leftover.
      const next = Math.max(0, (stockById[itemId] ?? 0) + qty - used);
      await fetch(`https://api.notion.com/v1/pages/${itemId}`, {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ properties: { 'Current Stock': { number: next } } }),
      }).catch(() => {});
      await pause(PAUSE);
      stockById[itemId] = next;

      saved.push({ name, qty, used, leftover: qty - used, unitCost, stock: next, costWritten });
    }

    return Response.json({
      ok: true,
      saved,
      createdItems,
      failed,
      spend: Math.round(spend * 100) / 100,
      charged: Math.round(charged * 100) / 100,
      toStock: Math.round((spend - charged) * 100) / 100,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
