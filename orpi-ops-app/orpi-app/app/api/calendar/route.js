// /api/calendar — directors only. GET returns the team calendar feed link
// (making the token the first time); POST { action: 'reset' } issues a new
// token, which stops every calendar subscribed with the old link.
import { NextResponse } from 'next/server';
import { authorize } from '@/lib/apiAuth';
import { ensureFeedToken, resetFeedToken, feedPath } from '@/lib/calendarFeed';
import { logActivity } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';

function links(request, token) {
  const origin = (process.env.BOOKING_ORIGIN || request.nextUrl.origin).replace(/\/+$/, '');
  const https = `${origin}${feedPath(token)}`;
  return { url: https, webcal: https.replace(/^https?:\/\//, 'webcal://') };
}

export async function GET(request) {
  const { user, deny } = await authorize(['director']);
  if (deny) return deny;
  try {
    const token = await ensureFeedToken(user.email);
    return NextResponse.json(links(request, token));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(request) {
  const { user, deny } = await authorize(['director']);
  if (deny) return deny;
  const body = await request.json().catch(() => ({}));
  if (body.action !== 'reset') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  try {
    const token = await resetFeedToken(user.email);
    await logActivity({ userEmail: user.email, action: 'calendar.reset', target: 'Team calendar feed' });
    return NextResponse.json(links(request, token));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
