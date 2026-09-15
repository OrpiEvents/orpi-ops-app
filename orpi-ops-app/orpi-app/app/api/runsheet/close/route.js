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

const TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const DB_INVENTORY = process.env.NOTION_DB_INVENTORY || '2e16ca9d054980cf978edf55d1d40efb';
const DB_COSTING = process.env.NOTION_DB_COSTING || '2e36ca9d054980b2b232d8164def4997';

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
// Average Unit Cost is a formula, so it arrives under formula.number.
const formulaNum = p => (typeof p?.formula?.number === 'number' ? p.formula.number : null);

// Inventory categories don't line up with cost types one-for-one.
function costTypeFor(cat) {
  if (['Spirit', 'Liqueur', 'Wine', 'Prosecco', 'Champagne', 'Beer'].includes(cat)) return 'Alcohol';
  if (['Mixer', 'Soft Drink'].includes(cat)) return 'Mixers';
  if (cat === 'Ice') return 'Ice';
  // Garnish has no Cost Type of its own yet, so it lands in the catch-all.
  return 'Other/Misc';
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

    // Name -> page, so run sheet lines can find their inventory row.
    const invIndex = {};
    for (const page of await queryAll(DB_INVENTORY)) {
      const n = title(page.properties['Item Name']);
      if (!n) continue;
      invIndex[n.toLowerCase()] = {
        id: page.id,
        name: n,
        cat: page.properties['Catagory']?.select?.name || 'Other',
        unitCost: formulaNum(page.properties['Average Unit Cost']) ?? 0,
        stock: num(page.properties['Current Stock']) ?? 0,
      };
    }

    const written = [];
    const skipped = [];
    let costed = 0;

    for (const line of lines) {
      const used = Math.max(0, (Number(line.out) || 0) - (Number(line.in) || 0));
      if (!used) continue;

      const item = invIndex[String(line.name || '').trim().toLowerCase()];
      if (!item) { skipped.push(line.name); continue; }

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
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
