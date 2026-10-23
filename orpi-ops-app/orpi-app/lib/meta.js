// Meta (Instagram + Facebook Ads) — server only.
//
// One token does the reading: a System User token from ORPI's Meta Business
// portfolio, set by a director in Vercel as META_ACCESS_TOKEN. It never touches
// the browser, the database or the code. Which Page / Instagram account / ad
// account / pixel to read is picked on the Connections page and stored as plain
// ids in app_state (meta_config).
//
// Read-only by design, with two narrow exceptions a director triggers:
// sending Conversions API events (enquiries, with the visitor's consent) and
// subscribing the Page to lead-ads webhooks. Nothing here posts, boosts,
// creates or edits ads, or spends money.
import crypto from 'crypto';

// v26.0 (29 Jul 2026) is current for both the Graph API and the Marketing API.
export const GRAPH_VERSION = () => process.env.META_GRAPH_VERSION || 'v26.0';
const BASE = () => `https://graph.facebook.com/${GRAPH_VERSION()}`;
export const metaToken = () => process.env.META_ACCESS_TOKEN || '';
export const capiToken = () => process.env.META_CAPI_TOKEN || process.env.META_ACCESS_TOKEN || '';
export const hasMeta = () => !!metaToken();

// Metric lists live here so a Meta deprecation is a one-line change.
// Checked against Meta's docs on 23 Oct 2026: profile_views, website_clicks
// and impressions were removed from every version in 2025, and Instagram has
// no bio-link click metric at all — the tracked /go/ bio link is the only
// true count. profile_links_taps = taps on the contact buttons (call, email,
// directions), not the bio link. Account reach/views include ads.
export const IG_ACCOUNT_METRICS = ['reach', 'views', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'replies', 'profile_links_taps'];
export const IG_MEDIA_METRICS = {
  FEED: ['reach', 'views', 'saved', 'shares', 'likes', 'comments', 'total_interactions', 'profile_visits', 'follows'],
  REELS: ['reach', 'views', 'saved', 'shares', 'likes', 'comments', 'total_interactions'],
  STORY: ['reach', 'views', 'shares', 'total_interactions', 'profile_visits', 'follows', 'replies'],
};
const MEDIA_FALLBACK = ['reach', 'saved', 'shares', 'likes', 'comments', 'total_interactions'];

function proof(token) {
  const secret = process.env.META_APP_SECRET;
  return secret ? crypto.createHmac('sha256', secret).update(token).digest('hex') : null;
}

