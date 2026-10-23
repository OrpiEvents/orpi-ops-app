// Tracking helpers shared by the link builder, the /go redirect and the
// enquiry form. Pure functions — safe on server and client.

// Where a tracked link gets used. Each placement fills sensible UTM defaults so
// nobody has to remember the naming rules.
export const PLACEMENTS = {
  bio:      { label: 'Instagram bio link',               source: 'instagram', medium: 'social' },
  story:    { label: 'Instagram story link',             source: 'instagram', medium: 'social' },
  post:     { label: 'Instagram post / reel',            source: 'instagram', medium: 'social' },
  dm:       { label: 'Instagram DM reply',               source: 'instagram', medium: 'dm' },
  ad:       { label: 'Meta ad (Instagram / Facebook)',   source: 'meta',      medium: 'paid_social' },
  whatsapp: { label: 'WhatsApp message or status',       source: 'whatsapp',  medium: 'messaging' },
  email:    { label: 'Email signature or email',         source: 'email',     medium: 'email' },
  qr:       { label: 'QR code (bar signage, menus, cards)', source: 'event',  medium: 'qr' },
  partner:  { label: 'Venue or planner partner',         source: 'partner',   medium: 'referral' },
  tiktok:   { label: 'TikTok',                           source: 'tiktok',    medium: 'social' },
  other:    { label: 'Other',                            source: 'other',     medium: 'other' },
};

// "How did you hear about us?" — the answer maps onto the Sales Pipeline
// Source options so reporting stays on one list.
export const HEARD_OPTIONS = [
  { value: 'instagram', label: 'Instagram', source: 'Instagram' },
  { value: 'event', label: 'Saw ORPI at an event', source: 'Event Guest' },
  { value: 'referral', label: 'A friend or family recommendation', source: 'Referral' },
  { value: 'previous', label: 'We’ve worked with ORPI before', source: 'Previous Client' },
  { value: 'venue', label: 'Our venue', source: 'Venue' },
  { value: 'planner', label: 'Our wedding planner', source: 'Planner' },
  { value: 'google', label: 'Google', source: 'Google' },
  { value: 'tiktok', label: 'TikTok', source: 'TikTok' },
  { value: 'facebook', label: 'Facebook', source: 'Facebook' },
  { value: 'show', label: 'A wedding show', source: 'Wedding Show' },
  { value: 'other', label: 'Somewhere else', source: 'Other' },
];
export const heardToSource = v => HEARD_OPTIONS.find(o => o.value === v)?.source || 'Other';

export const EVENT_TYPES = ['Wedding Reception', 'Mendhi/Sangeet', 'Birthday', 'Corporate', 'Other'];
export const SERVICE_TYPES = [
  'Full Bar (ORPI supplies alcohol)', 'Bar Only (Client supplies alcohol)', 'Cocktail Experience',
  'Welcome Drinks', 'Mocktails Only', 'Custom',
];

export function slugify(s, max = 60) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;

// Adds UTM parameters to a destination, keeping any query string it already has.
export function buildUtmUrl(base, utm = {}) {
  let url;
  try { url = new URL(base); } catch { return base; }
  const map = { utm_source: utm.source, utm_medium: utm.medium, utm_campaign: utm.campaign, utm_content: utm.content, utm_term: utm.term };
  for (const [k, v] of Object.entries(map)) {
    if (v) url.searchParams.set(k, String(v).trim());
  }
  return url.toString();
}

// Link previews and crawlers (Instagram, WhatsApp, Facebook, search engines)
// fetch links too. They're logged but flagged, so click counts stay honest.
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|whatsapp|telegram|discord|skype|embedly|quora|pinterest|vkshare|w3c_validator|headless|lighthouse|curl|wget|python-requests|axios|node-fetch/i;
export const isBot = ua => !ua || BOT_RE.test(ua);

export function deviceOf(ua = '') {
  if (/ipad|tablet|kindle|playbook|silk|(android(?!.*mobile))/i.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function hostOf(urlish) {
  if (!urlish) return null;
  try { return new URL(urlish).hostname.replace(/^www\./, ''); } catch { return null; }
}

// The attribution keys the enquiry form carries from the landing URL.
export const ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'l', 'fbclid'];
