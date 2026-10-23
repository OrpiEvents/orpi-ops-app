// The growth agent's rules. Pure functions, no I/O — the API routes fetch the
// data (Notion, Supabase, Meta) and hand it in, so the dashboard, the weekly
// brief and the re-engagement queue all reason the same way.
//
// The idea underneath all of it (from Ruds): a mobile bar is a WANT. Couples
// come back as the wedding gets closer and the budget opens up, so a quiet
// lead with a future date is kept warm, never written off.

export const DAY_MS = 86400000;
const MONTH_DAYS = 30.44;

// ---- dates ----------------------------------------------------------------
// Everything works in whole UK calendar days ('YYYY-MM-DD').
export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export const dayOf = iso => (iso ? String(iso).slice(0, 10) : '');
const toUtc = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export function addDays(iso, n) {
  const d = new Date(toUtc(dayOf(iso)) + n * DAY_MS);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(laterIso, earlierIso) {
  if (!laterIso || !earlierIso) return null;
  return Math.round((toUtc(dayOf(laterIso)) - toUtc(dayOf(earlierIso))) / DAY_MS);
}
export function monthsBetween(laterIso, earlierIso) {
  const d = daysBetween(laterIso, earlierIso);
  return d === null ? null : d / MONTH_DAYS;
}
export function prettyDate(iso, { year = 'auto', today } = {}) {
  if (!iso) return '';
  const d = new Date(toUtc(dayOf(iso)) + 12 * 3600000);
  const showYear = year === true || (year === 'auto' && dayOf(iso).slice(0, 4) !== (today || todayIso()).slice(0, 4));
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', ...(showYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).replace(',', '');
}
const monthKey = iso => dayOf(iso).slice(0, 7);

// ---- planning stages ------------------------------------------------------
// Where a couple is in their planning, by months until the event. Matches the
// Sales Pipeline "Planning Stage" formula and the Content Calendar "Stage".
export const STAGES = [
  { key: 'dream', label: '12m+ inspiration', short: '12m+', min: 12, calendar: '12+ months - inspiration',
    want: 'Inspiration and big decisions', content: 'Real-wedding reels, bar set-ups, signature cocktails' },
  { key: 'shortlist', label: '6–12m shortlisting', short: '6–12m', min: 6, calendar: '6-9 months - shortlisting',
    want: 'Shortlisting suppliers', content: 'Proof, past couples’ words, what’s included, packages' },
  { key: 'budget', label: '3–6m budgets settle', short: '3–6m', min: 3, calendar: '3-4 months - budgets settle',
    want: 'Budgets settle, extras come back in', content: 'Flexible packages, mocktail bars, welcome drinks' },
  { key: 'final', label: '<3m final touches', short: '<3m', min: 0, calendar: '6-8 weeks - final touches',
    want: 'Final touches, gaps in the plan', content: 'Availability, behind the scenes, last-minute wins' },
];
export const stageByKey = k => STAGES.find(s => s.key === k) || null;
export function stageForMonths(m) {
  if (m === null || m === undefined || Number.isNaN(m) || m < 0) return null;
  return STAGES.find(s => m >= s.min) || null;
}
export const stageForCalendar = opt => STAGES.find(s => s.calendar === opt) || null;

// Stage when they enquired (what drew them in) vs stage now (what they need
// to see from us today).
export function stageAtEnquiry(e) {
  const m = e.leadTimeMonths ?? (e.eventDate && e.createdAt ? monthsBetween(e.eventDate, e.createdAt) : null);
  return stageForMonths(m);
}
export function stageNow(e, today = todayIso()) {
  return e.eventDate ? stageForMonths(monthsBetween(e.eventDate, today)) : null;
}

// ---- status helpers -------------------------------------------------------
export const isWon = e => e.status === 'Won';
export const isLost = e => e.status === 'Lost';
export const isDecided = e => isWon(e) || isLost(e);
export const isOpen = e => ['New', 'Contacted', 'Quote Sent'].includes(e.status);
export const isWedding = e => /wedding|mendhi|sangeet/i.test(e.eventType || '');
// Losses that are really "not yet" — the dormant pool. A firm no (another
// supplier, cancelled, not a fit, date gone) is left alone.
const REVIVABLE_LOSS = new Set(['No response', 'Price', '']);

// Source label, splitting paid from organic social when the attribution says so.
export function sourceLabel(e, lead) {
  const s = e.source || 'Not recorded';
  if (s === 'Instagram' || s === 'Facebook') {
    const medium = (lead?.utm_medium || '').toLowerCase();
    const paid = medium.includes('paid') || medium === 'cpc' || !!lead?.meta_lead_id || e.channel === 'Meta lead form';
    return paid ? `${s} (paid)` : s;
  }
  return s;
}

// ---- small stats ----------------------------------------------------------
export function median(nums) {
  const a = nums.filter(n => typeof n === 'number' && !Number.isNaN(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
export const rate = (n, d) => (d ? n / d : null);
const sum = (arr, f = x => x) => arr.reduce((t, x) => t + (Number(f(x)) || 0), 0);
const inRange = (iso, from, to) => { const d = dayOf(iso); return d && d >= from && d <= to; };

// ---- pipeline tables ------------------------------------------------------
export function sourceTable(enquiries, leadsByPage = {}) {
  const rows = new Map();
  for (const e of enquiries) {
    const key = sourceLabel(e, leadsByPage[e.id]);
    const r = rows.get(key) || { source: key, enquiries: 0, decided: 0, won: 0, quoted: 0, quotedValue: 0, wonValue: 0 };
    r.enquiries++;
    if (isDecided(e)) r.decided++;
    if (isWon(e)) { r.won++; r.wonValue += e.quoteSent || 0; }
    if (e.quoteSent) { r.quoted++; r.quotedValue += e.quoteSent; }
    rows.set(key, r);
  }
  return [...rows.values()]
    .map(r => ({ ...r, winRate: rate(r.won, r.decided), avgWon: r.won ? r.wonValue / r.won : null }))
    .sort((a, b) => b.enquiries - a.enquiries);
}

export function stageTable(enquiries) {
  return STAGES.map(s => {
    const list = enquiries.filter(e => stageAtEnquiry(e)?.key === s.key);
    const decided = list.filter(isDecided);
    const won = list.filter(isWon);
    return { key: s.key, label: s.label, enquiries: list.length, decided: decided.length, won: won.length, winRate: rate(won.length, decided.length) };
  });
}

export function monthlySeries(enquiries, months = 12, today = todayIso()) {
  const out = [];
  const [y, m] = [+today.slice(0, 4), +today.slice(5, 7)];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    const list = enquiries.filter(e => monthKey(e.createdAt) === key);
    out.push({
      month: key,
      label: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      enquiries: list.length,
      won: list.filter(isWon).length,
    });
  }
  return out;
}

export function speedToQuote(enquiries, fromIso, toIso) {
  const days = enquiries
    .filter(e => e.dateQuoted && e.createdAt && inRange(e.createdAt, fromIso, toIso))
    .map(e => daysBetween(e.dateQuoted, e.createdAt))
    .filter(d => d !== null && d >= 0);
  return { median: median(days), n: days.length };
}

// Quiet leads whose date is still ahead, grouped by where they are NOW.
export function dormantPool(enquiries, today = todayIso()) {
  const list = enquiries.filter(e => {
    if (!e.eventDate || dayOf(e.eventDate) <= today) return false;
    if (isLost(e)) return REVIVABLE_LOSS.has(e.lostReason || '');
    // A quote that's been quiet three weeks is dormant in all but name.
    if (e.status === 'Quote Sent' && e.dateQuoted) return daysBetween(today, e.dateQuoted) > 21;
    return false;
  });
  const byStage = STAGES.map(s => {
    const inStage = list.filter(e => stageNow(e, today)?.key === s.key);
    return { key: s.key, label: s.label, count: inStage.length, value: sum(inStage, e => e.quoteSent) };
  });
  return { count: list.length, value: sum(list, e => e.quoteSent), byStage, list };
}

// The warm audience ages through the stages, so content should follow it:
// everyone open or dormant with a future date, by stage today.
export function warmAudienceByStage(enquiries, today = todayIso()) {
  const warm = enquiries.filter(e => e.eventDate && dayOf(e.eventDate) > today && !isWon(e)
    && (isOpen(e) || (isLost(e) && REVIVABLE_LOSS.has(e.lostReason || ''))));
  return STAGES.map(s => ({ key: s.key, label: s.label, count: warm.filter(e => stageNow(e, today)?.key === s.key).length }));
}

// Pipeline status changes (from the daily snapshot) → couples who came back,
// and how far ahead of the event they did.
export function comebacks(statusLog = []) {
  const byEnquiry = new Map();
  for (const r of [...statusLog].sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
    const arr = byEnquiry.get(r.enquiry_id) || [];
    arr.push(r);
    byEnquiry.set(r.enquiry_id, arr);
  }
  const out = [];
  for (const [id, rows] of byEnquiry) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i - 1].status === 'Lost' && ['Contacted', 'Quote Sent', 'Won'].includes(rows[i].status)) {
        out.push({ enquiryId: id, at: rows[i].at, to: rows[i].status, monthsToEvent: rows[i].months_to_event });
      }
    }
  }
  return out;
}

