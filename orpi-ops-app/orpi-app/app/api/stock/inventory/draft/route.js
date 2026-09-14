// app/api/inventory/draft/route.js
//
// Creates placeholder Inventory Items for products typed into a quote that
// stock has never seen. Deliberately incomplete: name and category only, with
// "Needs setup" ticked. Size, volume and price are filled in by whoever buys
// the bottle — they're the only one who knows if it's the 70cl or the 1L.
//
// Guards against the thing that actually causes duplicates: it re-checks the
// live database before creating, so two people quoting the same new brand in
// the same week don't end up with two rows.

const DB_ID = '2e16ca9d-0549-80cf-978e-df55d1d40efb'; // Inventory Items
const TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const HEADERS = () => ({
  Authorization: `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
});

const VALID_CATS = ['Spirit', 'Beer', 'Wine', 'Prosecco', 'Mixer', 'Ice', 'Garnish', 'Other', 'Champagne', 'Liqueur', 'Soft Drink'];

// Same normalisation the quote builder uses, so "Absolut" and "Absolut Vodka
// 1L" are recognised as one product on both sides.
function normName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019'`.,()\-]/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*(cl|ml|l|ltr|litre|litres)\b/g, ' ')
    .replace(/\b(vodka|gin|rum|whisky|whiskey|bourbon|tequila|cognac|brandy|liqueur|beer|lager|cider|wine|prosecco|champagne|bottles?|cans?|premium|original|dry|the|and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function existingNames() {
  const names = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: 'POST',
      headers: HEADERS(),
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Notion ${res.status}`);
    const json = await res.json();
    for (const page of json.results) {
      const t = page.properties?.['Item Name']?.title;
      if (t?.length) names.push(t.map(x => x.plain_text).join(''));
    }
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return names;
}

export async function POST(request) {
  if (!TOKEN) return Response.json({ error: 'NOTION_TOKEN not set' }, { status: 500 });

  try {
    const { items } = await request.json();
    if (!Array.isArray(items) || !items.length) return Response.json({ created: 0, skipped: 0 });

    const taken = new Set((await existingNames()).map(normName));
    const created = [];
    const skipped = [];

    for (const item of items) {
      const name = String(item?.name || '').trim();
      if (!name || name.length < 2) continue;

      const key = normName(name);
      // Already there, or already queued earlier in this same batch.
      if (!key || taken.has(key)) { skipped.push(name); continue; }
      taken.add(key);

      const cat = VALID_CATS.includes(item?.cat) ? item.cat : 'Other';
      const res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: HEADERS(),
        body: JSON.stringify({
          parent: { database_id: DB_ID },
          properties: {
            'Item Name': { title: [{ text: { content: name } }] },
            Catagory: { select: { name: cat } },
            'Needs setup': { checkbox: true },
          },
        }),
      });
      if (res.ok) created.push(name);
      else skipped.push(name);
    }

    return Response.json({ created: created.length, skipped: skipped.length, names: created });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
