import { NextResponse } from 'next/server';
import { authorize } from '@/lib/apiAuth';
import { loadGrowth } from '@/lib/growthLoad';
import { todayIso, addDays, dayOf, adsSummary, affordableCostPerEnquiry, warmAudienceByStage, dormantPool } from '@/lib/growth';

// Ads: spend, results and what they turned into in the pipeline, plus the
// audiences worth building. Spend is visible to marketing (Reeya runs the
// ads); revenue and the £ maths behind the cost ceiling are directors only.
export const dynamic = 'force-dynamic';

export async function GET() {
  const { role, deny } = await authorize(['director', 'marketing']);
  if (deny) return deny;
  try {
    const d = await loadGrowth({ content: false });
    const director = role === 'director';
    const today = todayIso();
    const enquiriesById = Object.fromEntries(d.enquiries.map(e => [e.id, e]));
    const s30 = adsSummary(d.ads, addDays(today, -29), today, d.leads, enquiriesById);
    const s7 = adsSummary(d.ads, addDays(today, -6), today, d.leads, enquiriesById);
    const daily = [];
    for (let i = 29; i >= 0; i--) {
      const day = addDays(today, -i);
      const rows = d.ads.filter(r => dayOf(r.day) === day);
      daily.push({ day, label: day.slice(8, 10), spend: rows.reduce((t, r) => t + (Number(r.spend) || 0), 0), leads: rows.reduce((t, r) => t + (r.leads || 0), 0) });
    }
    const target = affordableCostPerEnquiry(d.enquiries, { acquisitionShare: Number(d.settings.acquisitionShare) || 0.1 });
    const strip = s => (director ? s : { ...s, campaigns: s.campaigns.map(c => ({ ...c, wonValue: undefined })) });
    const monthSpend = adsSummary(d.ads, `${today.slice(0, 7)}-01`, today, [], {}).totals.spend;
    return NextResponse.json({
      role, today, connected: d.connected,
      last30: strip(s30), last7: strip(s7), daily,
      budget: { monthly: d.settings.monthlyAdBudget ?? null, boostCeiling: d.settings.boostCeiling ?? null, monthSpend },
      target: target ? (director ? target : { value: target.value }) : null,
      audiences: { warm: warmAudienceByStage(d.enquiries, today), dormant: dormantPool(d.enquiries, today).count },
      pixel: d.meta.pixelId ? { id: d.meta.pixelId, name: d.meta.pixelName || '' } : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