// ---- re-engagement clock ----------------------------------------------------
// After a quote: day 2 / 5 / 10. Then, if it's gone quiet, on the
// wedding-date clock: about 6 months, 3 months and 6–8 weeks before.
export const TOUCHES = [
  { key: 'r1', kind: 'reply', label: 'Reply to new enquiry', after: 1 },
  { key: 'q2', kind: 'quote', label: 'Day 2 · check-in', after: 2 },
  { key: 'q5', kind: 'quote', label: 'Day 5 · what’s included', after: 5 },
  { key: 'q10', kind: 'quote', label: 'Day 10 · tailor to budget', after: 10 },
  { key: 'm6', kind: 'date', label: '~6 months out', before: 183 },
  { key: 'm3', kind: 'date', label: '~3 months out', before: 91 },
  { key: 'w7', kind: 'date', label: '6–8 weeks out', before: 49 },
];
const QUOTE_TOUCHES = TOUCHES.filter(t => t.kind === 'quote');
const DATE_TOUCHES = TOUCHES.filter(t => t.kind === 'date');

function eventWord(eventType) {
  if (/wedding/i.test(eventType || '')) return 'wedding';
  if (/mendhi|sangeet/i.test(eventType || '')) return 'celebration';
  if (/birthday/i.test(eventType || '')) return 'birthday';
  return 'event';
}
export function firstNameOf(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'there';
  if (/&| and /i.test(clean)) return clean;            // "Priya & Arjun" — keep both
  return clean.split(' ')[0];
}
// UK numbers live in Notion as plain numbers (the leading 0 is lost).
export function waNumber(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('44')) return digits;
  if (digits.startsWith('0')) return `44${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('7')) return `44${digits}`;
  return digits;
}

// Drafts only — Ruds reads, edits and sends. Honest by construction: "your
// date's still open" only appears when no other booking sits on that date.
// Date-clock messages are marketing, so each one carries an easy way to say no
// (UK PECR: every marketing message needs a simple opt-out). A reply like that
// means setting Marketing to "Opted out" in Notion; the queue then skips them.
const OPT_OUT = ' (If you’ve gone another way or would rather I didn’t message, just say and I won’t again.)';

export function draftMessage(touchKey, ctx) {
  const { first, word, when, dateFree, proofLink, includedLink } = ctx;
  const proof = proofLink ? ` Here’s one we did recently: ${proofLink}` : '';
  const included = includedLink ? ` ${includedLink}` : '';
  switch (touchKey) {
    case 'r1':
      return `Hi ${first}! Thanks so much for getting in touch about your ${word}${when ? ` on ${when}` : ''}. I’ll put a quote together for you. Quick question first: roughly how long would you like the bar open, and are you thinking cocktails, mocktails or both?`;
    case 'q2':
      return `Hi ${first}, just checking the quote came through OK for your ${word}${when ? ` on ${when}` : ''}.${proof} Any questions at all, just shout.`;
    case 'q5':
      return `Hi ${first}, thought it might help to see everything that comes with your ORPI bar in one place: bar team, glassware, ice, garnishes, menus, set-up and pack-down, so there’s no overlap with your caterers.${included} Happy to talk it through.`;
    case 'q10':
      return `Hi ${first}, I know budgets move around a lot when you’re planning a ${word}. If it helps, we can tailor the package to yours: welcome drinks only, a mocktail bar, or bar-only where you supply the alcohol. Want me to put a couple of options together?`;
    case 'm6':
      return `Hi ${first}, hope the planning’s going well! Your ${word} on ${when} is about six months away now${dateFree ? ', and your date’s still open with us' : ''}. If a bar’s still on the list, I’d love to help you get it sorted.${proof}${OPT_OUT}`;
    case 'm3':
      return `Hi ${first}, about three months to go until your ${word}! This is usually when budgets settle, so if you’d like, I can put together a package around yours, even just welcome drinks or a mocktail bar. Shall I send a couple of options?${OPT_OUT}`;
    case 'w7':
      return dateFree
        ? `Hi ${first}, your ${word} on ${when} is only a few weeks away! We’ve still got your date free, so if you’d like a bar we can turn things around quickly. Just say the word.${OPT_OUT}`
        : `Hi ${first}, your ${word} on ${when} is only a few weeks away! If you’d still like a bar, let me know and I’ll check what we can do for your date.${OPT_OUT}`;
    default:
      return '';
  }
}

export function reengagementQueue({ enquiries, bookings = [], touches = [], today = todayIso(), proofLink = '', includedLink = '' }) {
  const bookedDates = new Map();
  for (const b of bookings) {
    if (!b.eventDate || !['Confirmed Booking', 'Completed'].includes(b.status)) continue;
    const d = dayOf(b.eventDate);
    bookedDates.set(d, (bookedDates.get(d) || 0) + 1);
  }
  const doneSet = new Set(touches.filter(t => t.action === 'sent' || t.action === 'skipped').map(t => `${t.enquiry_id}|${t.touch_key}`));
  const snoozed = new Map();
  for (const t of touches) {
    if (t.action === 'snoozed' && t.snooze_until && t.snooze_until > today) snoozed.set(`${t.enquiry_id}|${t.touch_key}`, t.snooze_until);
  }
  const open = (e, k) => !doneSet.has(`${e.id}|${k}`) && !snoozed.has(`${e.id}|${k}`);

  const items = [];
  for (const e of enquiries) {
    if (isWon(e) || e.marketing === 'Opted out') continue;
    const eventDay = dayOf(e.eventDate);
    if (eventDay && eventDay <= today) continue;          // date has passed
    if (isLost(e) && !REVIVABLE_LOSS.has(e.lostReason || '')) continue;

    let touch = null;
    let due = null;

    if (e.status === 'New') {
      const created = dayOf(e.createdAt);
      if (created && daysBetween(today, created) >= 1 && open(e, 'r1')) { touch = TOUCHES[0]; due = addDays(created, 1); }
    } else if (e.status === 'Quote Sent' && e.dateQuoted && daysBetween(today, e.dateQuoted) <= 21) {
      // The latest quote touch that's come due and not been done; an earlier
      // one that was missed is superseded rather than stacked.
      for (const t of [...QUOTE_TOUCHES].reverse()) {
        const d = addDays(e.dateQuoted, t.after);
        if (d <= today) { if (open(e, t.key)) { touch = t; due = d; } break; }
      }
    } else if (eventDay) {
      // Dormant: on the wedding-date clock. Only milestones that fell after
      // they enquired, only one at a time, and never within three weeks of
      // the enquiry or the quote — a fresh lead isn't a dormant one.
      const lastContact = [dayOf(e.createdAt), dayOf(e.dateQuoted)].filter(Boolean).sort().pop();
      if (lastContact && daysBetween(today, lastContact) < 21) continue;
      for (let i = 0; i < DATE_TOUCHES.length; i++) {
        const t = DATE_TOUCHES[i];
        // The 6- and 3-month "budgets open up" touches are a wedding pattern;
        // birthdays and corporate events only get the final few-weeks check-in.
        if (t.key !== 'w7' && !isWedding(e)) continue;
        const d = addDays(eventDay, -t.before);
        const next = DATE_TOUCHES[i + 1] ? addDays(eventDay, -DATE_TOUCHES[i + 1].before) : eventDay;
        const enquiredBefore = !e.createdAt || dayOf(e.createdAt) <= addDays(d, -7);
        if (today >= d && today < next && enquiredBefore && open(e, t.key)) { touch = t; due = d; break; }
      }
    }
    if (!touch) continue;

    const bookedThatDay = eventDay ? bookedDates.get(eventDay) || 0 : 0;
    const ctx = {
      first: firstNameOf(e.name),
      word: eventWord(e.eventType),
      when: eventDay ? prettyDate(eventDay, { today }) : '',
      dateFree: !!eventDay && bookedThatDay === 0,
      proofLink, includedLink,
    };
    const draft = draftMessage(touch.key, ctx);
    const wa = waNumber(e.phone);
    items.push({
      enquiryId: e.id,
      url: e.url,
      name: e.name,
      eventDate: eventDay,
      eventType: e.eventType,
      guestCount: e.guestCount,
      venue: e.venue,
      quote: e.quoteSent || null,
      source: e.source,
      status: e.status,
      lostReason: e.lostReason,
      stageNow: stageNow(e, today)?.label || '',
      touch: { key: touch.key, label: touch.label, kind: touch.kind },
      due,
      overdueDays: daysBetween(today, due),
      dateClash: bookedThatDay > 0,
      channel: wa ? 'WhatsApp' : e.email ? 'Email' : 'Instagram DM',
      email: e.email || '',
      waLink: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(draft)}` : '',
      mailLink: e.email ? `mailto:${e.email}?subject=${encodeURIComponent(`Your ${ctx.word}${ctx.when ? ` on ${ctx.when}` : ''}`)}&body=${encodeURIComponent(draft)}` : '',
      draft,
    });
  }
  const order = { reply: 0, quote: 1, date: 2 };
  return items.sort((a, b) => (order[a.touch.kind] - order[b.touch.kind]) || String(a.eventDate || '9999').localeCompare(String(b.eventDate || '9999')));
}

