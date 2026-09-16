// app/api/cron/enquiries/route.js
//
// Replaces the Make.com scenario. Runs on a schedule, finds enquiries that came
// in through the form and haven't been acknowledged, emails them, and fills in
// the two fields that otherwise never get set:
//
//   Follow Up Date — two days out, so nothing can go quiet unnoticed
//   Source         — Instagram, because that's the only live channel
//
// Deliberately idempotent. "Acknowledged At" is the flag, so a double-run or a
// retry can't email anyone twice. If the email service is down the flag stays
// blank and the next run picks it up.

const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const DB_SALES = process.env.NOTION_DB_SALES || '3216ca9d054980dbb650eac5a7ec55cd';
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.ENQUIRY_FROM || 'ORPI Events <hello@orpi.events>';
const ALERT_TO = process.env.ENQUIRY_ALERT_TO || 'hello@orpi.events';
const CRON_SECRET = process.env.CRON_SECRET;

const notionHeaders = () => ({
  Authorization: `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
});

const text = p => p?.rich_text?.map(t => t.plain_text).join('').trim() || '';
const title = p => p?.title?.map(t => t.plain_text).join('').trim() || '';
const dateOf = p => p?.date?.start || null;

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function prettyDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso + 'T12:00:00')
      .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      .replace(',', '');
  } catch { return iso; }
}

// Warm, specific, and honest about timing. It quotes their own details back so
// it reads as a person having looked, not an autoresponder.
function buildEmail({ name, eventType, eventDate, venue, guests }) {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  const detail = [
    eventDate && `\u{1F4C5} ${prettyDate(eventDate)}`,
    venue && `\u{1F4CD} ${venue}`,
    guests && `\u{1F465} ${guests} guests`,
  ].filter(Boolean);

  const lines = [
    `Hi ${first},`,
    '',
    `Thanks for getting in touch about your ${(eventType || 'event').toLowerCase()} — lovely to hear from you.`,
    '',
    ...(detail.length ? ['Here\u2019s what we\u2019ve got so far:', '', ...detail, ''] : []),
    'We\u2019ll put a quote together and be in touch shortly. If anything above looks wrong, just reply and let us know.',
    '',
    'A couple of things worth knowing while you wait:',
    '',
    '\u2022 Every quote is built around your event rather than a fixed package — guest numbers, how long you want the bar open, and whether you\u2019d like bespoke cocktails all change it',
    '\u2022 Dates go quickly in peak season, so if yours is set it\u2019s worth telling us early',
    '',
    'Speak soon,',
    '',
    'ORPI Events',
    'hello@orpi.events',
  ];
  return lines.join('\n');
}

// The internal heads-up. Deliberately front-loads the contact details and
// whether the client got an acknowledgement, because an enquiry with no email
// is the one that needs a human within the hour.
function buildAlert({ name, eventType, eventDate, venue, guests, email, phone, acknowledged, url }) {
  return [
    `${name || 'Unnamed enquiry'}`,
    '',
    eventType ? `Event: ${eventType}` : null,
    eventDate ? `Date: ${prettyDate(eventDate)}` : 'Date: not given',
    venue ? `Venue: ${venue}` : 'Venue: not given',
    guests ? `Guests: ${guests}` : 'Guests: not given',
    '',
    `Email: ${email || '\u2014 none given'}`,
    `Phone: ${phone || '\u2014 none given'}`,
    '',
    acknowledged
      ? 'Acknowledgement sent automatically.'
      : email
        ? 'Acknowledgement FAILED \u2014 reply manually.'
        : 'No email address, so nothing was sent. Reply on Instagram.',
    '',
    'Follow-up set for two days from now.',
    '',
    url,
  ].filter(x => x !== null).join('\n');
}

async function queryNew() {
  const rows = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${DB_SALES}/query`, {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
        filter: { property: 'Acknowledged At', date: { is_empty: true } },
      }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Notion ${res.status} reading Sales Pipeline`);
    const json = await res.json();
    rows.push(...json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return rows;
}

async function sendEmail(to, subject, body) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, text: body, reply_to: 'hello@orpi.events' }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

export async function GET(request) {
  // Vercel cron sends this header; without the check anyone could trigger a
  // send by hitting the URL.
  if (CRON_SECRET && request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 });
  }
  if (!NOTION_TOKEN) return Response.json({ error: 'NOTION_TOKEN not set' }, { status: 500 });

  const sent = [];
  const tidied = [];
  const failed = [];

  try {
    for (const page of await queryNew()) {
      const p = page.properties;
      const status = p['Status']?.select?.name || '';
      // Only brand new enquiries. Anything already being worked has had a human
      // touch it, and an automatic "thanks for getting in touch" would be odd.
      if (status && status !== 'New') continue;

      const name = title(p['Name']);
      const email = text(p['Email']);
      const patch = {};
      // No follow-up date means we've never touched this row, so it's the one
      // moment to alert on. Keeps it to exactly one message per enquiry.
      const firstSeen = !dateOf(p['Follow Up Date']);

      // These two get filled whether or not there's an email to send to — a DM
      // enquiry with no address still needs chasing.
      if (!dateOf(p['Follow Up Date'])) patch['Follow Up Date'] = { date: { start: addDays(2) } };
      if (!p['Source']?.select?.name) patch['Source'] = { select: { name: 'Instagram' } };

      if (email && RESEND_KEY) {
        try {
          const eventType = p['Event Type']?.select?.name || '';
          await sendEmail(
            email,
            `Your ${(eventType || 'event').toLowerCase()} — we\u2019ve got your enquiry`,
            buildEmail({
              name,
              eventType,
              eventDate: dateOf(p['Event Date']),
              venue: text(p['Venue']),
              guests: p['Guest Count']?.number,
            })
          );
          patch['Acknowledged At'] = { date: { start: new Date().toISOString().split('T')[0] } };
          sent.push(name);
        } catch (err) {
          // Leave the flag blank so the next run tries again.
          failed.push(`${name}: ${err.message}`);
        }
      } else if (Object.keys(patch).length) {
        tidied.push(name + (email ? '' : ' (no email on file)'));
      }

      if (firstSeen && RESEND_KEY) {
        const when = dateOf(p['Event Date']);
        await sendEmail(
          ALERT_TO,
          `New enquiry \u2014 ${name || 'unnamed'}${when ? ` \u00b7 ${prettyDate(when)}` : ''}`,
          buildAlert({
            name,
            eventType: p['Event Type']?.select?.name || '',
            eventDate: when,
            venue: text(p['Venue']),
            guests: p['Guest Count']?.number,
            email,
            phone: p['Phone Number']?.number,
            acknowledged: !!patch['Acknowledged At'],
            url: page.url,
          })
        ).catch(err => failed.push(`alert for ${name}: ${err.message}`));
      }

      if (Object.keys(patch).length) {
        await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
          method: 'PATCH', headers: notionHeaders(), body: JSON.stringify({ properties: patch }),
        }).catch(() => {});
      }
      await new Promise(r => setTimeout(r, 350));
    }

    return Response.json({ ok: true, sent: sent.length, tidied: tidied.length, failed });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}
