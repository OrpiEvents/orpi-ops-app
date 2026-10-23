// lib/calendarIcs.js
//
// Turns enquiries and bookings into the team calendar's .ics text. Pure: no
// Notion, no database, so it can be tested on its own. The feed route and the
// token live in lib/calendarFeed.js.

// ── Building the .ics ──────────────────────────────────────────────────────
// Holds for enquiries still in play; Won ones are covered by their booking.
const HOLD_STATUSES = ['New', 'Quote Sent'];
const BOOKED_STATUSES = ['Confirmed Booking', 'Completed'];
const HOLD_STATUS_LABEL = { New: 'New enquiry', 'Quote Sent': 'Quote sent' };

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const stamp = d => `${ymd(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

// "2027-08-09" or "2027-08-09T18:00:00.000+01:00" → a Date at UTC midnight
// on that calendar day, or null.
function dayOf(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// RFC 5545 text: escape \ ; , and newlines.
const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines longer than 75 bytes are folded onto continuation lines that start
// with a space. Counted in UTF-8 bytes, never splitting a character.
function fold(line) {
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    const limit = out.length ? 74 : 75;   // continuation lines lose a byte to the space
    if (bytes + b > limit) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.map((l, i) => (i ? ' ' + l : l)).join('\r\n');
}

const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function vevent({ uid, day, summary, location, description, url, hold, now }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${ymd(day)}`,
    `DTEND;VALUE=DATE:${ymd(addDays(day, 1))}`,
    `SUMMARY:${esc(summary)}`,
    location ? `LOCATION:${esc(location)}` : null,
    description ? `DESCRIPTION:${esc(description)}` : null,
    url ? `URL:${url}` : null,
    `STATUS:${hold ? 'TENTATIVE' : 'CONFIRMED'}`,
    // A hold doesn't make the day look busy; a booking does.
    `TRANSP:${hold ? 'TRANSPARENT' : 'OPAQUE'}`,
    'END:VEVENT',
  ];
  return lines.filter(Boolean).map(fold).join('\r\n');
}

/**
 * The whole feed as .ics text. Only what the team needs on a calendar:
 * names, dates, venues, guest numbers, the kind of event. No contact
 * details, no prices.
 */
export function buildIcs({ enquiries = [], bookings = [], origin = '', now = new Date() }) {
  const today = dayOf(now.toISOString());
  const holdFrom = addDays(today, -14);      // a hold that's just passed is still worth seeing
  const bookedFrom = addDays(today, -365);   // a year of history for "what did we do last year"

  const booked = [];
  const bookedKeys = new Set();
  for (const b of bookings) {
    if (!BOOKED_STATUSES.includes(b.status)) continue;
    const day = dayOf(b.eventDate);
    if (!day || day < bookedFrom) continue;
    const name = (b.name || b.clientName || 'Booking').trim();
    bookedKeys.add(`${ymd(day)}|${norm(name)}`);
    if (b.clientName) bookedKeys.add(`${ymd(day)}|${norm(b.clientName)}`);
    const facts = [b.status === 'Completed' ? 'Done' : 'Confirmed booking', b.eventType, b.guestCount ? plural(b.guestCount, 'guest') : '', b.typeOfService].filter(Boolean).join(' · ');
    booked.push(vevent({
      uid: `booking-${b.id}@orpi.events`,
      day,
      summary: `Booked: ${name}`,
      location: b.venue,
      description: [facts, b.venue ? `Venue: ${b.venue}` : '', origin ? `${origin}/bookings?open=${b.id}` : ''].filter(Boolean).join('\n'),
      url: origin ? `${origin}/bookings?open=${b.id}` : '',
      hold: false,
      now,
    }));
  }

  const holds = [];
  for (const e of enquiries) {
    if (!HOLD_STATUSES.includes(e.status)) continue;
    const day = dayOf(e.eventDate);
    if (!day || day < holdFrom) continue;
    const name = (e.name || 'Enquiry').trim();
    // Already booked under the same name on the same day: the booking says it all.
    if (bookedKeys.has(`${ymd(day)}|${norm(name)}`)) continue;
    const facts = [HOLD_STATUS_LABEL[e.status] || e.status, e.eventType, e.guestCount ? plural(e.guestCount, 'guest') : '', e.serviceType].filter(Boolean).join(' · ');
    holds.push(vevent({
      uid: `enquiry-${e.id}@orpi.events`,
      day,
      summary: `Hold: ${name}`,
      location: e.venue,
      description: [facts, e.venue ? `Venue: ${e.venue}` : '', 'Not confirmed: no deposit yet.', e.url || ''].filter(Boolean).join('\n'),
      url: e.url || '',
      hold: true,
      now,
    }));
  }

  const head = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ORPI Events//Ops app//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:ORPI holds & bookings',
    'X-WR-CALDESC:Holds for dated enquiries and every confirmed booking\\, from the ORPI ops app.',
    'X-WR-TIMEZONE:Europe/London',
    'X-APPLE-CALENDAR-COLOR:#B48A3C',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  return [...head.map(fold), ...booked, ...holds, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
