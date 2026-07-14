// Server-side Notion client. This file must never be imported from a
// Client Component — it reads process.env.NOTION_TOKEN, which should never
// reach the browser. Next.js API routes (app/api/**/route.js) are the only
// place this gets called from.

const NOTION_VERSION = '2022-06-28';
const BASE = 'https://api.notion.com/v1';

function headers() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN is not set in environment variables.');
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function notionFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { ...options, headers: headers() });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.message || `Notion API error (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

// ---- property readers (Notion's page property shapes are verbose) --------
function text(prop) {
  if (!prop) return '';
  if (prop.type === 'title') return (prop.title || []).map(t => t.plain_text).join('');
  if (prop.type === 'rich_text') return (prop.rich_text || []).map(t => t.plain_text).join('');
  if (prop.type === 'email') return prop.email || '';
  if (prop.type === 'phone_number') return prop.phone_number || '';
  if (prop.type === 'url') return prop.url || '';
  return '';
}
function num(prop) { return prop?.number ?? null; }
function sel(prop) { return prop?.select?.name ?? ''; }
function multiSel(prop) { return (prop?.multi_select || []).map(o => o.name); }
function checkbox(prop) { return !!prop?.checkbox; }
function dateStart(prop) { return prop?.date?.start ?? ''; }
function formulaNum(prop) { return prop?.formula?.number ?? null; }

// ---- Sales Pipeline (Enquiries) -------------------------------------------
export async function listEnquiries() {
  const dbId = process.env.NOTION_DB_SALES;
  const data = await notionFetch(`/databases/${dbId}/query`, {
    method: 'POST',
    body: JSON.stringify({ sorts: [{ timestamp: 'created_time', direction: 'descending' }] }),
  });
  return data.results.map(pageToEnquiry);
}

function pageToEnquiry(page) {
  const p = page.properties;
  return {
    id: page.id,
    name: text(p['Name']),
    email: text(p['Email']),
    phone: p['Phone Number']?.number ?? '',
    eventDate: dateStart(p['Event Date']),
    venue: text(p['Venue']),
    guestCount: num(p['Guest Count']),
    eventType: sel(p['Event Type']),
    serviceType: multiSel(p['Service Type'])[0] || '',
    source: sel(p['Source']),
    referredBy: text(p['Referred By']),
    status: sel(p['Status']),
    followUpDate: dateStart(p['Follow Up Date']),
    internalNotes: text(p['Internal Notes']),
    quoteSent: num(p['Quote Sent']),
  };
}

export async function createEnquiry(data) {
  const dbId = process.env.NOTION_DB_SALES;
  const page = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: enquiryToProperties(data),
    }),
  });
  return pageToEnquiry(page);
}

export async function updateEnquiry(id, data) {
  const page = await notionFetch(`/pages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: enquiryToProperties(data) }),
  });
  return pageToEnquiry(page);
}

function enquiryToProperties(d) {
  const props = {};
  if (d.name !== undefined) props['Name'] = { title: [{ text: { content: d.name } }] };
  if (d.email !== undefined) props['Email'] = { rich_text: [{ text: { content: d.email || '' } }] };
  if (d.phone !== undefined && d.phone !== '') props['Phone Number'] = { number: Number(d.phone) || null };
  if (d.venue !== undefined) props['Venue'] = { rich_text: [{ text: { content: d.venue || '' } }] };
  if (d.guestCount !== undefined) props['Guest Count'] = { number: Number(d.guestCount) || null };
  if (d.eventType !== undefined) props['Event Type'] = { select: { name: d.eventType } };
  if (d.serviceType !== undefined) props['Service Type'] = { multi_select: [{ name: d.serviceType }] };
  if (d.source !== undefined) props['Source'] = { select: { name: d.source } };
  if (d.referredBy !== undefined) props['Referred By'] = { rich_text: [{ text: { content: d.referredBy || '' } }] };
  if (d.status !== undefined) props['Status'] = { select: { name: d.status } };
  if (d.internalNotes !== undefined) props['Internal Notes'] = { rich_text: [{ text: { content: d.internalNotes || '' } }] };
  if (d.eventDate) props['Event Date'] = { date: { start: d.eventDate } };
  if (d.followUpDate) props['Follow Up Date'] = { date: { start: d.followUpDate } };
  if (d.quoteSent !== undefined) props['Quote Sent'] = { number: Number(d.quoteSent) || 0 };
  return props;
}

