// Gathers everything the Growth pages, the weekly brief and the re-engagement
// queue reason over: the Sales Pipeline, bookings and Content Calendar from
// Notion; links, clicks, attribution and Instagram/ads snapshots from Supabase.
import { listEnquiries, listAllBookings, listContentCalendar } from './notion';
import { readGrowthData, getSettings, getMetaConfig } from './growthStore';
import { hasMeta } from './meta';

export async function loadGrowth({ bookings = true, content = true, days = 400 } = {}) {
  const [enquiries, bookingList, cal, store, settings, meta] = await Promise.all([
    listEnquiries(),
    bookings ? listAllBookings().catch(() => []) : Promise.resolve([]),
    content
      ? listContentCalendar().then(items => ({ ok: true, items })).catch(e => ({ ok: false, items: [], error: e.message }))
      : Promise.resolve({ ok: false, items: [] }),
    readGrowthData({ days }),
    getSettings().catch(() => ({})),
    getMetaConfig().catch(() => ({})),
  ]);
  const connected = {
    content: cal.ok,
    metaToken: hasMeta(),
    instagram: hasMeta() && !!meta.igUserId,
    ads: hasMeta() && !!meta.adAccountId,
    pixel: hasMeta() && !!meta.pixelId,
  };
  return { enquiries, bookings: bookingList, content: cal.items, contentError: cal.error || '', ...store, settings, meta, connected };
}

// What a marketing login may see of a single enquiry: enough to learn from
// (when, what kind of event, where they came from, how far ahead), nothing
// that identifies the client or shows money.
export function redactEnquiry(e) {
  return {
    id: e.id, createdAt: e.createdAt, eventMonth: e.eventDate ? e.eventDate.slice(0, 7) : '', eventType: e.eventType,
    guestCount: e.guestCount, source: e.source, status: e.status, channel: e.channel, campaign: e.campaign,
    adPost: e.adPost, leadTimeMonths: e.leadTimeMonths, planningStage: e.planningStage,
  };
}

// Instagram permalinks come as /p/<code>/ or /reel/<code>/ — match on the code.
export function igCode(url) {
  const m = String(url || '').match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv|stories\/[^/]+)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}
export function slugFromTracked(url) {
  const m = String(url || '').match(/\/go\/([a-z0-9-]+)/);
  return m ? m[1] : '';
}
