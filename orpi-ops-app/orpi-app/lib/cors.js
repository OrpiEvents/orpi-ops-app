// CORS for the public enquiry/event APIs, so the website (orpi.events) can post
// its form straight into the ops app. Extra origins (e.g. a Vercel preview of
// the new site) go in GROWTH_ALLOWED_ORIGINS, comma-separated.
const DEFAULT_ORIGINS = ['https://orpi.events', 'https://www.orpi.events'];

export function corsHeaders(request) {
  const origin = request.headers.get('origin');
  if (!origin) return {};
  const extra = (process.env.GROWTH_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = origin === request.nextUrl.origin || DEFAULT_ORIGINS.includes(origin) || extra.includes(origin);
  return ok ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  } : { Vary: 'Origin' };
}
