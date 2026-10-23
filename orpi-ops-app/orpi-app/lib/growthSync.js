// The daily job (and the "Sync now" button):
//   1. snapshot pipeline statuses, so comebacks from Lost are visible
//   2. pull Instagram account + post numbers, and Meta ads numbers
//   3. write the numbers back onto the Content Calendar posts they belong to
// Each step logs to growth_sync_log and can fail without stopping the others.
import { listEnquiries, listContentCalendar, updateContentItem } from './notion';
import { getMetaConfig, upsertRows, snapshotStatuses, logSync, readGrowthData } from './growthStore';
import { hasMeta, igDay, igFollowers, igMedia, adsInsights } from './meta';
import { todayIso, addDays, monthsBetween } from './growth';
import { igCode, slugFromTracked } from './growthLoad';

export async function runGrowthSync({ backfillDays } = {}) {
  const today = todayIso();
  const report = { ok: true, steps: {} };
  const step = async (name, fn) => {
    try {
      const detail = await fn();
      report.steps[name] = { ok: true, detail };
      await logSync(name, true, typeof detail === 'string' ? detail : JSON.stringify(detail));
    } catch (e) {
      report.ok = false;
      report.steps[name] = { ok: false, error: e.message };
      await logSync(name, false, e.message);
    }
  };

  await step('pipeline', async () => {
    const enquiries = await listEnquiries();
    const n = await snapshotStatuses(enquiries, today, e => (e.eventDate ? Math.round(monthsBetween(e.eventDate, today) * 10) / 10 : null));
    return `${n} status change${n === 1 ? '' : 's'} recorded (${enquiries.length} enquiries)`;
  });

  const meta = await getMetaConfig().catch(() => ({}));
  if (hasMeta() && meta.igUserId) {
    await step('instagram', async () => {
      // First run (or a gap): go back four weeks. Otherwise the last 3 days,
      // because Meta keeps adjusting recent numbers for a day or two.
      const store = await readGrowthData({ days: 40 });
      const days = backfillDays || (store.igDaily.length < 7 ? 28 : 3);
      // Seven days at a time in parallel keeps a 4-week backfill inside the
      // function time limit.
      const dayList = [];
      for (let i = days; i >= 1; i--) dayList.push(addDays(today, -i));
      const rows = [];
      for (let i = 0; i < dayList.length; i += 7) {
        rows.push(...await Promise.all(dayList.slice(i, i + 7).map(d => igDay(meta.igUserId, d).catch(() => ({ day: d })))));
      }
      // Followers is a "right now" number, so it's recorded against the last
      // full day; over time that builds the follower trend.
      const followers = await igFollowers(meta.igUserId).catch(() => null);
      const latest = rows.find(r => r.day === addDays(today, -1));
      if (latest && followers !== null) latest.followers = followers;
      const clean = rows.map(r => ({
        day: r.day, followers: r.followers ?? null, reach: r.reach ?? null, views: r.views ?? null,
        profile_views: r.profile_views ?? null, website_clicks: r.website_clicks ?? null, profile_links_taps: r.profile_links_taps ?? null,
        accounts_engaged: r.accounts_engaged ?? null, total_interactions: r.total_interactions ?? null, likes: r.likes ?? null,
        comments: r.comments ?? null, shares: r.shares ?? null, saves: r.saves ?? null, raw: r.raw ?? null, synced_at: new Date().toISOString(),
      }));
      await upsertRows('ig_daily', clean, 'day');
      const media = await igMedia(meta.igUserId, { sinceIso: addDays(today, -60), max: 40 });
      await upsertRows('ig_media', media, 'media_id');
      return `${clean.length} days, ${media.length} posts`;
    });
  }

  if (hasMeta() && meta.adAccountId) {
    await step('ads', async () => {
      // Meta keeps revising ad numbers for 28 days, so always re-read 28.
      const since = addDays(today, -Math.max(28, backfillDays || 0));
      const rows = await adsInsights(meta.adAccountId, since, addDays(today, -1));
      await upsertRows('ads_daily', rows, 'day,ad_id');
      return `${rows.length} ad-days since ${since}`;
    });
  }

  await step('content', async () => {
    const [items, store] = await Promise.all([listContentCalendar(), readGrowthData({ days: 120 })]);
    const byCode = new Map(store.igMedia.map(m => [igCode(m.permalink), m]));
    let updated = 0;
    for (const c of items) {
      const patch = {};
      const m = byCode.get(igCode(c.postUrl));
      if (m) {
        if (m.views !== null && m.views !== c.views) patch.views = m.views;
        if (m.reach !== null && m.reach !== c.reach) patch.reach = m.reach;
        if (m.saved !== null && m.saved !== c.saves) patch.saves = m.saved;
        if (m.shares !== null && m.shares !== c.shares) patch.shares = m.shares;
        if (m.profile_visits !== null && m.profile_visits !== c.profileVisits) patch.profileVisits = m.profile_visits;
      }
      const slug = slugFromTracked(c.trackedLink);
      if (slug) {
        const clicks = store.clicks.filter(x => x.slug === slug && !x.bot).length;
        const enquiries = store.leads.filter(l => l.link_slug === slug || l.utm_content === slug).length;
        if (clicks !== (c.linkClicks ?? 0)) patch.linkClicks = clicks;
        if (enquiries !== (c.enquiries ?? 0)) patch.enquiries = enquiries;
      }
      if (Object.keys(patch).length) { await updateContentItem(c.id, patch); updated++; }
    }
    return `${updated} of ${items.length} calendar posts updated`;
  });

  return report;
}
