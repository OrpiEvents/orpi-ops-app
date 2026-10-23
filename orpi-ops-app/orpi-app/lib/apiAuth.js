import { NextResponse } from 'next/server';
import { createClient } from './supabaseServer';
import { roleOf } from './roles';

// For API routes: who's asking and what they're allowed to do. The middleware
// already blocks a marketing login from non-Growth routes; this is the second
// check inside each route, so a mistake in one place can't leak data.
//
//   const { user, role, deny } = await authorize(['director', 'marketing']);
//   if (deny) return deny;
export async function authorize(allowed = ['director']) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { deny: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  const role = roleOf(user);
  if (!allowed.includes(role)) {
    return { user, role, deny: NextResponse.json({ error: 'Your login doesn’t have access to this.' }, { status: 403 }) };
  }
  return { user, role, deny: null };
}

// Scheduled jobs: Vercel Cron sends "Authorization: Bearer $CRON_SECRET".
// Refuses to run at all if the secret isn't set, so the URL can't be used to
// trigger jobs by anyone who finds it.
export function cronAllowed(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, error: 'CRON_SECRET is not set in Vercel, so scheduled jobs are switched off.' };
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return { ok: false, status: 401, error: 'Unauthorised' };
  return { ok: true };
}
