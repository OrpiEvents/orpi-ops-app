import { NextResponse } from 'next/server';
import { getLink, recordClick } from '@/lib/growthStore';
import { isBot, deviceOf, hostOf } from '@/lib/tracking';

// Tracked short link: /go/<slug> → logs the click (no personal data) and
// redirects to the destination with its UTM tags. Unknown or archived slugs
// fall through to the enquiry page rather than a dead end.
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const slug = String(params.slug || '').toLowerCase();
  const fallback = process.env.GROWTH_FALLBACK_URL || `${request.nextUrl.origin}/enquire`;

  let link = null;
  try { link = await getLink(slug); } catch { /* fall back below */ }
  if (!link || link.archived) return NextResponse.redirect(fallback, 302);

  const ua = request.headers.get('user-agent') || '';
  await recordClick({
    slug,
    referrer_host: hostOf(request.headers.get('referer')),
    device: deviceOf(ua),
    country: request.headers.get('x-vercel-ip-country') || null,
    bot: isBot(ua),
  });

  // Tell our own pages which link brought the visitor in, so the enquiry is
  // credited to it even if the UTM tags get stripped along the way.
  let dest = link.destination;
  try {
    const u = new URL(dest);
    const ours = u.host === request.nextUrl.host || /(^|\.)orpi\.events$/.test(u.hostname);
    if (ours && !u.searchParams.has('l')) { u.searchParams.set('l', slug); dest = u.toString(); }
  } catch { /* leave as stored */ }

  return NextResponse.redirect(dest, { status: 302, headers: { 'Cache-Control': 'no-store' } });
}
