// lib/calendarFeed.js
//
// The team's calendar feed. Enquiries with a date show as holds and bookings
// as booked, in one calendar the team subscribes to once from Apple Calendar
// (or Google, or Outlook — it's a standard .ics feed). Nothing is written into
// anyone's calendar and no Apple password is involved: the calendar app
// fetches the feed every hour or so, and whatever's in Notion at that moment is
// what shows. A won enquiry's hold turns into its booking; a lost one drops off.
//
// The feed URL carries a long random token, kept in app_state. That token is
// the only thing guarding it, so it can be reset from the Team page, which cuts
// off every old subscription.
import crypto from 'crypto';
import { createAdminClient } from './supabaseServer';

const STATE_KEY = 'calendar_feed';
const db = () => createAdminClient();

export async function getFeedToken() {
  const { data } = await db().from('app_state').select('value').eq('key', STATE_KEY).maybeSingle();
  return data?.value?.token || null;
}

/** The current token, making one the first time anyone asks. */
export async function ensureFeedToken(email) {
  const existing = await getFeedToken();
  if (existing) return existing;
  return resetFeedToken(email);
}

/** A new token. Every calendar subscribed with the old link stops updating. */
export async function resetFeedToken(email) {
  const token = crypto.randomBytes(24).toString('base64url');
  const { error } = await db().from('app_state').upsert({
    key: STATE_KEY,
    value: { token, createdAt: new Date().toISOString(), createdBy: email || null },
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return token;
}

export function tokenMatches(given, actual) {
  if (!given || !actual) return false;
  const a = Buffer.from(String(given)), b = Buffer.from(String(actual));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const feedPath = token => `/api/calendar/${token}.ics`;

export { buildIcs } from './calendarIcs';
