import { NextResponse } from 'next/server';
import { webhookVerifyToken, validSignature, fetchLead, leadToEnquiry, hasMeta } from '@/lib/meta';
import { createEnquiry, updateEnquiry } from '@/lib/notion';
import { recordLead, findLeadByMetaId, logSync, getSettings } from '@/lib/growthStore';
import { sendEmail, canEmail, ALERT_TO } from '@/lib/mailer';
import { alertEmail, acknowledgementEmail } from '@/lib/enquiryEmails';
import { addDays, todayIso, monthsBetween, stageForMonths } from '@/lib/growth';
import { logActivity } from '@/lib/activityLog';

// Meta lead ads (Instant Forms) → Sales Pipeline, within seconds of someone
// submitting. GET is Meta's one-time verification handshake; POST is the
// lead notification, checked against the app secret before anything happens.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const q = request.nextUrl.searchParams;
  const expected = webhookVerifyToken();
  if (q.get('hub.mode') === 'subscribe' && expected && q.get('hub.verify_token') === expected) {
    return new NextResponse(q.get('hub.challenge') || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

function eventTypeFrom(raw) {
  const s = String(raw || '').toLowerCase();
  if (/mehndi|mendhi|mehendi|sangeet|haldi/.test(s)) return 'Mendhi/Sangeet';
  if (/wedding|reception|nikah|shaadi/.test(s)) return 'Wedding Reception';
  if (/birthday|bday/.test(s)) return 'Birthday';
  if (/corporate|work|company|office/.test(s)) return 'Corporate';
  return 'Other';
}

export async function POST(request) {
  const raw = await request.text();
  if (!process.env.META_APP_SECRET) return new NextResponse('Not configured', { status: 503 });
  if (!validSignature(raw, request.headers.get('x-hub-signature-256'))) return new NextResponse('Bad signature', { status: 401 });
  if (!hasMeta()) return new NextResponse('OK', { status: 200 });

  let body = {};
  try { body = JSON.parse(raw); } catch { return new NextResponse('OK', { status: 200 }); }
  const today = todayIso();
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'leadgen' || !change.value?.leadgen_id) continue;
      const leadId = String(change.value.leadgen_id);
      try {
        if (await findLeadByMetaId(leadId)) continue;          // already handled (Meta retries)
        const lead = await fetchLead(leadId);
        const f = leadToEnquiry(lead);
        const eventType = eventTypeFrom(f.eventTypeRaw);
        const source = lead.platform === 'fb' ? 'Facebook' : 'Instagram';
        const months = f.eventDate ? monthsBetween(f.eventDate, today) : null;
        const enquiry = await createEnquiry({
          name: f.name, email: f.email, phone: String(f.phone || '').replace(/\D/g, ''),
          ...(f.eventDate ? { eventDate: f.eventDate } : {}),
          venue: f.venue, ...(f.guestCount ? { guestCount: f.guestCount } : {}),
          eventType, source, status: 'New', followUpDate: addDays(today, 1),
          channel: 'Meta lead form', campaign: lead.campaign_name || '', adPost: lead.ad_name || '',
          internalNotes: `Meta lead form${lead.is_organic ? ' (organic)' : ''} on ${today}.\n${f.notes}`.slice(0, 1990),
        });
        await recordLead({
          notion_page_id: enquiry.id, channel: 'Meta lead form', heard_about: source.toLowerCase(),
          utm_source: 'meta', utm_medium: lead.is_organic ? 'social' : 'paid_social',
          utm_campaign: lead.campaign_name || null, utm_content: lead.ad_name || null,
          meta_lead_id: leadId, meta_ad_id: lead.ad_id || null, meta_form_id: lead.form_id || null,
          event_date: f.eventDate || null, event_type: eventType, guest_count: f.guestCount || null,
          months_ahead: months !== null ? Math.round(months * 10) / 10 : null, consent_ads: false, capi_status: 'lead ad',
        });
        // Same switch as the enquiry page: acknowledge automatically only if a
        // director has turned it on.
        let acknowledged = false;
        const settings = await getSettings().catch(() => ({}));
        if (settings.autoAcknowledge && canEmail() && f.email) {
          try {
            await sendEmail({ to: f.email, ...acknowledgementEmail({ name: f.name, eventType, eventDate: f.eventDate, guests: f.guestCount }) });
            acknowledged = true;
            await updateEnquiry(enquiry.id, { acknowledgedAt: today }).catch(() => {});
          } catch { /* the alert below still goes */ }
        }
        if (canEmail()) {
          await sendEmail({
            to: ALERT_TO(),
            ...alertEmail({
              name: f.name, eventType, eventDate: f.eventDate, venue: f.venue, guests: f.guestCount, email: f.email, phone: f.phone,
              channel: 'Meta lead form', source, campaign: lead.campaign_name, adPost: lead.ad_name,
              stage: stageForMonths(months)?.label, acknowledged, url: enquiry.url,
            }),
          }).catch(() => {});
        }
        await logActivity({ userEmail: 'meta lead ads', action: 'enquiry.create', target: f.name, detail: `${lead.campaign_name || ''} · ${lead.ad_name || ''}` });
      } catch (e) {
        await logSync('lead-webhook', false, `${leadId}: ${e.message}`);
      }
    }
  }
  return new NextResponse('OK', { status: 200 });
}