// Matches a recipe ingredient line (e.g. "50ml Absolut Vodka") against the
// Inventory Items list, so the checklist can suggest which stock to pack.
// Deliberately conservative — a miss just means it's not suggested, not
// fabricated.
export function matchIngredientToStock(ingredientLine, stockItems) {
  const clean = ingredientLine.toLowerCase();
  return stockItems.find(s => clean.includes(s.name.toLowerCase())) || null;
}

// Builds a de-duplicated "suggested stock to pack" list from a set of
// resolved drinks (cocktails/mocktails with ingredient lines already
// looked up from the Drinks Library).
export function suggestStockForDrinks(drinks, stockItems) {
  const matched = new Map();
  drinks.forEach(d => {
    (d.ingredients || []).forEach(line => {
      const item = matchIngredientToStock(line, stockItems);
      if (item && !matched.has(item.id)) matched.set(item.id, item);
    });
  });
  return [...matched.values()];
}

// ---- Single booking lookup (for the checklist page) ------------------------
export async function getBookingById(id) {
  const page = await notionFetch(`/pages/${id}`);
  return pageToBooking(page);
}

// ---- ORPI Drinks Library ----------------------------------------------------
export async function listDrinks() {
  const dbId = process.env.NOTION_DB_DRINKS;
  const data = await notionFetch(`/databases/${dbId}/query`, { method: 'POST', body: JSON.stringify({}) });
  return data.results.map(pageToDrink);
}

function pageToDrink(page) {
  const p = page.properties;
  return {
    id: page.id,
    name: text(p['Drink Name']),
    drinkType: sel(p['Drink Type']),
    category: sel(p['Category']),
    garnish: text(p['Garnish']),
    glassware: sel(p['Glassware']),
    ice: sel(p['Ice']),
    method: sel(p['Method']),
    rim: text(p['Rim']),
    batchable: checkbox(p['Batchable?']),
    prepRequired: checkbox(p['Prep Required?']),
  };
}

// Ingredients and the written method live in the page body (not properties),
// under "## Ingredients" and "## Method" headings, so we read the block
// children and parse them out.
export async function getDrinkRecipe(pageId) {
  const data = await notionFetch(`/blocks/${pageId}/children?page_size=100`);
  const blocks = data.results || [];
  const ingredients = [];
  let methodText = '';
  let section = null;
  for (const block of blocks) {
    const t = block.type;
    if (t === 'heading_1' || t === 'heading_2' || t === 'heading_3') {
      const headingText = blockText(block, t).toLowerCase();
      if (headingText.includes('ingredient')) section = 'ingredients';
      else if (headingText.includes('method')) section = 'method';
      else section = null;
      continue;
    }
    if (section === 'ingredients' && t === 'bulleted_list_item') {
      ingredients.push(blockText(block, t));
    } else if (section === 'method' && t === 'paragraph') {
      const t2 = blockText(block, t);
      if (t2) methodText += (methodText ? ' ' : '') + t2;
    }
  }
  return { ingredients, methodText };
}

function blockText(block, type) {
  const rt = block[type]?.rich_text || [];
  return rt.map(r => r.plain_text).join('');
}

// Matches a free-text drink name (as typed into a booking's Cocktail Menu /
// Mocktail Menu field) against the Drinks Library by exact then partial
// case-insensitive match. Returns null if nothing reasonable matches (the
// checklist flags these as "not in library" rather than guessing).
export function matchDrink(name, drinks) {
  const clean = name.trim().toLowerCase();
  if (!clean || clean === 'tbc') return null;
  const exact = drinks.find(d => d.name.trim().toLowerCase() === clean);
  if (exact) return exact;
  const partial = drinks.find(d => d.name.toLowerCase().includes(clean) || clean.includes(d.name.toLowerCase()));
  return partial || null;
}

