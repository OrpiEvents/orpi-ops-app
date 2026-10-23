// The weekly brief — the agent's voice. Turns the numbers into a short list of
// what happened and what to do, split by who does it: Reeya (content, social,
// ads) and Ruds (pipeline, re-engagement, spend approval).
//
// Marketing logins never get client names, contact details or £ figures:
// director-only sections are dropped and money is only shown to directors.

import {
  todayIso, addDays, dayOf, daysBetween, prettyDate, STAGES, stageAtEnquiry, stageForCalendar,
  isWon, sourceTable, speedToQuote, dormantPool, warmAudienceByStage, reengagementQueue,
  linkStats, igSummary, adsSummary, affordableCostPerEnquiry, contentCoverage, comebacks, median, rate,
} from './growth';

const gbp = n => (n === null || n === undefined ? '—' : `£${Math.round(n).toLocaleString('en-GB')}`);
const pctS = n => (n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`);
const inRange = (iso, a, b) => { const d = dayOf(iso); return d && d >= a && d <= b; };

export function buildBrief(input) {
  const {
    role = 'marketing', enquiries = [], bookings = [], leads = [], links = [], clicks = [], events = [],
    igDaily = [], igMedia = [], ads = [], content = [], touches = [], statusLog = [], settings = {},
    connected = {}, today = todayIso(),
  } = input;
  const director = role === 'director';
  const money = n => (director ? gbp(n) : null);

  const wkFrom = addDays(today, -6), prevFrom = addDays(today, -13), prevTo = addDays(today, -7);
  const thisWeek = enquiries.filter(e => inRange(e.createdAt, wkFrom, today));
  const lastWeek = enquiries.filter(e => inRange(e.createdAt, prevFrom, prevTo));
  const quotedWk = enquiries.filter(e => inRange(e.dateQuoted, wkFrom, today));
  const wonWk = enquiries.filter(e => isWon(e) && inRange(e.dateDecided, wkFrom, today));
  const leadsByPage = Object.fromEntries(leads.map(l => [l.notion_page_id, l]));
  const enquiriesById = Object.fromEntries(enquiries.map(e => [e.id, e]));

  const sections = [];

  // 1 — the week in numbers ---------------------------------------------------
  const weekItems = [];
  const diff = thisWeek.length - lastWeek.length;
  weekItems.push({
    tone: 'info',
    text: `${thisWeek.length} new ${thisWeek.length === 1 ? 'enquiry' : 'enquiries'} this week (${diff === 0 ? 'same as' : diff > 0 ? `${diff} more than` : `${-diff} fewer than`} last week).`,
  });
  if (thisWeek.length) {
    const src = sourceTable(thisWeek, leadsByPage).map(r => `${r.source} ${r.enquiries}`).join(', ');
    weekItems.push({ tone: 'info', text: `Where they came from: ${src}.` });
    const stages = STAGES.map(s => ({ s, n: thisWeek.filter(e => stageAtEnquiry(e)?.key === s.key).length })).filter(x => x.n);
    if (stages.length) weekItems.push({ tone: 'info', text: `Planning stage when they enquired: ${stages.map(x => `${x.s.short} ${x.n}`).join(', ')}.` });
  }
  weekItems.push({
    tone: wonWk.length ? 'good' : 'info',
    text: `${quotedWk.length} ${quotedWk.length === 1 ? 'quote' : 'quotes'} sent, ${wonWk.length} won${director && wonWk.length ? ` (${gbp(wonWk.reduce((t, e) => t + (e.quoteSent || 0), 0))})` : ''}.`,
  });
  const stq = speedToQuote(enquiries, addDays(today, -29), today);
  if (stq.median !== null) {
    weekItems.push({
      tone: stq.median > 2 ? 'warn' : 'good',
      text: `Speed to quote (last 30 days): ${stq.median} ${stq.median === 1 ? 'day' : 'days'} median across ${stq.n}. ${stq.median > 2 ? 'Faster quotes win more; aim for within a day.' : 'Good: keep it under a day.'}`,
    });
  }
  sections.push({ key: 'week', title: 'This week in numbers', audience: 'all', items: weekItems });

  // 2 — content & social (Reeya) ------------------------------------------------
  const contentItems = [];
  if (!connected.content) {
    contentItems.push({ tone: 'warn', text: 'The app can’t read the Content Calendar yet. In Notion, open Content Calendar → ••• → Connections and add the ORPI integration.', link: '/growth/setup' });
  } else {
    const next7 = content.filter(c => inRange(c.date, today, addDays(today, 6))).sort((a, b) => a.date.localeCompare(b.date));
    if (!next7.length) {
      contentItems.push({ tone: 'warn', text: 'Nothing planned for the next 7 days. Pick two posts from the ideas list.', link: '/growth/content' });
    } else {
      contentItems.push({ tone: 'info', text: `${next7.length} ${next7.length === 1 ? 'post' : 'posts'} planned for the next 7 days.`, link: '/growth/content' });
      for (const c of next7) {
        const flags = [];
        const soon = daysBetween(c.date, today) <= 2;
        if (soon && ['Idea', 'Planned'].includes(c.status)) flags.push('not filmed yet');
        if (!c.trackedLink && /link in bio|DM/i.test(c.cta || '')) flags.push('needs a tracked link');
        if (!c.caption) flags.push('no caption');
        if (flags.length) contentItems.push({ tone: 'action', text: `${prettyDate(c.date, { today })}: “${c.post}” (${flags.join(', ')}).`, link: c.url });
      }
    }
    const postedNoUrl = content.filter(c => c.status === 'Posted' && !c.postUrl && inRange(c.date, addDays(today, -21), today));
    if (postedNoUrl.length) {
      contentItems.push({ tone: 'action', text: `${postedNoUrl.length} posted ${postedNoUrl.length === 1 ? 'item has' : 'items have'} no Instagram link yet. Paste the Post URL and the numbers fill in automatically: ${postedNoUrl.map(c => `“${c.post}”`).join(', ')}.` });
    }
    // Follow the warm audience: where are the couples we're keeping warm now,
    // and is the next fortnight's content speaking to them?
    const warm = warmAudienceByStage(enquiries, today);
    const cov = contentCoverage(content, today, addDays(today, 13));
    const top = [...warm].sort((a, b) => b.count - a.count)[0];
    if (top && top.count) {
      const plannedForTop = cov.byStage.find(s => s.key === top.key)?.count || 0;
      const stage = STAGES.find(s => s.key === top.key);
      contentItems.push({
        tone: plannedForTop ? 'good' : 'action',
        text: `Most of the couples we’re keeping warm (${top.count}) are now ${stage.short} from their date: ${stage.want.toLowerCase()}. ${plannedForTop ? `${plannedForTop} of the next fortnight’s posts ${plannedForTop === 1 ? 'speaks' : 'speak'} to them.` : `None of the next fortnight’s posts are aimed at them. Add one: ${stage.content.toLowerCase()}.`}`,
      });
    }
  }
  // Shoot list from booked events (no client names: date, type, venue only).
  const upcoming = bookings.filter(b => b.status === 'Confirmed Booking' && inRange(b.eventDate, today, addDays(today, 13)) && !b.marketingEvent)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  for (const b of upcoming) {
    contentItems.push({ tone: 'action', text: `Content to capture: ${b.eventType || 'event'} on ${prettyDate(b.eventDate, { today })}${b.venue ? ` at ${b.venue}` : ''}. Get the bar set-up, a signature serve being made, guests at the bar, and ask the couple for a review after.` });
  }
  if (connected.instagram) {
    const ig = igSummary(igDaily, igMedia, wkFrom, today);
    const igPrev = igSummary(igDaily, igMedia, prevFrom, prevTo);
    const bioSlugs = new Set(links.filter(l => l.placement === 'bio').map(l => l.slug));
    const bioClicks = clicks.filter(c => bioSlugs.has(c.slug) && !c.bot && inRange(c.at, wkFrom, today)).length;
    contentItems.push({
      tone: 'info',
      text: `Instagram this week: ${ig.posts} ${ig.posts === 1 ? 'post' : 'posts'}${ig.stories ? ` and ${ig.stories} ${ig.stories === 1 ? 'story' : 'stories'}` : ''}, ${ig.reach.toLocaleString('en-GB')} accounts reached (daily totals, incl. ads), ${ig.saves} saves, ${ig.shares} shares, ${ig.profileVisitsFromPosts} profile visits from posts${bioSlugs.size ? `, ${bioClicks} bio-link clicks` : ''}${ig.followersChange !== null ? `, followers ${ig.followersChange >= 0 ? '+' : ''}${ig.followersChange}` : ''}${igPrev.reach ? ` (reach ${ig.reach >= igPrev.reach ? 'up' : 'down'} on last week)` : ''}.`,
    });
    const fortnight = igSummary(igDaily, igMedia, addDays(today, -13), today);
    const best = fortnight.top[0];
    if (best && (best.saved || best.shares)) {
      contentItems.push({ tone: 'action', text: `Best performer of the fortnight: ${best.saved || 0} saves, ${best.shares || 0} shares${best.profile_visits ? `, ${best.profile_visits} profile visits` : ''}. Saves mean “I’m planning”, so it’s the one to boost to warm audiences (needs Ruds’s OK).`, link: best.permalink });
    }
  } else {
    contentItems.push({ tone: 'info', text: 'Instagram numbers will appear here once Instagram is connected.', link: '/growth/setup' });
  }
  const ls = linkStats(links, clicks, leads, events, today).filter(l => !l.archived);
  if (!ls.some(l => l.placement === 'bio')) {
    contentItems.push({ tone: 'action', text: 'There’s no tracked bio link yet. Create one (placement “Instagram bio link”) and put it in the bio, so every bio enquiry is counted.', link: '/growth/links' });
  }
  const leaky = ls.filter(l => l.clicks30 >= 15 && l.enquiries === 0);
  for (const l of leaky) contentItems.push({ tone: 'warn', text: `“${l.label}” had ${l.clicks30} clicks in 30 days but no enquiries. Check where it lands and that the page asks clearly.`, link: '/growth/links' });
  sections.push({ key: 'content', title: 'Content & social', audience: 'all', items: contentItems });

  // 3 — ads ---------------------------------------------------------------------
  const adItems = [];
  if (!connected.ads) {
    adItems.push({ tone: 'info', text: 'Ads aren’t connected yet. The launch plan and set-up steps are on the Ads page.', link: '/growth/ads' });
  } else {
    const wk = adsSummary(ads, wkFrom, today, leads, enquiriesById);
    const month = adsSummary(ads, `${today.slice(0, 7)}-01`, today, leads, enquiriesById);
    const ceiling = Number(settings.monthlyAdBudget) || null;
    adItems.push({
      tone: 'info',
      text: `This week: ${gbp(wk.totals.spend)} spent, ${wk.totals.linkClicks} link clicks, ${wk.totals.leads} lead-form ${wk.totals.leads === 1 ? 'lead' : 'leads'}${wk.totals.costPerLead ? ` (${gbp(wk.totals.costPerLead)} each)` : ''}, ${wk.paidEnquiries} ${wk.paidEnquiries === 1 ? 'enquiry' : 'enquiries'} from paid links.`,
    });
    if (ceiling) {
      const dayOfMonth = +today.slice(8, 10);
      const daysInMonth = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate();
      const pace = month.totals.spend / (ceiling * dayOfMonth / daysInMonth);
      adItems.push({
        tone: pace > 1.15 ? 'warn' : 'info',
        text: `Month to date: ${gbp(month.totals.spend)} of the ${gbp(ceiling)} ceiling${pace > 1.15 ? ', ahead of pace, so trim daily budgets' : ''}.`,
      });
    }
    const target = affordableCostPerEnquiry(enquiries, { acquisitionShare: Number(settings.acquisitionShare) || 0.1 });
    for (const c of wk.campaigns) {
      if (c.avgFrequency && c.avgFrequency > 3.5) adItems.push({ tone: 'warn', text: `“${c.campaign}”: people are seeing it ${c.avgFrequency.toFixed(1)} times on average. Swap in fresh creative before it wears out.` });
      if (target && c.spend > target.value * 2 && !c.enquiries && !c.leads) adItems.push({ tone: 'warn', text: `“${c.campaign}”: ${gbp(c.spend)} spent this week with no enquiries yet. Worth pausing or changing the creative (Ruds to approve).` });
    }
    if (director && target) {
      adItems.push({ tone: 'info', text: `Rule of thumb: you can afford up to about ${gbp(target.value)} per enquiry (average booking ${gbp(target.avgWon)} × ${pctS(target.winRate)} win rate × ${pctS(target.acquisitionShare)} of revenue on acquisition).` });
    }
  }
  sections.push({ key: 'ads', title: 'Ads', audience: 'all', items: adItems });

  // 4 — pipeline & re-engagement (Ruds only) ---------------------------------------
  if (director) {
    const pipeItems = [];
    const queue = reengagementQueue({ enquiries, bookings, touches, today });
    const replies = queue.filter(q => q.touch.kind === 'reply');
    const quotes = queue.filter(q => q.touch.kind === 'quote');
    const dates = queue.filter(q => q.touch.kind === 'date');
    const names = (list, f = q => q.name) => (list.length > 6 ? `${list.slice(0, 6).map(f).join(', ')} and ${list.length - 6} more` : list.map(f).join(', '));
    if (replies.length) pipeItems.push({ tone: 'action', text: `${replies.length} new ${replies.length === 1 ? 'enquiry is' : 'enquiries are'} waiting on a reply: ${names(replies)}.`, link: '/growth/reengage' });
    if (quotes.length) pipeItems.push({ tone: 'action', text: `${quotes.length} ${quotes.length === 1 ? 'quote is' : 'quotes are'} due a follow-up (day 2 / 5 / 10): ${names(quotes)}.`, link: '/growth/reengage' });
    if (dates.length) pipeItems.push({ tone: 'action', text: `${dates.length} quiet ${dates.length === 1 ? 'couple has' : 'couples have'} reached a date milestone: ${names(dates, q => `${q.name} (${q.touch.label})`)}. Messages are drafted.`, link: '/growth/reengage' });
    if (!queue.length) pipeItems.push({ tone: 'good', text: 'No follow-ups due this week.' });
    const clashes = queue.filter(q => q.dateClash);
    if (clashes.length) pipeItems.push({ tone: 'warn', text: `Date already has a booking for: ${clashes.map(q => q.name).join(', ')}. Check capacity before offering it; the drafts don’t claim the date is free.` });
    const pool = dormantPool(enquiries, today);
    if (pool.count) {
      pipeItems.push({ tone: 'info', text: `Dormant pool: ${pool.count} couples, ${gbp(pool.value)} of quotes, dates still ahead. By stage now: ${pool.byStage.filter(s => s.count).map(s => `${s.label} ${s.count}`).join(', ')}.` });
    }
    const cb = comebacks(statusLog).filter(c => dayOf(c.at) >= addDays(today, -30));
    if (cb.length) {
      const m = median(cb.map(c => c.monthsToEvent).filter(x => x !== null && x !== undefined));
      pipeItems.push({ tone: 'good', text: `${cb.length} ${cb.length === 1 ? 'couple' : 'couples'} came back from Lost in the last 30 days${m !== null ? `, typically ${m.toFixed(1)} months before their date` : ''}.` });
    }
    sections.push({ key: 'pipeline', title: 'Pipeline & follow-ups', audience: 'director', items: pipeItems });
  }

  // 5 — what the data's teaching us -----------------------------------------------
  const learn = [];
  const last90 = enquiries.filter(e => inRange(e.createdAt, addDays(today, -89), today));
  const leadTimes = enquiries.filter(e => /wedding/i.test(e.eventType || '')).map(e => e.leadTimeMonths).filter(m => typeof m === 'number' && m >= 0);
  const mLead = median(leadTimes);
  if (mLead !== null) learn.push({ tone: 'info', text: `Weddings enquire a median ${mLead.toFixed(1)} months ahead (${leadTimes.length} weddings), so most couples are shortlisting when they first reach out.` });
  const table = sourceTable(enquiries, leadsByPage).filter(r => r.decided >= 3);
  if (table.length >= 2) {
    const best = [...table].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];
    const biggest = table[0];
    if (best.source !== biggest.source) learn.push({ tone: 'info', text: `${biggest.source} brings the most enquiries (${biggest.enquiries}) but ${best.source} converts best (${pctS(best.winRate)} vs ${pctS(biggest.winRate)}). Proof and warm intros close the gap.` });
  }
  if (last90.length) learn.push({ tone: 'info', text: `${last90.length} enquiries in the last 90 days.` });
  sections.push({ key: 'learn', title: 'What the data says', audience: 'all', items: learn });

  return {
    generatedAt: new Date().toISOString(),
    today,
    role,
    sections: sections.filter(s => director || s.audience === 'all'),
    money: director,
  };
}

// Plain text, for an email or a Notion page.
export function briefToText(brief) {
  const lines = [`ORPI weekly brief · ${prettyDate(brief.today, { year: true })}`, ''];
  for (const s of brief.sections) {
    lines.push(s.title.toUpperCase());
    for (const i of s.items) lines.push(`${i.tone === 'action' ? '→' : i.tone === 'warn' ? '!' : '•'} ${i.text}`);
    lines.push('');
  }
  return lines.join('\n');
}
