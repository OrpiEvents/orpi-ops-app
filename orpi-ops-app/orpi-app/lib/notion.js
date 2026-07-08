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

// Resolves a comma-separated menu string (e.g. "Pornstar Martini, TBC") into
// full drink details with recipes, for the checklist. Skips "TBC"/empty
// entries and flags any name that has no match in the library.
export async function resolveMenu(menuCsv, drinksLibrary) {
  if (!menuCsv) return [];
  const names = menuCsv.split(',').map(s => s.trim()).filter(Boolean);
  const resolved = await Promise.all(names.map(async name => {
    if (name.toLowerCase() === 'tbc') return { name, isTbc: true, found: false };
    const match = matchDrink(name, drinksLibrary);
    if (!match) return { name, found: false };
    const recipe = await getDrinkRecipe(match.id);
    return { name: match.name, found: true, drink: match, ...recipe };
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
  return {
    id: page.id,
    name: text(p['Name']),
    costType: sel(p['Cost Type']),
    cost: num(p['Cost']),
    quantityUsed: num(p['Quantity Used']),
    lockedUnitCost: num(p['Locked Unit Cost']),
    finalCost: formulaNum(p['Final Cost']),
    notes: text(p['Notes']),
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