// Parses the "Recipe Overrides" text field on a booking into a map of
// { drinkName (lowercase) → { ingredients: string[], methodText?: string } }.
//
// Format is one drink per stanza. A stanza starts with the drink name on its
// own line ending with a colon, followed by ingredients (one per line) and
// an optional "Method: …" section.
//
//   Espresso Martini:
//   50ml Grey Goose
//   35ml Baileys (not Kahlúa)
//   Method: Shake hard with ice.
//   Passionfruit Martini:
//   40ml Absolut Vanilla
//   ...
//
// Stanzas are separated by any header line ending with a colon — blank
// lines between stanzas are optional and ignored. This is deliberate:
// Notion's rich_text storage sometimes collapses blank lines, so relying
// on them for separation was fragile. A ":" at the end of a line is the
// real separator.
//
// Deliberately forgiving — anything we can't parse we just skip, so a
// half-typed override never breaks the checklist.
export function parseRecipeOverrides(overridesText) {
  if (!overridesText) return {};
  const allLines = overridesText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const map = {};
  let currentName = null;
  let ingredients = [];
  let methodText = '';

  function commit() {
    if (currentName && (ingredients.length || methodText)) {
      map[currentName] = { ingredients, methodText };
    }
    currentName = null;
    ingredients = [];
    methodText = '';
  }

  for (const line of allLines) {
    const headerMatch = line.match(/^(.+?):\s*$/);
    if (headerMatch) {
      // Start of a new stanza — commit the previous one first.
      commit();
      currentName = headerMatch[1].trim().toLowerCase();
      continue;
    }
    if (!currentName) continue; // stray line before first header — skip
    const mMatch = line.match(/^method:\s*(.*)$/i);
    if (mMatch) methodText = mMatch[1].trim();
    else if (methodText) methodText += ' ' + line;
    else ingredients.push(line.replace(/^[•\-*]\s*/, ''));
  }
  commit();
  return map;
}

// Resolves a comma-separated menu string (e.g. "Pornstar Martini, TBC") into
// full drink details with recipes, for the checklist. If a recipe override
// exists for a drink name on this specific booking, it takes precedence over
// the Drinks Library recipe.
export async function resolveMenu(menuCsv, drinksLibrary, overridesText = '') {
  if (!menuCsv) return [];
  const overrides = parseRecipeOverrides(overridesText);
  const names = menuCsv.split(',').map(s => s.trim()).filter(Boolean);
  const resolved = await Promise.all(names.map(async name => {
    if (name.toLowerCase() === 'tbc') return { name, isTbc: true, found: false };
    const match = matchDrink(name, drinksLibrary);
    if (!match) return { name, found: false };
    const libraryRecipe = await getDrinkRecipe(match.id);
    const override = overrides[match.name.toLowerCase()] || overrides[name.toLowerCase()];
    if (override) {
      return {
        name: match.name,
        found: true,
        drink: match,
        ingredients: override.ingredients.length ? override.ingredients : libraryRecipe.ingredients,
        methodText: override.methodText || libraryRecipe.methodText,
        hasOverride: true,
      };
    }
    return { name: match.name, found: true, drink: match, ...libraryRecipe, hasOverride: false };
  }));
  return resolved;
}

// ---- Event Costing (per-booking cost lines) --------------------------------
export async function listBookingCosts(bookingId) {
  const dbId = process.env.NOTION_DB_COSTING;
  const data = await notionFetch(`/databases/${dbId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: '📕 Booking and Events Tracker', relation: { contains: bookingId } },
    }),
  });
  return data.results.map(pageToCost);
}

function pageToCost(page) {
  const p = page.properties;
  const invRel = p['🍺 Inventory Items']?.relation || [];
  return {
    id: page.id,
    name: text(p['Name']),
    costType: sel(p['Cost Type']),
    cost: num(p['Cost']),
    quantityUsed: num(p['Quantity Used']),
    lockedUnitCost: num(p['Locked Unit Cost']),
    finalCost: formulaNum(p['Final Cost']),
    notes: text(p['Notes']),
    inventoryItemId: invRel[0]?.id || null,
    isStockLinked: invRel.length > 0,
  };
}

// Creates a cost line for a booking. When linked to an inventory item, we
// snapshot that item's current average unit cost into "Locked Unit Cost" —
// this is deliberate: the Inventory Items "Average Unit Cost" is a live
// formula that drifts as new purchases come in at different prices, but a
// past event's cost should stay frozen at what it actually cost at the time.
export async function createBookingCost(bookingId, data) {
  const dbId = process.env.NOTION_DB_COSTING;
  const props = {
    'Name': { title: [{ text: { content: data.name } }] },
    '📕 Booking and Events Tracker': { relation: [{ id: bookingId }] },
  };
  if (data.costType) props['Cost Type'] = { select: { name: data.costType } };
  if (data.cost !== undefined) props['Cost'] = { number: Number(data.cost) || 0 };
  if (data.quantityUsed !== undefined) props['Quantity Used'] = { number: Number(data.quantityUsed) || 0 };
  if (data.lockedUnitCost !== undefined) props['Locked Unit Cost'] = { number: Number(data.lockedUnitCost) || 0 };
  if (data.notes) props['Notes'] = { rich_text: [{ text: { content: data.notes } }] };
  if (data.inventoryItemId) props['🍺 Inventory Items'] = { relation: [{ id: data.inventoryItemId }] };

  const page = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
  });
  return pageToCost(page);
}

export async function deleteBookingCost(costId) {
  await notionFetch(`/pages/${costId}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived: true }),
  });
  return { id: costId };
}