// ---- links, Instagram, ads --------------------------------------------------
export function linkStats(links = [], clicks = [], leads = [], events = [], today = todayIso()) {
  const d7 = addDays(today, -6), d30 = addDays(today, -29);
  return links.map(l => {
    const c = clicks.filter(x => x.slug === l.slug && !x.bot);
    const views = events.filter(x => x.kind === 'form_view' && x.link_slug === l.slug).length;
    const enq = leads.filter(x => x.link_slug === l.slug).length;
    return {
      ...l,
      clicks7: c.filter(x => dayOf(x.at) >= d7).length,
      clicks30: c.filter(x => dayOf(x.at) >= d30).length,
      clicksAll: c.length,
      botClicks: clicks.filter(x => x.slug === l.slug && x.bot).length,
      formViews: views,
      enquiries: enq,
      conversion: rate(enq, c.length),
    };
  });
}

// Saves and shares are the "I'm planning, keep this" signals, so they weigh
// most when picking what to boost.
export const mediaScore = m => (m.saved || 0) * 3 + (m.shares || 0) * 3 + (m.profile_visits || 0) * 2 + (m.follows || 0) * 4 + (m.likes || 0) * 0.5 + (m.comments || 0);

// Instagram no longer reports account-level profile views or website clicks
// (removed 2025), so profile visits come from the posts themselves (feed and
// stories; reels don't report them) and bio-link clicks come from the tracked
// /go/ bio link. Account reach and views include people reached by ads.
export function igSummary(daily = [], media = [], fromIso, toIso) {
  const days = daily.filter(d => inRange(d.day, fromIso, toIso)).sort((a, b) => a.day.localeCompare(b.day));
  const withFollowers = days.filter(d => d.followers !== null && d.followers !== undefined);
  const posts = media.filter(m => inRange(m.posted_at, fromIso, toIso));
  return {
    days: days.length,
    followersNow: withFollowers.length ? withFollowers[withFollowers.length - 1].followers : null,
    followersChange: withFollowers.length > 1 ? withFollowers[withFollowers.length - 1].followers - withFollowers[0].followers : null,
    reach: sum(days, d => d.reach),
    views: sum(days, d => d.views),
    saves: sum(days, d => d.saves),
    shares: sum(days, d => d.shares),
    contactTaps: sum(days, d => d.profile_links_taps),
    interactions: sum(days, d => d.total_interactions),
    profileVisitsFromPosts: sum(posts, m => m.profile_visits),
    posts: posts.filter(m => m.product_type !== 'STORY').length,
    stories: posts.filter(m => m.product_type === 'STORY').length,
    top: [...posts].filter(m => m.product_type !== 'STORY').sort((a, b) => mediaScore(b) - mediaScore(a)).slice(0, 5),
  };
}

