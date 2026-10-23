// Wording for enquiry emails, shared by the enquiry form and the Meta lead
// webhook. Same voice as the original acknowledgement in /api/cron/enquiries.
import { prettyDate } from './growth';

// The acknowledgement goes to whatever address was typed into a public form,
// so it only repeats back things a stranger can't turn into a message: a
// cleaned first name (letters only), the date and the guest count. No venue
// or free text, which could otherwise carry a link to someone else's inbox.
export const safeFirstName = name => {
  const word = String(name || '').trim().split(/\s+/)[0] || '';
  return word.replace(/[^\p{L}'’-]/gu, '').slice(0, 30) || 'there';
};

// How each event type reads in a sentence: "your wedding", not "your wedding
// reception"; "your corporate event", not "your corporate"; never "your other".
const EVENT_PHRASES = {
  'wedding reception': 'wedding',
  'corporate': 'corporate event',
  'other': 'event',
};
export const eventPhrase = eventType => {
  const t = String(eventType || '').trim().toLowerCase();
  if (!t) return 'event';
  return EVENT_PHRASES[t] || t;
};

export function acknowledgementEmail({ name, eventType, eventDate, guests }) {
  const first = safeFirstName(name);
  const what = eventPhrase(eventType);
  const detail = [
    eventDate && `📅 ${prettyDate(eventDate, { year: true })}`,
    guests && `👥 ${guests} guests`,
  ].filter(Boolean);
  return {
    subject: `Your ${what} — we’ve got your enquiry`,
    text: [
      `Hi ${first},`,
      '',
      `Thanks for getting in touch about your ${what} — lovely to hear from you.`,
      '',
      ...(detail.length ? ['Here’s what we’ve got so far:', '', ...detail, ''] : []),
      'We’ll put a quote together and be in touch shortly. If anything above looks wrong, just reply and let us know.',
      '',
      'A couple of things worth knowing while you wait:',
      '',
      '• Every quote is built around your event rather than a fixed package — guest numbers, how long you want the bar open, and whether you’d like bespoke cocktails all change it',
      '• Dates go quickly in peak season, so if yours is set it’s worth telling us early',
      '',
      'Speak soon,',
      '',
      'ORPI Events',
      'hello@orpi.events',
    ].join('\n'),
  };
}

export function alertEmail({ name, eventType, eventDate, venue, guests, email, phone, channel, source, campaign, adPost, stage, acknowledged, url }) {
  return {
    subject: `New enquiry — ${name || 'unnamed'}${eventDate ? ` · ${prettyDate(eventDate, { year: true })}` : ''}`,
    text: [
      name || 'Unnamed enquiry',
      '',
      eventType ? `Event: ${eventType}` : null,
      eventDate ? `Date: ${prettyDate(eventDate, { year: true })}` : 'Date: not given',
      stage ? `Planning stage: ${stage}` : null,
      venue ? `Venue: ${venue}` : 'Venue: not given',
      guests ? `Guests: ${guests}` : 'Guests: not given',
      '',
      `Email: ${email || '— none given'}`,
      `Phone: ${phone || '— none given'}`,
      '',
      `Came in via: ${channel || '—'}${source ? ` · heard about us: ${source}` : ''}`,
      campaign || adPost ? `Campaign / post: ${[campaign, adPost].filter(Boolean).join(' · ')}` : null,
      '',
      acknowledged ? 'Acknowledgement sent automatically.' : 'No automatic acknowledgement — reply personally (speed wins).',
      '',
      url,
    ].filter(x => x !== null).join('\n'),
  };
}