// ---- Inventory Items (Stock tracker + Stock take) -------------------------
export async function listInventoryItems() {
  const dbId = process.env.NOTION_DB_INVENTORY;
  const data = await notionFetch(`/databases/${dbId}/query`, {
    method: 'POST',
    body: JSON.stringify({ sorts: [{ property: 'Item Name', direction: 'ascending' }] }),
  });
  return data.results.map(pageToInventoryItem);
}

function pageToInventoryItem(page) {
  const p = page.properties;
  return {
    id: page.id,
    name: text(p['Item Name']),
    category: sel(p['Catagory']),
    size: text(p['Size']),
    unit: sel(p['Unit']),
    currentStock: num(p['Current Stock']),
    parLevel: num(p['Par Level']),
    averageUnitCost: formulaNum(p['Average Unit Cost']),
  };
}

export async function updateInventoryStock(id, currentStock) {
  const page = await notionFetch(`/pages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: { 'Current Stock': { number: currentStock } } }),
  });
  return pageToInventoryItem(page);
}

export async function createInventoryItem(data) {
  const dbId = process.env.NOTION_DB_INVENTORY;
  const props = {
    'Item Name': { title: [{ text: { content: data.name } }] },
  };
  if (data.category) props['Catagory'] = { select: { name: data.category } };
  if (data.size) props['Size'] = { rich_text: [{ text: { content: data.size } }] };
  if (data.unit) props['Unit'] = { select: { name: data.unit } };
  if (data.currentStock !== undefined) props['Current Stock'] = { number: Number(data.currentStock) || 0 };
  if (data.parLevel !== undefined) props['Par Level'] = { number: Number(data.parLevel) || 0 };
  const page = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
  });
  return pageToInventoryItem(page);
}

// ---- Inventory Purchases ----------------------------------------------------
export async function listPurchases() {
  const dbId = process.env.NOTION_DB_PURCHASES;
  const data = await notionFetch(`/databases/${dbId}/query`, {
    method: 'POST',
    body: JSON.stringify({ sorts: [{ property: 'Date Bought', direction: 'descending' }] }),
  });
  return data.results.map(pageToPurchase);
}

function pageToPurchase(page) {
  const p = page.properties;
  return {
    id: page.id,
    line: text(p['Purchase Line']),
    dateBought: dateStart(p['Date Bought']),
    supplier: sel(p['Supplier']),
    quantityBought: num(p['Quantity Bought']),
    unitCost: num(p['Unit Cost']),
    totalCost: formulaNum(p['Total Cost']),
    ownedBy: sel(p['Owned By?']),
  };
}

// Creates a purchase record linked to an inventory item, and bumps that
// item's Current Stock by the purchased quantity in the same operation.
export async function createPurchase({ inventoryItemId, itemName, quantity, unitCost, supplier, dateBought, ownedBy }) {
  const dbId = process.env.NOTION_DB_PURCHASES;
  const props = {
    'Purchase Line': { title: [{ text: { content: `${itemName} — ${dateBought || 'undated'}` } }] },
    'Quantity Bought': { number: Number(quantity) || 0 },
    'Unit Cost': { number: Number(unitCost) || 0 },
  };
  if (supplier) props['Supplier'] = { select: { name: supplier } };
  if (ownedBy) props['Owned By?'] = { select: { name: ownedBy } };
  if (dateBought) props['Date Bought'] = { date: { start: dateBought } };
  if (inventoryItemId) props['🍺 Inventory Items'] = { relation: [{ id: inventoryItemId }] };

  const page = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
  });

  // Bump stock on the linked item
  if (inventoryItemId) {
    const itemPage = await notionFetch(`/pages/${inventoryItemId}`);
    const currentStock = num(itemPage.properties['Current Stock']) || 0;
    await updateInventoryStock(inventoryItemId, currentStock + (Number(quantity) || 0));
  }

  return pageToPurchase(page);
}

// ---- Quote saving (writes back to the matching Sales Pipeline enquiry) ----
export async function saveQuoteResult({ enquiryId, name, amount }) {
  if (enquiryId) {
    return updateEnquiry(enquiryId, { status: 'Quote Sent', quoteSent: amount });
  }
  // No linked enquiry — try to find one by exact name match (case-insensitive)
  // before creating a new one, so re-saving a quote for the same client
  // doesn't create duplicate Sales Pipeline rows.
  const all = await listEnquiries();
  const match = all.find(e => e.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (match) return updateEnquiry(match.id, { status: 'Quote Sent', quoteSent: amount });
  return createEnquiry({ name, status: 'Quote Sent', quoteSent: amount });
}

// ---- Booking & Quotes Tracker (Confirmed Bookings) ------------------------
export async function listConfirmedBookings() {
  const dbId = process.env.NOTION_DB_BOOKINGS;
  const data = await notionFetch(`/databases/${dbId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: 'Status', select: { equals: 'Confirmed Booking' } },
      sorts: [{ property: 'Event Date', direction: 'ascending' }],
    }),
  });
  return data.results.map(pageToBooking);
}

