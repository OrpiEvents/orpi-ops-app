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
