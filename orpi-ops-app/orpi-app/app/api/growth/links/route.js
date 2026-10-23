import { NextResponse } from 'next/server';
import { authorize } from '@/lib/apiAuth';
import { readGrowthData, createLink, updateLink } from '@/lib/growthStore';
import { updateContentItem } from '@/lib/notion';
import { linkStats, todayIso } from '@/lib/growth';
import { PLACEMENTS, slugify, SLUG_RE, buildUtmUrl } from '@/lib/tracking';
import { logActivity } from '@/lib/activityLog';

// Tracked links: create, list with clicks → enquiries, archive.
// Reeya and the directors can all make links; nothing here exposes clients.
export const dynamic = 'force-dynamic';

const linkOrigin = request => (process.env.GROWTH_LINK_ORIGIN || request.nextUrl.origin).replace(/\/+$/, '');
// UTM tags only make sense on web pages; WhatsApp/Instagram links are counted
// by the redirect itself.
const taggable = url => /^https?:\/\//.test(url) && !/(^|\.)(wa\.me|whatsapp\.com|instagram\.com|ig\.me)\b/.test(url.replace(/^https?:\/\//, '').split('/')[0]);

export async function GET(request) {
  const { deny } = await authorize(['director', 'marketing']);
  if (deny) return deny;
  try {
    const d = await readGrowthData({ days: 400 });
    const origin = linkOrigin(request);
    const rows = linkStats(d.links, d.clicks, d.leads, d.events, todayIso()).map(l => ({ ...l, shortUrl: `${origin}/go/${l.slug}` }));
    return NextResponse.json({ links: rows, placements: PLACEMENTS, origin, enquireUrl: `${request.nextUrl.origin}/enquire` });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(request) {
  const { user, deny } = await authorize(['director', 'marketing']);
  if (deny) return deny;
  const b = await request.json().catch(() => ({}));
  const placement = PLACEMENTS[b.placement] ? b.placement : 'other';
  const p = PLACEMENTS[placement];
  const label = String(b.label || '').trim().slice(0, 120);
  if (!label) return NextResponse.json({ error: 'Give the link a name, e.g. “Instagram bio” or “Mocktails reel”.' }, { status: 400 });
  const slug = slugify(b.slug || label);
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'The short name can only use letters, numbers and dashes.' }, { status: 400 });

  const base = String(b.destination || `${request.nextUrl.origin}/enquire`).trim();
  if (!/^https?:\/\//.test(base)) return NextResponse.json({ error: 'The destination needs to start with https://' }, { status: 400 });
  const utm = {
    source: slugify(b.utmSource || p.source, 40) || p.source,
    medium: slugify(b.utmMedium || p.medium, 40).replace(/-/g, '_') || p.medium,
    campaign: slugify(b.utmCampaign || '', 80) || null,
    content: slugify(b.utmContent || slug, 80),
  };
  const destination = taggable(base) ? buildUtmUrl(base, utm) : base;

  try {
    const row = await createLink({
      slug, label, base_url: base, destination, placement,
      utm_source: utm.source, utm_medium: utm.medium, utm_campaign: utm.campaign, utm_content: utm.content,
      content_page_id: b.contentPageId || null, created_by: user.email,
    });
    const shortUrl = `${linkOrigin(request)}/go/${slug}`;
    // Put the link on its Content Calendar post, so the daily sync can count
    // its clicks and enquiries against that post.
    if (b.contentPageId) await updateContentItem(b.contentPageId, { trackedLink: shortUrl }).catch(() => {});
    await logActivity({ userEmail: user.email, action: 'growth.link.create', target: label, detail: `${slug} → ${destination}` });
    return NextResponse.json({ link: { ...row, shortUrl } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function PATCH(request) {
  const { user, deny } = await authorize(['director', 'marketing']);
  if (deny) return deny;
  const b = await request.json().catch(() => ({}));
  if (!SLUG_RE.test(b.slug || '')) return NextResponse.json({ error: 'Unknown link' }, { status: 400 });
  try {
    const patch = {};
    if (typeof b.archived === 'boolean') patch.archived = b.archived;
    if (typeof b.label === 'string' && b.label.trim()) patch.label = b.label.trim().slice(0, 120);
    const row = await updateLink(b.slug, patch);
    await logActivity({ userEmail: user.email, action: 'growth.link.update', target: row.label, detail: JSON.stringify(patch) });
    return NextResponse.json({ link: row });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