// Paginated fetch of every booking regardless of status — used by the KPI
// dashboard, which needs Completed events to compute historical CPH.
export async function listAllBookings() {
  const dbId = process.env.NOTION_DB_BOOKINGS;
  const results = [];
  let cursor = undefined;
  while (true) {
    const data = await notionFetch(`/databases/${dbId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        sorts: [{ property: 'Event Date', direction: 'descending' }],
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    results.push(...data.results.map(pageToBooking));
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return results;
}

// Sum of Cost linked to an event, split by whether the cost line is
// stock-linked (reconciled alcohol/mixers) or manual (staff/logistics/etc).
// Used by the KPI dashboard to compute alcohol CPH separately from ops CPH.
export async function listAllCosts() {
  const dbId = process.env.NOTION_DB_COSTING;
  const results = [];
  let cursor = undefined;
  while (true) {
    const data = await notionFetch(`/databases/${dbId}/query`, {
      method: 'POST',
      body: JSON.stringify({ ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    for (const page of data.results) {
      const cost = pageToCost(page);
      // The booking relation isn't in pageToCost's return; grab it directly.
      const bookingRel = page.properties['📕 Booking and Events Tracker']?.relation || [];
      cost.bookingId = bookingRel[0]?.id || null;
      results.push(cost);
    }
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return results;
}

function pageToBooking(page) {
  const p = page.properties;
  return {
    id: page.id,
    name: text(p['Name']),
    clientName: text(p['Client Name']),
    clientEmail: text(p['Client Email']),
    clientPhone: text(p['Client Phone']),
    eventDate: dateStart(p['Event Date']),
    venue: text(p['Venue']),
    guestCount: num(p['Number of Guests']),
    typeOfService: multiSel(p['Type of Service'])[0] || '',
    alcoholProvidedBy: sel(p['Alcohol Provided By?']),
    quoteAmount: num(p['Quote Amount']),
    finalQuoteAmount: formulaNum(p['Final Quote Amount']),
    depositReceived: checkbox(p['Deposit Received']),
    balanceReceived: checkbox(p['Balance Received']),
    cocktailsConfirmed: checkbox(p['Cocktails Confirmed']),
    mocktailsConfirmed: checkbox(p['Mocktails Confirmed']),
    staffConfirmed: checkbox(p['Staff Confirmed']),
    eventBriefSent: checkbox(p['Event Brief Sent']),
    venueAccessConfirmed: checkbox(p['Venue Access Confirmed']),
    drinksTastingDate: dateStart(p['Drinks Tasting Date']),
    cocktailMenu: text(p['Cocktail Menu']),
    mocktailMenu: text(p['Mocktail Menu']),
    cocktailRecipeOverrides: text(p['Cocktail Recipe Overrides']),
    mocktailRecipeOverrides: text(p['Mocktail Recipe Overrides']),
    beerSelection: text(p['Beer Selection']),
    spiritsSelection: text(p['Spirits Selection']),
    softDrinksSelection: text(p['Soft Drinks Selection']),
    tastingNotes: text(p['Tasting Notes']),
    internalNotes: text(p['Internal Notes']),
    referredBy: text(p['Referred By']),
    status: sel(p['Status']),
    eventType: sel(p['Event Type']),
    marketingEvent: checkbox(p['Marketing Event?']),
  };
}

export async function updateBooking(id, data) {
  const page = await notionFetch(`/pages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: bookingToProperties(data) }),
  });
  return pageToBooking(page);
}