export function adsSummary(rows = [], fromIso, toIso, leads = [], enquiriesById = {}) {
  const inPeriod = rows.filter(r => inRange(r.day, fromIso, toIso));
  const totals = {
    spend: sum(inPeriod, r => r.spend),
    impressions: sum(inPeriod, r => r.impressions),
    clicks: sum(inPeriod, r => r.clicks),
    linkClicks: sum(inPeriod, r => r.link_clicks),
    leads: sum(inPeriod, r => r.leads),
    messages: sum(inPeriod, r => r.messages),
    profileVisits: sum(inPeriod, r => r.profile_visits),
  };
  totals.cpm = totals.impressions ? (totals.spend / totals.impressions) * 1000 : null;
  totals.ctr = totals.impressions ? totals.linkClicks / totals.impressions : null;
  totals.costPerLead = totals.leads ? totals.spend / totals.leads : null;

  // What the ops app saw come in from paid links, joined to the pipeline.
  const paidLeads = leads.filter(l => inRange(l.created_at, fromIso, toIso)
    && ((l.utm_medium || '').includes('paid') || l.meta_lead_id));
  const byCampaign = new Map();
  for (const r of inPeriod) {
    const k = r.campaign_name || r.campaign_id || 'Unknown campaign';
    const c = byCampaign.get(k) || { campaign: k, spend: 0, impressions: 0, linkClicks: 0, leads: 0, frequencies: [], enquiries: 0, won: 0, wonValue: 0 };
    c.spend += Number(r.spend) || 0; c.impressions += r.impressions || 0; c.linkClicks += r.link_clicks || 0; c.leads += r.leads || 0;
    if (r.frequency) c.frequencies.push(Number(r.frequency));
    byCampaign.set(k, c);
  }
  for (const l of paidLeads) {
    const k = l.utm_campaign || 'Unknown campaign';
    const c = byCampaign.get(k) || { campaign: k, spend: 0, impressions: 0, linkClicks: 0, leads: 0, frequencies: [], enquiries: 0, won: 0, wonValue: 0 };
    c.enquiries++;
    const e = enquiriesById[l.notion_page_id];
    if (e && isWon(e)) { c.won++; c.wonValue += e.quoteSent || 0; }
    byCampaign.set(k, c);
  }
  const campaigns = [...byCampaign.values()].map(c => ({
    ...c,
    avgFrequency: c.frequencies.length ? sum(c.frequencies) / c.frequencies.length : null,
    costPerEnquiry: c.enquiries ? c.spend / c.enquiries : null,
    costPerBooking: c.won ? c.spend / c.won : null,
    frequencies: undefined,
  })).sort((a, b) => b.spend - a.spend);
  return { totals, campaigns, paidEnquiries: paidLeads.length };
}

// What a booking is worth to the business, so ad spend has a ceiling that
// makes sense: average won value × win rate × share of revenue we'll spend
// to acquire it.
export function affordableCostPerEnquiry(enquiries, { acquisitionShare = 0.1 } = {}) {
  const decided = enquiries.filter(isDecided);
  const won = enquiries.filter(e => isWon(e) && e.quoteSent);
  if (!won.length || !decided.length) return null;
  const avgWon = sum(won, e => e.quoteSent) / won.length;
  const winRate = enquiries.filter(isWon).length / decided.length;
  return { value: avgWon * winRate * acquisitionShare, avgWon, winRate, acquisitionShare };
}

// ---- content plan -----------------------------------------------------------
export function contentCoverage(content = [], fromIso, toIso) {
  const planned = content.filter(c => inRange(c.date, fromIso, toIso));
  const byStage = STAGES.map(s => ({ key: s.key, label: s.label, count: planned.filter(c => stageForCalendar(c.stage)?.key === s.key).length }));
  const anyStage = planned.filter(c => c.stage === 'Any stage').length;
  return { planned: planned.length, byStage, anyStage };
}
