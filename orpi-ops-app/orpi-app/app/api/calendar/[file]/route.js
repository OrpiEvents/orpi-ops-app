// GET /api/calendar/<token>.ics — the team calendar feed.
//
// Public on purpose: Apple Calendar fetches it with no login, so the long
// random token in the URL is what guards it (reset it from the Team page).
// A wrong token gets a plain 404 rather than a hint that the path exists.
import { getFeedToken, tokenMatches, buildIcs } from '@/lib/calendarFeed';
import { listEnquiries, listAllBookings } from '@/lib/notion';

export const dynamic = 'force-dynamic';

// Each subscribed calendar asks about once an hour; Notion only needs asking
// every few minutes however many people subscribe.
const CACHE_MS = 5 * 60 * 1000;
let cache = { at: 0, data: null };

const notFound = () => new Response('Not found', { status: 404 });

export async function GET(request, { params }) {
  const m = /^([A-Za-z0-9_-]{20,})\.ics$/.exec(params.file || '');
  if (!m) return notFound();
  let actual;
  try { actual = await getFeedToken(); } catch { return new Response('Calendar unavailable', { status: 503 }); }
  if (!tokenMatches(m[1], actual)) return notFound();

  try {
    if (!cache.data || Date.now() - cache.at > CACHE_MS) {
      const [enquiries, bookings] = await Promise.all([listEnquiries(), listAllBookings()]);
      cache = { at: Date.now(), data: { enquiries, bookings } };
    }
  } catch (err) {
    // Notion down: serve the last copy if there is one, so calendars don't empty.
    if (!cache.data) return new Response('Calendar unavailable', { status: 503 });
  }

  const origin = (process.env.BOOKING_ORIGIN || request.nextUrl.origin).replace(/\/+$/, '');
  const ics = buildIcs({ ...cache.data, origin, now: new Date() });
  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="orpi-calendar.ics"',
      'Cache-Control': 'private, max-age=900',
      'X-Robots-Tag': 'noindex',
    },
  });
}
