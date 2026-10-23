import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createEnquiry, updateEnquiry } from '@/lib/notion';
import { recordLead, recordEvent, getSettings, getMetaConfig, recentSubmissions } from '@/lib/growthStore';
import { sendLeadEvent, hasMeta } from '@/lib/meta';
import { sendEmail, canEmail, ALERT_TO } from '@/lib/mailer';
import { acknowledgementEmail, alertEmail } from '@/lib/enquiryEmails';
import { HEARD_OPTIONS, heardToSource, EVENT_TYPES, SERVICE_TYPES, hostOf, SLUG_RE } from '@/lib/tracking';
import { addDays, todayIso, monthsBetween, stageForMonths } from '@/lib/growth';
import { corsHeaders } from '@/lib/cors';
import { logActivity } from '@/lib/activityLog';

// The one door every enquiry comes through: the /enquire page, and the
// website's form when it launches. Writes the enquiry to the Sales Pipeline
// with where it came from, records the attribution, tells the inbox, and
// (only with the visitor's consent) tells Meta an enquiry happened.
export const dynamic = 'force-dynamic';

const recent = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (recent.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  list.push(now);
  recent.set(ip, list);
  return list.length > 6;
}
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Keyed hashes, so limits work across server instances without storing a
// readable IP or email.
const HASH_KEY = () => process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'orpi';
const keyed = (kind, v) => crypto.createHmac('sha256', HASH_KEY()).update(`${kind}:${v}`).digest('hex').slice(0, 32);
const MAX_PER_HOUR = 5;

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request) {
  const headers = corsHeaders(request);
  const reply = (body, status = 200) => NextResponse.json(body, { status, headers });

  let b;
  try { b = await request.json(); } catch { return reply({ error: 'Bad request' }, 400); }
  // Honeypot: a field people can't see. Bots fill it in and get a quiet "thanks".
  if (b.company) return reply({ ok: true, first: '' });

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || '';
  if (ip && tooMany(ip)) return reply({ error: 'Too many enquiries from this connection. Please email hello@orpi.events.' }, 429);

  const name = clip(b.name, 120).replace(/\s+/g, ' ');
  const email = clip(b.email, 160).toLowerCase();
  const phoneRaw = clip(b.phone, 40);
  const phone = phoneRaw.replace(/\D/g, '');
  if (name.length < 2) return reply({ error: 'Please add your name.' }, 400);
  if (!EMAIL_RE.test(email)) return reply({ error: 'Please check your email address.' }, 400);
  if (phone.length < 7 || phone.length > 15) return reply({ error: 'Please check your phone number.' }, 400);

  // Limits that hold across server instances: 5 forms an hour per
  // connection; the same address twice within 10 minutes is a double-submit
  // (thanked, not saved twice).
  const ipHash = ip ? keyed('ip', ip) : null;
  const emailHash = keyed('email', email);
  const recentSubs = await recentSubmissions({ ipHash, emailHash }).catch(() => ({ ipLastHour: 0, emailRecent: [] }));
  if (recentSubs.ipLastHour >= MAX_PER_HOUR) return reply({ error: 'Too many enquiries from this connection. Please email hello@orpi.events.' }, 429);
  if (recentSubs.emailRecent.some(t => Date.now() - new Date(t).getTime() < 10 * 60 * 1000)) {
    return reply({ ok: true, first: name.split(' ')[0] });
  }

  const today = todayIso();
  const exactDate = /^\d{4}-\d{2}-\d{2}$/.test(b.eventDate || '') ? b.eventDate : '';
  const approxMonth = !exactDate && /^\d{4}-\d{2}$/.test(b.approxMonth || '') ? b.approxMonth : '';
  // A "roughly June 2027" date is stored mid-month so the planning stage and
  // the re-engagement clock are about right; the notes say it's approximate.
  const eventDate = exactDate || (approxMonth ? `${approxMonth}-15` : '');
  if (exactDate && exactDate < today) return reply({ error: 'That event date has already passed. Please check it.' }, 400);

  const eventType = EVENT_TYPES.includes(b.eventType) ? b.eventType : 'Other';
  const guests = Math.min(5000, Math.max(0, parseInt(b.guests, 10) || 0)) || null;
  const venue = clip(b.venue, 200);
  const services = (Array.isArray(b.services) ? b.services : []).filter(s => SERVICE_TYPES.includes(s));
  const heard = HEARD_OPTIONS.some(o => o.value === b.heard) ? b.heard : 'other';
  const source = heardToSource(heard);
  const referredBy = clip(b.referredBy, 120);
  // Notion caps a text block at 2,000 characters; leave room for the lines
  // added around the client's notes.
  const notes = clip(b.notes, 1500);
  const optedOut = !!b.marketingOptOut;
  const consentAds = !!b.consentAds;
  const channel = b.channel === 'website' ? 'Website form' : 'Enquiry page';

  const a = b.attribution || {};
  const utm = {
    source: clip(a.utm_source, 80), medium: clip(a.utm_medium, 80), campaign: clip(a.utm_campaign, 120),
    content: clip(a.utm_content, 120), term: clip(a.utm_term, 120),
  };
  const linkSlug = SLUG_RE.test(a.l || '') ? a.l : '';
  const landing = clip(a.landing, 500);
  const months = eventDate ? monthsBetween(eventDate, today) : null;
  const stage = stageForMonths(months);
  const tooFast = Number(b.elapsedMs) > 0 && Number(b.elapsedMs) < 2500;

  const notesText = [
    `Came in through the ${channel.toLowerCase()} on ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })}.`,
    approxMonth ? `Date not fixed yet: roughly ${new Date(`${approxMonth}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}.` : null,
    notes ? `They said: ${notes}` : null,
    tooFast ? '⚠ Filled in unusually fast. Check it isn’t spam.' : null,
  ].filter(Boolean).join('\n').slice(0, 1990);

  const fields = {
    name, email, phone, venue, eventType, serviceTypes: services, source,
    ...(eventDate ? { eventDate } : {}),
    ...(guests ? { guestCount: guests } : {}),
    ...(referredBy ? { referredBy } : {}),
    status: 'New',
    followUpDate: addDays(today, 1),
    internalNotes: notesText,
    channel,
    campaign: utm.campaign,
    adPost: utm.content || linkSlug,
    marketing: optedOut ? 'Opted out' : 'OK',
  };

  let enquiry;
  try {
    enquiry = await createEnquiry(fields);
  } catch (err) {
    // Notion down or a field rejected: don't lose the enquiry. If the inbox
    // gets it, the client still sees "thank you".
    await recordEvent({ kind: 'form_error', page: channel, link_slug: linkSlug || null, utm_source: utm.source || null, utm_medium: utm.medium || null, utm_campaign: utm.campaign || null, utm_content: utm.content || null });
    let saved = false;
    if (canEmail()) {
      try {
        await sendEmail({
          to: ALERT_TO(),
          subject: `⚠ New enquiry NOT saved to Notion — ${name}`,
          text: `Notion said: ${err.message}\n\nAdd this to the Sales Pipeline by hand:\n\n${JSON.stringify({ ...fields, phone: phoneRaw, heard, utm, linkSlug }, null, 2)}`,
        });
        saved = true;
      } catch { /* fall through */ }
    }
    return saved
      ? reply({ ok: true, first: name.split(' ')[0] })
      : reply({ error: 'Sorry, something went wrong saving your enquiry. Please email hello@orpi.events and we’ll pick it up straight away.' }, 502);
  }

  // Conversions API — only with consent, and only once a pixel is chosen.
  const meta = await getMetaConfig().catch(() => ({}));
  const eventId = clip(b.eventId, 64) || crypto.randomUUID();
  let capiStatus = consentAds ? 'not configured' : 'no consent';
  if (consentAds && meta.pixelId && hasMeta()) {
    try {
      const r = await sendLeadEvent({
        pixelId: meta.pixelId,
        eventId,
        sourceUrl: landing || `${request.nextUrl.origin}/enquire`,
        email, phone, firstName: name.split(' ')[0],
        ip, userAgent: request.headers.get('user-agent') || '',
        fbc: clip(b.fbc, 300) || undefined, fbp: clip(b.fbp, 300) || undefined,
        externalId: enquiry.id,
        custom: { event_type: eventType, ...(guests ? { guests } : {}), ...(stage ? { planning_stage: stage.label } : {}) },
      });
      capiStatus = r?.events_received ? 'sent' : 'sent (no count)';
    } catch (e) { capiStatus = `error: ${e.message}`.slice(0, 200); }
  }

  await recordLead({
    notion_page_id: enquiry.id,
    channel,
    heard_about: heard,
    utm_source: utm.source || null, utm_medium: utm.medium || null, utm_campaign: utm.campaign || null,
    utm_content: utm.content || null, utm_term: utm.term || null,
    link_slug: linkSlug || null,
    landing_page: landing || null,
    referrer_host: hostOf(a.referrer),
    fbclid: consentAds ? clip(a.fbclid, 300) || null : null,
    fbc: consentAds ? clip(b.fbc, 300) || null : null,
    fbp: consentAds ? clip(b.fbp, 300) || null : null,
    consent_ads: consentAds,
    marketing_ok: !optedOut,
    event_date: eventDate || null,
    event_type: eventType,
    guest_count: guests,
    months_ahead: months !== null ? Math.round(months * 10) / 10 : null,
    capi_status: capiStatus,
    email_hash: emailHash,
  }).catch(() => {});
  await recordEvent({ kind: 'form_submit', page: channel, link_slug: linkSlug || null, utm_source: utm.source || null, utm_medium: utm.medium || null, utm_campaign: utm.campaign || null, utm_content: utm.content || null, ip_hash: ipHash });

  // The client acknowledgement is off until a director switches it on
  // (Connections page), and goes at most once a month to any one address.
  // The inbox alert always goes.
  const settings = await getSettings().catch(() => ({}));
  let acknowledged = false;
  if (settings.autoAcknowledge && canEmail() && !recentSubs.emailRecent.length) {
    try {
      await sendEmail({ to: email, ...acknowledgementEmail({ name, eventType, eventDate: exactDate, guests }) });
      acknowledged = true;
      await updateEnquiry(enquiry.id, { acknowledgedAt: today }).catch(() => {});
    } catch { /* the alert below still goes */ }
  }
  if (canEmail()) {
    await sendEmail({
      to: ALERT_TO(),
      ...alertEmail({
        name, eventType, eventDate, venue, guests, email, phone: phoneRaw, channel, source,
        campaign: utm.campaign, adPost: utm.content || linkSlug, stage: stage?.label, acknowledged, url: enquiry.url,
      }),
    }).catch(() => {});
  }
  await logActivity({ userEmail: 'enquiry form', action: 'enquiry.create', target: name, detail: `${channel} · heard: ${source}${utm.campaign ? ` · campaign: ${utm.campaign}` : ''}${linkSlug ? ` · link: ${linkSlug}` : ''}` });

  return reply({ ok: true, first: name.split(' ')[0] });
}
