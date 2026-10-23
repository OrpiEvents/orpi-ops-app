// Server-only access to the growth tables in Supabase (links, clicks, form
// events, lead attribution, Instagram + ads snapshots, touches) and the two
// settings records kept in app_state. Uses the service-role client — only call
// this from API routes, after authorize().
import { createAdminClient } from './supabaseServer';

const db = () => createAdminClient();

// ---- settings ---------------------------------------------------------------
// growth_settings: things a director chooses (auto-acknowledge, budgets).
// meta_config: which Meta assets the app reads (ids only — never tokens).
export const DEFAULT_SETTINGS = {
  autoAcknowledge: false,      // email new form enquiries automatically (off until Ruds says yes)
  monthlyAdBudget: null,       // £ ceiling for Meta spend per month
  boostCeiling: null,          // £ max per single boost without a fresh OK
  acquisitionShare: 0.1,       // share of booking value we're willing to spend to win it
};

async function getState(key, fallback) {
  const { data } = await db().from('app_state').select('value').eq('key', key).maybeSingle();
  return data?.value ?? fallback;
}
async function setState(key, value) {
  const { error } = await db().from('app_state').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return value;
}

export async function getSettings() { return { ...DEFAULT_SETTINGS, ...(await getState('growth_settings', {})) }; }
export async function saveSettings(patch) {
  const next = { ...(await getSettings()) };
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (patch[k] !== undefined) next[k] = patch[k];
  return setState('growth_settings', next);
}
export async function getMetaConfig() { return getState('meta_config', {}); }
export async function saveMetaConfig(cfg) {
  const allowed = ['businessId', 'pageId', 'pageName', 'igUserId', 'igUsername', 'adAccountId', 'adAccountName', 'adAccountCurrency', 'pixelId', 'pixelName', 'leadFormsSubscribed'];
  const clean = Object.fromEntries(Object.entries(cfg || {}).filter(([k]) => allowed.includes(k)));
  return setState('meta_config', { ...(await getMetaConfig()), ...clean });
}

// ---- reads (bounded so a page never pulls the whole history) ------------------
const sinceIso = days => new Date(Date.now() - days * 86400000).toISOString();

export async function readGrowthData({ days = 400 } = {}) {
  const since = sinceIso(days);
  const sinceDay = since.slice(0, 10);
  const c = db();
  const q = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data || []; };
  const [links, clicks, events, leads, igDaily, igMedia, ads, touches, statusLog, syncLog] = await Promise.all([
    q(c.from('growth_links').select('*').order('created_at', { ascending: false })),
    q(c.from('growth_clicks').select('slug, at, bot, device, referrer_host, country').gte('at', since).order('at', { ascending: false }).limit(20000)),
    q(c.from('growth_events').select('kind, at, link_slug, utm_source, utm_medium, utm_campaign, utm_content, page').gte('at', since).limit(20000)),
    q(c.from('growth_leads').select('notion_page_id, created_at, channel, heard_about, utm_source, utm_medium, utm_campaign, utm_content, link_slug, landing_page, referrer_host, consent_ads, marketing_ok, months_ahead, capi_status, meta_lead_id, meta_ad_id').gte('created_at', since).limit(5000)),
    q(c.from('ig_daily').select('*').gte('day', sinceDay).order('day')),
    q(c.from('ig_media').select('media_id, posted_at, media_type, product_type, caption, permalink, thumbnail_url, views, reach, likes, comments, saved, shares, total_interactions, profile_visits, follows, content_page_id').gte('posted_at', since).order('posted_at', { ascending: false }).limit(500)),
    q(c.from('ads_daily').select('day, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, objective, spend, impressions, reach, frequency, clicks, link_clicks, leads, messages, profile_visits').gte('day', sinceDay).limit(20000)),
    q(c.from('growth_touches').select('enquiry_id, touch_key, action, snooze_until, at, by_email, note').order('at', { ascending: false }).limit(5000)),
    q(c.from('pipeline_status_log').select('enquiry_id, status, at, months_to_event').gte('at', since).limit(20000)),
    q(c.from('growth_sync_log').select('*').order('at', { ascending: false }).limit(30)),
  ]);
  return { links, clicks, events, leads, igDaily, igMedia, ads, touches, statusLog, syncLog };
}

export async function logSync(job, ok, detail) {
  try { await db().from('growth_sync_log').insert({ job, ok, detail: String(detail || '').slice(0, 2000) }); } catch { /* never block on logging */ }
}

// ---- links --------------------------------------------------------------------
export async function getLink(slug) {
  const { data } = await db().from('growth_links').select('slug, destination, archived').eq('slug', slug).maybeSingle();
  return data;
}
export async function createLink(row) {
  const { data, error } = await db().from('growth_links').insert(row).select().single();
  if (error) throw new Error(error.code === '23505' ? 'That short name is already taken.' : error.message);
  return data;
}
export async function updateLink(slug, patch) {
  const { data, error } = await db().from('growth_links').update(patch).eq('slug', slug).select().single();
  if (error) throw new Error(error.message);
  return data;
}
export async function recordClick(row) {
  try { await db().from('growth_clicks').insert(row); } catch { /* a lost click never blocks the redirect */ }
}
export async function recordEvent(row) {
  try { await db().from('growth_events').insert(row); } catch { /* counts only */ }
}

// ---- leads & touches ------------------------------------------------------------
export async function recordLead(row) {
  const { error } = await db().from('growth_leads').insert(row);
  if (error) throw new Error(error.message);
}
export async function updateLead(notionPageId, patch) {
  await db().from('growth_leads').update(patch).eq('notion_page_id', notionPageId);
}
export async function findLeadByMetaId(metaLeadId) {
  const { data } = await db().from('growth_leads').select('notion_page_id').eq('meta_lead_id', metaLeadId).maybeSingle();
  return data;
}
export async function recordTouch(row) {
  const { error } = await db().from('growth_touches').insert(row);
  if (error) throw new Error(error.message);
}

// ---- snapshots -------------------------------------------------------------------
export async function upsertRows(table, rows, onConflict) {
  if (!rows.length) return 0;
  const c = db();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await c.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  return rows.length;
}

// Daily: store a row only when an enquiry's status changes, so we can see
// couples coming back from Lost and how far ahead of the date they do.
export async function snapshotStatuses(enquiries, todayIsoStr, monthsTo) {
  const c = db();
  const { data: last } = await c.from('pipeline_status_log').select('enquiry_id, status, at').order('at', { ascending: false }).limit(20000);
  const latest = new Map();
  for (const r of last || []) if (!latest.has(r.enquiry_id)) latest.set(r.enquiry_id, r.status);
  const rows = enquiries
    .filter(e => e.status && latest.get(e.id) !== e.status)
    .map(e => ({ enquiry_id: e.id, status: e.status, at: new Date().toISOString(), months_to_event: monthsTo(e) }));
  if (rows.length) {
    const { error } = await c.from('pipeline_status_log').insert(rows);
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

export async function securityStatus() {
  const { data, error } = await db().rpc('orpi_security_status');
  if (error) return { app_state_director_only: false, activity_log_director_only: false, error: error.message };
  return data;
}