export async function createBookingFromEnquiry(enq) {
  const dbId = process.env.NOTION_DB_BOOKINGS;
  const page = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: bookingToProperties({
        name: enq.name,
        clientName: enq.name,
        clientEmail: enq.email,
        clientPhone: String(enq.phone || ''),
        eventDate: enq.eventDate,
        venue: enq.venue,
        guestCount: enq.guestCount,
        typeOfService: enq.serviceType,
        status: 'Confirmed Booking',
        referredBy: enq.referredBy,
        eventType: enq.eventType,
        internalNotes: `Created from enquiry. ${enq.internalNotes || ''}`.trim(),
      }),
    }),
  });
  return pageToBooking(page);
}

function bookingToProperties(d) {
  const props = {};
  if (d.name !== undefined) props['Name'] = { title: [{ text: { content: d.name } }] };
  if (d.clientName !== undefined) props['Client Name'] = { rich_text: [{ text: { content: d.clientName || '' } }] };
  if (d.clientEmail !== undefined) props['Client Email'] = { email: d.clientEmail || null };
  if (d.clientPhone !== undefined) props['Client Phone'] = { phone_number: d.clientPhone || null };
  if (d.venue !== undefined) props['Venue'] = { rich_text: [{ text: { content: d.venue || '' } }] };
  if (d.guestCount !== undefined) props['Number of Guests'] = { number: Number(d.guestCount) || null };
  if (d.typeOfService !== undefined) props['Type of Service'] = { multi_select: [{ name: d.typeOfService }] };
  if (d.status !== undefined) props['Status'] = { select: { name: d.status } };
  if (d.eventType !== undefined && d.eventType) props['Event Type'] = { select: { name: d.eventType } };
  if (d.marketingEvent !== undefined) props['Marketing Event?'] = { checkbox: !!d.marketingEvent };
  if (d.referredBy !== undefined) props['Referred By'] = { rich_text: [{ text: { content: d.referredBy || '' } }] };
  if (d.internalNotes !== undefined) props['Internal Notes'] = { rich_text: [{ text: { content: d.internalNotes || '' } }] };
  if (d.tastingNotes !== undefined) props['Tasting Notes'] = { rich_text: [{ text: { content: d.tastingNotes || '' } }] };
  if (d.cocktailMenu !== undefined) props['Cocktail Menu'] = { rich_text: [{ text: { content: d.cocktailMenu || '' } }] };
  if (d.mocktailMenu !== undefined) props['Mocktail Menu'] = { rich_text: [{ text: { content: d.mocktailMenu || '' } }] };
  if (d.cocktailRecipeOverrides !== undefined) props['Cocktail Recipe Overrides'] = { rich_text: [{ text: { content: d.cocktailRecipeOverrides || '' } }] };
  if (d.mocktailRecipeOverrides !== undefined) props['Mocktail Recipe Overrides'] = { rich_text: [{ text: { content: d.mocktailRecipeOverrides || '' } }] };
  if (d.beerSelection !== undefined) props['Beer Selection'] = { rich_text: [{ text: { content: d.beerSelection || '' } }] };
  if (d.spiritsSelection !== undefined) props['Spirits Selection'] = { rich_text: [{ text: { content: d.spiritsSelection || '' } }] };
  if (d.softDrinksSelection !== undefined) props['Soft Drinks Selection'] = { rich_text: [{ text: { content: d.softDrinksSelection || '' } }] };
  if (d.eventDate) props['Event Date'] = { date: { start: d.eventDate } };
  if (d.drinksTastingDate) props['Drinks Tasting Date'] = { date: { start: d.drinksTastingDate } };
  const boolFields = {
    depositReceived: 'Deposit Received', balanceReceived: 'Balance Received',
    cocktailsConfirmed: 'Cocktails Confirmed', mocktailsConfirmed: 'Mocktails Confirmed',
    staffConfirmed: 'Staff Confirmed', eventBriefSent: 'Event Brief Sent',
    venueAccessConfirmed: 'Venue Access Confirmed',
  };
  Object.entries(boolFields).forEach(([key, notionName]) => {
    if (d[key] !== undefined) props[notionName] = { checkbox: !!d[key] };
  });
  return props;
}
