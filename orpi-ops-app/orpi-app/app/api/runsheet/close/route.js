// app/api/runsheet/close/route.js
//
// Closing the loop. The run sheet knows what went out and what came back;
// until now that only lived in Supabase. This writes it where it matters:
//
//   1. An Event Costing row per item used, linked to the booking and the
//      inventory item, with today's unit cost locked in
//   2. Current Stock decremented by what was actually used
//   3. Outbound Logged At / Return Logged At stamped on the booking, plus a
//      readable summary, so the booking panel knows the event is done
//
// Without this, every event quietly adds to the pile of guessed costs.

import { latestUnitCosts, unitCostFor } from '@/lib/pricing';
import { costTypeFor } from '@/lib/taxonomy';

const TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const DB_INVENTORY = process.env.NOTION_DB_INVENTORY || '2e16ca9d054980cf978edf55d1d40efb';
const DB_COSTING = process.env.NOTION_DB_COSTING || '2e36ca9d054980b2b232d8164def4997';
const DB_PURCHASES = process.env.NOTION_DB_PURCHASES || '2e16ca9d054980879bc5ef22eb00f97d';

const headers = () => ({
  Authorization: `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
});

// Notion rate-limits around three requests a second. A 25-line event is ~50
// writes, so pace them rather than get half an event in and a 429.
const pause = ms => new Promise(r => setTimeout(r, ms));

async function queryAll(dbId) {
  const rows = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Notion ${res.status} reading inventory`);
    const json = await res.json();
    rows.push(...json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return rows;
}

const title = p => p?.title?.map(t => t.plain_text).join('').trim() || '';
const num = p => (typeof p?.number === 'number' ? p.number : null);

// Which inventory items already have a cost line against this booking. The
// Purchases screen can cost a bottle the moment it's bought — if that bottle is
// also on the run sheet's Out/In, closing would charge the event twice. Notion
// won't stop it and the total would just quietly be wrong, so check first.
async function alreadyCostedItems(bookingId) {
  const costed = new Set();
  let cursor;
  try {
    do {
      const res = await fetch(`https://api.notion.com/v1/databases/${DB_COSTING}/query`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          page_size: 100, start_cursor: cursor,
          filter: { property: '\u{1F4D5} Booking and Events Tracker', relation: { contains: bookingId } },
        }),
        cache: 'no-store',
      });
      if (!res.ok) return costed; // Can't check — fall through and write anyway.
      const json = await res.json();
      for (const page of json.results) {
        for (const rel of page.properties?.['\u{1F37A} Inventory Items']?.relation || []) {
          costed.add(rel.id);
        }
      }
      cursor = json.has_more ? json.next_cursor : undefined;
    } while (cursor);
  } catch { /* best effort */ }
  return costed;
}

async function getBooking(id) {
  const res = await fetch(`https://api.notion.com/v1/pages/${id}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Notion ${res.status} reading booking`);
  return res.json();
}

