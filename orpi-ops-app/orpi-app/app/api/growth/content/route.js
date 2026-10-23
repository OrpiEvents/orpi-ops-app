import { NextResponse } from 'next/server';
import { authorize } from '@/lib/apiAuth';
import { loadGrowth, igCode, slugFromTracked } from '@/lib/growthLoad';
import { todayIso, addDays, dayOf, contentCoverage, warmAudienceByStage, stageForCalendar, mediaScore } from '@/lib/growth';

// Content plan: the Notion Content Calendar, with each post's tracked-link
// clicks, enquiries and Instagram numbers alongside, plus how well the next
// fortnight speaks to the couples we're keeping warm.
export const dynamic = 'force-dynamic';

export async function GET() {
  const { deny } = await authorize(['director', 'marketing']);
  if (deny) return deny;
  try {
    const d = await loadGrowth({ bookings: false });
    const today = todayIso();
    const byCode = new Map(d.igMedia.map(m => [igCode(m.permalink), m]));
    const items = d.content.map(c => {
      const slug = slugFromTracked(c.trackedLink);
      const m = byCode.get(igCode(c.postUrl));
      return {
        ...c,
        stageKey: stageForCalendar(c.stage)?.key || (c.stage === 'Any stage' ? 'any' : ''),
        slug,
        live: {
          clicks: slug ? d.clicks.filter(x => x.slug === slug && !x.bot).length : null,
          enquiries: slug ? d.leads.filter(l => l.link_slug === slug || l.utm_content === slug).length : null,
          ig: m ? { views: m.views, reach: m.reach, saved: m.saved, shares: m.shares, profileVisits: m.profile_visits, score: mediaScore(m) } : null,
        },
      };
    });
    // Recent Instagram posts that aren't in the calendar yet, so they can be added.
    const known = new Set(items.map(i => igCode(i.postUrl)).filter(Boolean));
    const unmatched = d.igMedia
      .filter(m => !known.has(igCode(m.permalink)) && dayOf(m.posted_at) >= addDays(today, -30) && m.product_type !== 'STORY')
      .slice(0, 12)
      .map(m => ({ permalink: m.permalink, posted: dayOf(m.posted_at), type: m.product_type || m.media_type, caption: (m.caption || '').slice(0, 120), saved: m.saved, shares: m.shares, reach: m.reach }));
    return NextResponse.json({
      today,
      connected: d.connected,
      error: d.contentError,
      items,
      coverage: contentCoverage(d.content, today, addDays(today, 13)),
      warm: warmAudienceByStage(d.enquiries, today),
      unmatched,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