export async function graph(path, params = {}, { token = metaToken(), method = 'GET', body } = {}) {
  if (!token) throw new Error('META_ACCESS_TOKEN is not set');
  const url = new URL(path.startsWith('http') ? path : `${BASE()}${path.startsWith('/') ? '' : '/'}${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  if (!url.searchParams.has('access_token')) url.searchParams.set('access_token', token);
  const p = proof(token);
  if (p && !url.searchParams.has('appsecret_proof')) url.searchParams.set('appsecret_proof', p);
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    const err = new Error(e.message || `Meta ${res.status}`);
    err.code = e.code; err.subcode = e.error_subcode; err.status = res.status;
    throw err;
  }
  return json;
}

// Follows paging.next, capped so one call can't run away.
export async function graphAll(path, params = {}, maxPages = 20) {
  const out = [];
  let page = await graph(path, params);
  for (let i = 0; i < maxPages; i++) {
    out.push(...(page.data || []));
    if (!page.paging?.next) break;
    page = await graph(page.paging.next);
  }
  return out;
}

// ---- discovery (Connections page) ------------------------------------------------
export async function discoverAssets() {
  const out = { me: null, permissions: [], pages: [], adAccounts: [], pixels: [], errors: [] };
  const attempt = async (label, fn) => { try { return await fn(); } catch (e) { out.errors.push(`${label}: ${e.message}`); return null; } };
  out.me = await attempt('who am I', () => graph('/me', { fields: 'id,name' }));
  const perms = await attempt('permissions', () => graph('/me/permissions'));
  out.permissions = (perms?.data || []).filter(p => p.status === 'granted').map(p => p.permission);
  const pages = await attempt('pages', () => graphAll('/me/accounts', { fields: 'id,name,instagram_business_account{id,username,followers_count}', limit: 50 }));
  out.pages = (pages || []).map(p => ({ id: p.id, name: p.name, ig: p.instagram_business_account || null }));
  const accounts = await attempt('ad accounts', () => graphAll('/me/adaccounts', { fields: 'id,name,currency,timezone_name,account_status', limit: 50 }));
  out.adAccounts = (accounts || []).map(a => ({ id: a.id, name: a.name, currency: a.currency, timezone: a.timezone_name, status: a.account_status }));
  for (const a of out.adAccounts) {
    const px = await attempt(`pixels for ${a.name}`, () => graphAll(`/${a.id}/adspixels`, { fields: 'id,name', limit: 50 }));
    for (const p of px || []) if (!out.pixels.some(x => x.id === p.id)) out.pixels.push({ id: p.id, name: p.name, adAccountId: a.id });
  }
  return out;
}

// ---- Instagram ------------------------------------------------------------------------
const dayStartUnix = iso => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 1000);

// Account totals for one calendar day. Metrics Meta rejects are dropped and
// retried, so one deprecation doesn't blank the whole day.
export async function igDay(igUserId, dayIso) {
  let metrics = [...IG_ACCOUNT_METRICS];
  const since = dayStartUnix(dayIso), until = since + 86400;
  for (let tries = 0; tries < 4 && metrics.length; tries++) {
    try {
      const res = await graph(`/${igUserId}/insights`, { metric: metrics.join(','), period: 'day', metric_type: 'total_value', since, until });
      const row = { day: dayIso, raw: res.data };
      for (const m of res.data || []) row[m.name] = m.total_value?.value ?? m.values?.[0]?.value ?? null;
      return row;
    } catch (e) {
      const bad = metrics.filter(m => new RegExp(`\\b${m}\\b`).test(e.message));
      if (bad.length && bad.length < metrics.length) metrics = metrics.filter(m => !bad.includes(m));
      else if (/metric/i.test(e.message) && metrics.length > 1) metrics = metrics.slice(0, Math.ceil(metrics.length / 2));
      else throw e;
    }
  }
  return { day: dayIso };
}

export async function igFollowers(igUserId) {
  const r = await graph(`/${igUserId}`, { fields: 'followers_count,media_count,username' });
  return r.followers_count ?? null;
}

async function mediaInsights(mediaId, type) {
  const lists = [IG_MEDIA_METRICS[type] || IG_MEDIA_METRICS.FEED, MEDIA_FALLBACK];
  for (const metrics of lists) {
    try {
      const res = await graph(`/${mediaId}/insights`, { metric: metrics.join(',') });
      const out = {};
      for (const m of res.data || []) out[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? null;
      return out;
    } catch (e) {
      if (!/metric|support/i.test(e.message)) throw e;
    }
  }
  return {};
}

export async function igMedia(igUserId, { sinceIso, max = 60 } = {}) {
  const items = await graphAll(`/${igUserId}/media`, { fields: 'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count', limit: 50 }, 3);
  const recent = items.filter(m => !sinceIso || String(m.timestamp).slice(0, 10) >= sinceIso).slice(0, max);
  let stories = [];
  try { stories = await graphAll(`/${igUserId}/stories`, { fields: 'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url', limit: 50 }, 2); } catch { /* none live */ }
  const all = [...recent, ...stories];
  const insights = [];
  for (let i = 0; i < all.length; i += 8) {
    insights.push(...await Promise.all(all.slice(i, i + 8).map(m => {
      const type = m.media_product_type === 'REELS' ? 'REELS' : m.media_product_type === 'STORY' ? 'STORY' : 'FEED';
      return mediaInsights(m.id, type).catch(() => ({}));   // keep the post; numbers next run
    })));
  }
  const rows = [];
  for (let i = 0; i < all.length; i++) {
    const m = all[i];
    const ins = insights[i] || {};
    rows.push({
      media_id: m.id,
      posted_at: m.timestamp,
      media_type: m.media_type,
      product_type: m.media_product_type,
      caption: (m.caption || '').slice(0, 2000),
      permalink: m.permalink,
      thumbnail_url: m.thumbnail_url || (m.media_type === 'IMAGE' ? m.media_url : null),
      views: ins.views ?? null,
      reach: ins.reach ?? null,
      likes: ins.likes ?? m.like_count ?? null,
      comments: ins.comments ?? m.comments_count ?? null,
      saved: ins.saved ?? null,
      shares: ins.shares ?? null,
      total_interactions: ins.total_interactions ?? null,
      profile_visits: ins.profile_visits ?? null,
      follows: ins.follows ?? null,
      raw: { insights: ins },
      synced_at: new Date().toISOString(),
    });
  }
  return rows;
}

// ---- Ads -------------------------------------------------------------------------------
// "lead" already includes the on-Facebook and pixel lead types, so the types
// overlap; take the largest rather than adding them up.
const LEAD_ACTIONS = ['lead', 'onsite_conversion.lead_grouped', 'leadgen_grouped', 'offsite_conversion.fb_pixel_lead'];
const MESSAGE_ACTIONS = ['onsite_conversion.messaging_conversation_started_7d'];
const actionTotal = (actions = [], types) => {
  const vals = actions.filter(a => types.includes(a.action_type)).map(a => Number(a.value) || 0);
  return vals.length ? Math.max(...vals) : 0;
};

// Meta keeps revising ad numbers for 28 days, so the sync re-reads that much.
// Attribution windows are passed explicitly: the documented "default" is
// ambiguous, and the 7- and 28-day view windows stopped returning data in 2026.
export async function adsInsights(adAccountId, sinceIso, untilIso) {
  const rows = await graphAll(`/${adAccountId}/insights`, {
    level: 'ad',
    time_increment: 1,
    time_range: { since: sinceIso, until: untilIso },
    action_attribution_windows: ['7d_click', '1d_view'],
    fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,objective,spend,impressions,reach,frequency,clicks,inline_link_clicks,instagram_profile_visits,actions',
    limit: 500,
  }, 20).catch(async e => {
    // instagram_profile_visits is new (Oct 2025); if an account rejects it,
    // carry on without it rather than losing the day.
    if (!/instagram_profile_visits/.test(e.message)) throw e;
    return graphAll(`/${adAccountId}/insights`, {
      level: 'ad', time_increment: 1, time_range: { since: sinceIso, until: untilIso },
      action_attribution_windows: ['7d_click', '1d_view'],
      fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,objective,spend,impressions,reach,frequency,clicks,inline_link_clicks,actions',
      limit: 500,
    }, 20);
  });
  return rows.map(r => ({
    day: r.date_start,
    ad_id: r.ad_id,
    ad_name: r.ad_name,
    adset_id: r.adset_id,
    adset_name: r.adset_name,
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    objective: r.objective,
    spend: Number(r.spend) || 0,
    impressions: Number(r.impressions) || 0,
    reach: Number(r.reach) || 0,
    frequency: Number(r.frequency) || null,
    clicks: Number(r.clicks) || 0,
    link_clicks: Number(r.inline_link_clicks) || 0,
    leads: actionTotal(r.actions, LEAD_ACTIONS),
    messages: actionTotal(r.actions, MESSAGE_ACTIONS),
    profile_visits: Number(r.instagram_profile_visits) || 0,
    raw: { actions: r.actions || [] },
    synced_at: new Date().toISOString(),
  }));
}

// ---- Conversions API ----------------------------------------------------------------------
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
export const normEmail = e => String(e || '').trim().toLowerCase();
export function normPhoneUK(p) {
  let d = String(p ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = `44${d.slice(1)}`;
  else if (d.length === 10 && d.startsWith('7')) d = `44${d}`;
  return d;
}

// A website "Lead" for the enquiry, sent server-side so ad results don't
// depend on the browser. Only called when the visitor accepted ad cookies.
export async function sendLeadEvent({ pixelId, eventId, eventTime, sourceUrl, email, phone, firstName, ip, userAgent, fbc, fbp, externalId, custom = {} }) {
  const token = capiToken();
  if (!token || !pixelId) return { skipped: 'not configured' };
  const user_data = {
    ...(email ? { em: [sha(normEmail(email))] } : {}),
    ...(normPhoneUK(phone) ? { ph: [sha(normPhoneUK(phone))] } : {}),
    // Meta's normalisation: lowercase, no punctuation; phone = digits with the
    // country code and no leading zero. IP, user agent, fbc and fbp go unhashed.
    ...(firstName ? { fn: [sha(String(firstName).trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))] } : {}),
    ...(externalId ? { external_id: [sha(String(externalId))] } : {}),
    ...(ip ? { client_ip_address: ip } : {}),
    ...(userAgent ? { client_user_agent: userAgent } : {}),
    ...(fbc ? { fbc } : {}),
    ...(fbp ? { fbp } : {}),
  };
  const body = {
    data: [{
      event_name: 'Lead',
      event_time: eventTime || Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: sourceUrl,
      user_data,
      custom_data: custom,
    }],
    ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
  };
  return graph(`/${pixelId}/events`, {}, { token, method: 'POST', body });
}

// ---- Lead ads (Instant Forms) ----------------------------------------------------------------
export function webhookVerifyToken() {
  if (process.env.META_WEBHOOK_VERIFY_TOKEN) return process.env.META_WEBHOOK_VERIFY_TOKEN;
  const seed = process.env.META_APP_SECRET || process.env.CRON_SECRET;
  return seed ? sha(`orpi-meta-webhook:${seed}`).slice(0, 32) : '';
}

export function validSignature(rawBody, header) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected), b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Only id, created_time, ad_id, form_id and field_data are confirmed lead
// fields; the extras are tried first, and if Meta rejects them the ad and
// campaign names are looked up from the ad instead.
export async function fetchLead(leadgenId) {
  try {
    return await graph(`/${leadgenId}`, { fields: 'id,created_time,field_data,ad_id,ad_name,adset_name,campaign_id,campaign_name,form_id,platform,is_organic' });
  } catch {
    const lead = await graph(`/${leadgenId}`, { fields: 'id,created_time,field_data,ad_id,form_id' });
    if (lead.ad_id) {
      try {
        const ad = await graph(`/${lead.ad_id}`, { fields: 'name,campaign{name}' });
        lead.ad_name = ad.name;
        lead.campaign_name = ad.campaign?.name;
      } catch { /* names are nice-to-have */ }
    }
    return lead;
  }
}

// Turns Instant Form answers into enquiry fields. Matches loosely on the
// question key so renamed questions still land in the right place.
export function leadToEnquiry(lead) {
  const f = {};
  for (const d of lead.field_data || []) f[String(d.name || '').toLowerCase()] = (d.values || [])[0] || '';
  const pick = (...keys) => { for (const k of Object.keys(f)) if (keys.some(x => k.includes(x))) return f[k]; return ''; };
  const name = pick('full_name', 'name') || [pick('first_name'), pick('last_name')].filter(Boolean).join(' ');
  const date = pick('date', 'when');
  const isoDate = /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10)
    : (() => { const m = date.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); if (!m) return ''; const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; })();
  return {
    name: name || 'Meta lead',
    email: pick('email'),
    phone: pick('phone'),
    eventDate: isoDate,
    venue: pick('venue', 'location', 'city', 'post_code', 'postcode'),
    guestCount: Number(String(pick('guest', 'people')).replace(/\D/g, '')) || undefined,
    eventTypeRaw: pick('event', 'occasion', 'type'),
    notes: Object.entries(f).map(([k, v]) => `${k}: ${v}`).join('\n'),
  };
}

export async function subscribePageToLeads(pageId) {
  // Needs the Page's own token, which the system user can read.
  const page = await graph(`/${pageId}`, { fields: 'access_token' });
  if (!page.access_token) throw new Error('Could not get a Page token: give the system user full control of the Page.');
  return graph(`/${pageId}/subscribed_apps`, { subscribed_fields: 'leadgen' }, { token: page.access_token, method: 'POST' });
}
