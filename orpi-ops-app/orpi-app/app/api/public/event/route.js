import { NextResponse } from 'next/server';
import { recordEvent } from '@/lib/growthStore';
import { isBot, SLUG_RE } from '@/lib/tracking';
import { corsHeaders } from '@/lib/cors';

// Funnel counts for the enquiry form: viewed, started. Counts only — no
// cookies, no IPs, nothing that identifies the visitor.
export const dynamic = 'force-dynamic';
const clip = (s, n) => (s ? String(s).trim().slice(0, n) : null);

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request) {
  const headers = corsHeaders(request);
  let b = {};
  try { b = JSON.parse(await request.text()); } catch { /* ignore */ }
  const ua = request.headers.get('user-agent') || '';
  if (['form_view', 'form_start'].includes(b.kind) && !isBot(ua)) {
    const a = b.attribution || {};
    await recordEvent({
      kind: b.kind,
      page: clip(b.page, 40),
      link_slug: SLUG_RE.test(a.l || '') ? a.l : null,
      utm_source: clip(a.utm_source, 80), utm_medium: clip(a.utm_medium, 80),
      utm_campaign: clip(a.utm_campaign, 120), utm_content: clip(a.utm_content, 120),
    });
  }
  return new NextResponse(null, { status: 204, headers });
}