export async function POST(request) {
  if (!TOKEN) return Response.json({ error: 'NOTION_TOKEN not set' }, { status: 500 });

  try {
    const { bookingId, lines = [], extraCosts = [], force = false, summary = '' } = await request.json();
    if (!bookingId) return Response.json({ error: 'No booking linked. Pick one on the Setup tab first.' }, { status: 400 });

    const booking = await getBooking(bookingId);
    const alreadyClosed = !!booking.properties?.['Return Logged At']?.date?.start;
    if (alreadyClosed && !force) {
      return Response.json({
        error: 'This event was already closed. Re-closing would double the costs.',
        alreadyClosed: true,
      }, { status: 409 });
    }

    // Name -> page, so run sheet lines can find their inventory row. The price
    // locked here is the latest purchase price, matching what the quote was
    // built on — so cost and quote are measured the same way.
    const priceIndex = latestUnitCosts(await queryAll(DB_PURCHASES));
    const invIndex = {};
    for (const page of await queryAll(DB_INVENTORY)) {
      const n = title(page.properties['Item Name']);
      if (!n) continue;
      invIndex[n.toLowerCase()] = {
        id: page.id,
        name: n,
        cat: page.properties['Catagory']?.select?.name || 'Other',
        unitCost: unitCostFor(page.id.replace(/-/g, ''), priceIndex, page),
        stock: num(page.properties['Current Stock']) ?? 0,
      };
    }

    const preCosted = await alreadyCostedItems(bookingId);

    const written = [];
    const skipped = [];
    const duplicates = [];
    let costed = 0;

    for (const line of lines) {
      const used = Math.max(0, (Number(line.out) || 0) - (Number(line.in) || 0));
      if (!used) continue;

      const item = invIndex[String(line.name || '').trim().toLowerCase()];
      if (!item) { skipped.push(line.name); continue; }
      // Already charged to this event — almost always a bottle bought on the day
      // and logged on the Purchases screen. Leave it alone.
      if (preCosted.has(item.id)) { duplicates.push(item.name); continue; }

      // The costing row. Cost is left empty on purpose — Final Cost is a
      // formula that multiplies quantity by the locked unit cost.
      const res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          parent: { database_id: DB_COSTING },
          properties: {
            Name: { title: [{ text: { content: item.name } }] },
            'Cost Type': { select: { name: costTypeFor(item.cat) } },
            'Quantity Used': { number: used },
            'Locked Unit Cost': { number: item.unitCost },
            '\u{1F4D5} Booking and Events Tracker': { relation: [{ id: bookingId }] },
            '\u{1F37A} Inventory Items': { relation: [{ id: item.id }] },
          },
        }),
      });

      if (!res.ok) { skipped.push(item.name); await pause(350); continue; }
      written.push(`${used} \u00d7 ${item.name}`);
      costed += used * item.unitCost;
      await pause(350);

      // Stock comes down by what was used, not what was loaded.
      await fetch(`https://api.notion.com/v1/pages/${item.id}`, {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ properties: { 'Current Stock': { number: Math.max(0, item.stock - used) } } }),
      }).catch(() => {});
      await pause(350);
    }

    // Everything that isn't stock: glassware hire, staff, prints, travel. These
    // carry a flat Cost rather than quantity x unit cost, because there's no
    // inventory item behind them — just an invoice or a wage.
    for (const c of extraCosts) {
      const amount = Number(c.amount) || 0;
      if (amount <= 0) continue;
      const res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          parent: { database_id: DB_COSTING },
          properties: {
            Name: { title: [{ text: { content: c.note?.trim() || c.type } }] },
            'Cost Type': { select: { name: c.type } },
            Cost: { number: amount },
            '\u{1F4D5} Booking and Events Tracker': { relation: [{ id: bookingId }] },
          },
        }),
      });
      if (res.ok) { written.push(`${c.type} \u00a3${amount.toFixed(2)}`); costed += amount; }
      else if (c.type === 'Garnish') {
        // Garnish may not exist as a Cost Type option yet. Rather than lose the
        // figure, file it under the catch-all and carry on.
        const retry = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({
            parent: { database_id: DB_COSTING },
            properties: {
              Name: { title: [{ text: { content: `Garnish \u2014 ${c.note || ''}`.trim() } }] },
              'Cost Type': { select: { name: 'Other/Misc' } },
              Cost: { number: amount },
              '\u{1F4D5} Booking and Events Tracker': { relation: [{ id: bookingId }] },
            },
          }),
        });
        if (retry.ok) { written.push(`Garnish \u00a3${amount.toFixed(2)} (as Other/Misc)`); costed += amount; }
        else skipped.push(c.type);
        await pause(350);
      }
      else skipped.push(c.type);
      await pause(350);
    }

    // Stamp the booking so the panel knows where this event is.
    const today = new Date().toISOString().split('T')[0];
    const bookingProps = {
      'Return Logged At': { date: { start: today } },
      'Outbound Log': {
        rich_text: [{ text: { content: (summary || written.join('\n')).slice(0, 1900) } }],
      },
    };
    if (!booking.properties?.['Outbound Logged At']?.date?.start) {
      bookingProps['Outbound Logged At'] = { date: { start: today } };
    }
    await fetch(`https://api.notion.com/v1/pages/${bookingId}`, {
      method: 'PATCH', headers: headers(), body: JSON.stringify({ properties: bookingProps }),
    });

    return Response.json({
      ok: true,
      costLines: written.length,
      costTotal: Math.round(costed * 100) / 100,
      skipped,
      duplicates,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
