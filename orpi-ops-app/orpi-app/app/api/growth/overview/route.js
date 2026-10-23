import { NextResponse } from 'next/server';
import { authorize } from '@/lib/apiAuth';
import { loadGrowth } from '@/lib/growthLoad';
import {
  todayIso, addDays, dayOf, isWon, isDecided, monthlySeries, sourceTable, stageTable, warmAudienceByStage,
  dormantPool, speedToQuote, linkStats, igSummary, adsSummary, contentCoverage, median, rate,
} from '@/lib/growth';

// Growth overview: the full funnel on one page. Directors get £ and the
// dormant pool's value; a marketing login gets counts and rates only.
export const dynamic = 'force-dynamic';
const inRange = (iso, a, b) => { const d = dayOf(iso); return d && d >= a && d <= b; };

export async function GET() {
  const { role, deny } = await authorize(['director', 'marketing']);
  if (deny) return deny;
  try {
    const d = await loadGrowth();
    const director = role === 'director';
    const today = todayIso();
    const d30 = addDays(today, -29), p30a = addDays(today, -59), p30b = addDays(today, -30), y1 = addDays(today, -364);
    const year = d.enquiries.filter(e => inRange(e.createdAt, y1, today));
    const last30 = d.enquiries.filter(e => inRange(e.createdAt, d30, today));
    const prev30 = d.enquiries.filter(e => inRange(e.createdAt, p30a, p30b));
    const leadsByPage = Object.fromEntries(d.leads.map(l => [l.notion_page_id, l]));
    const enquiriesById = Object.fromEntries(d.enquiries.map(e => [e.id, e]));
    const weddingLead = median(year.filter(e => /wedding/i.test(e.eventType || '')).map(e => e.leadTimeMonths).filter(m => typeof m === 'number' && m >= 0));

    const sources = sourceTable(year, leadsByPage).map(r => (director ? r : { source: r.source, enquiries: r.enquiries, decided: r.decided, won: r.won, winRate: r.winRate }));
    const pool = dormantPool(d.enquiries, today);
    const humanClicks30 = d.clicks.filter(c => !c.bot && inRange(c.at, d30, today)).length;
    const ev = k => d.events.filter(e => e.kind === k && inRange(e.at, d30, today)).length;

    const body = {
      role, today, connected: d.connected,
      kpis: {
        enquiries30: last30.length,
        enquiriesPrev30: prev30.length,
        quotes30: d.enquiries.filter(e => inRange(e.dateQuoted, d30, today)).length,
        won30: d.enquiries.filter(e => isWon(e) && inRange(e.dateDecided, d30, today)).length,
        winRate12m: rate(year.filter(isWon).length, year.filter(isDecided).length),
        weddingLeadMonths: weddingLead,
        speedToQuote30: speedToQuote(d.enquiries, d30, today),
        ...(director ? { wonValue30: d.enquiries.filter(e => isWon(e) && inRange(e.dateDecided, d30, today)).reduce((t, e) => t + (e.quoteSent || 0), 0) } : {}),
      },
      monthly: monthlySeries(d.enquiries, 12, today),
      sources,
      stages: stageTable(year),
      warm: warmAudienceByStage(d.enquiries, today),
      dormant: director ? { count: pool.count, value: pool.value, byStage: pool.byStage } : { count: pool.count, byStage: pool.byStage.map(s => ({ key: s.key, label: s.label, count: s.count })) },
      funnel30: {
        clicks: humanClicks30, formViews: ev('form_view'), formStarts: ev('form_start'), formSubmits: ev('form_submit'),
        enquiries: last30.length, quotes: d.enquiries.filter(e => inRange(e.dateQuoted, d30, today)).length,
        won: d.enquiries.filter(e => isWon(e) && inRange(e.dateDecided, d30, today)).length,
      },
      links: linkStats(d.links.filter(l => !l.archived), d.clicks, d.leads, d.events, today).sort((a, b) => b.clicks30 - a.clicks30).slice(0, 6)
        .map(l => ({ slug: l.slug, label: l.label, placement: l.placement, clicks30: l.clicks30, enquiries: l.enquiries })),
      ig: d.connected.instagram ? {
        now: igSummary(d.igDaily, d.igMedia, d30, today),
        prev: igSummary(d.igDaily, d.igMedia, p30a, p30b),
        // Instagram has no bio-link metric; the tracked bio link is the count.
        bioClicks: (() => {
          const bio = new Set(d.links.filter(l => l.placement === 'bio').map(l => l.slug));
          return bio.size ? d.clicks.filter(c => bio.has(c.slug) && !c.bot && inRange(c.at, d30, today)).length : null;
        })(),
      } : null,
      ads: d.connected.ads ? (() => {
        const s = adsSummary(d.ads, d30, today, d.leads, enquiriesById);
        if (!director) s.campaigns = s.campaigns.map(c => ({ ...c, wonValue: undefined }));
        return s;
      })() : null,
      content: { coverage: contentCoverage(d.content, today, addDays(today, 13)), next7: d.content.filter(c => inRange(c.date, today, addDays(today, 6))).length, error: d.contentError },
      lastSync: d.syncLog[0] || null,
    };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
