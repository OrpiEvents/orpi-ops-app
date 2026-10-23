'use client';
import AppShell from '../../AppShell';
import { useJson, PageHead, SectionHead, Card, Grid, Stat, Columns, Table, Empty, Loading, ErrorBox, Note, Pill, gbp, num } from '../ui';

// The campaign plan. Meta can't target by wedding date, so the plan targets
// people and sequences what they see by planning stage, keeping warm
// audiences seeing ORPI as the date gets closer.
const PLAN = [
  {
    name: '1 · Stay in mind',
    share: 'about 60% of budget, always on',
    who: 'People who already know us: Instagram engagers (last 12 months), people who watched most of a reel, and enquiry-page visitors once the pixel is live. Exclude booked clients.',
    what: 'Rotate by planning stage: real-wedding proof reels, the “everything that’s included” carousel, mocktails for non-drinking guests, then “a bar on any budget” packages as dates get closer.',
    goal: 'Traffic to the enquiry page through a tracked link, or engagement. Keep frequency around twice a week.',
  },
  {
    name: '2 · Find new couples',
    share: 'about 40% of budget',
    who: 'UK, around London and the Home Counties, aged roughly 24–40, with Advantage+ audience switched on. Suggest wedding and wedding-planning interests. Add a lookalike of booked clients once there are 100+ to base it on.',
    what: 'Best-performing proof reel plus a clear offer: “Tell us your date and guest numbers, we’ll send a tailored quote.”',
    goal: 'Leads. Start with an Instant Form (asks date, guests, venue or postcode). It lands in the Sales Pipeline within seconds, and gets a reply within the hour.',
  },
  {
    name: '3 · Bring back quiet couples (later)',
    share: 'small, once the privacy notice covers it',
    who: 'The dormant pool: quiet couples whose dates are still ahead, uploaded as a customer list.',
    what: 'Stage-matched messages: “six months to go, your date’s still open”, “budgets settle around now, we can tailor a package”.',
    goal: 'Only after the privacy notice and the enquiry form tell people their details may be matched for ads. UK GDPR needs that transparency at the point of collection.',
  },
];
const RULES = [
  'Reeya proposes, Ruds approves: no new campaign, boost or budget change without his OK.',
  'Stay inside the monthly ceiling set on the Connections page.',
  'Every ad uses a tracked link or an Instant Form, so each enquiry is credited to its campaign.',
  'Pause any ad set that spends twice the affordable cost per enquiry with nothing to show for it.',
  'Swap in fresh creative when people are seeing an ad more than 3–4 times a week.',
  'Judge ads on enquiries and bookings in the pipeline, not on likes or reach.',
];

export default function AdsClient({ userEmail, role }) {
  const { data, error, loading } = useJson('/api/growth/ads');
  const director = role === 'director';
  return (
    <AppShell active="/growth/ads" userEmail={userEmail} role={role}>
      <PageHead
        title="Ads"
        sub="Meta ads (Instagram and Facebook) measured all the way to bookings: what we spent, what came in, and what it turned into."
      />
      {loading && <Loading what="ads" />}
      {error && <ErrorBox error={error} />}
      {data && (data.connected.ads ? <Live d={data} director={director} /> : <NotYet d={data} />)}
      {data && <Plan d={data} director={director} />}
    </AppShell>
  );
}

function NotYet({ d }) {
  return (
    <Card style={{ background: 'var(--gold-bg)', borderColor: '#efe2bd' }}>
      <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
        <strong style={{ fontWeight: 600 }}>No ad account connected yet.</strong> Before the first ad runs: Meta Business portfolio, ad account in GBP and London time, payment method, a pixel, and the access token in Vercel. Every step is on the Connections page.
        {' '}<a href="/growth/setup" style={{ color: 'var(--gold)', textDecoration: 'none' }}>Connections →</a>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
        Audiences ready to use the day ads start: {d.audiences.warm.reduce((t, s) => t + s.count, 0)} couples we’re keeping warm, {d.audiences.dormant} in the dormant pool.
      </div>
    </Card>
  );
}

function Live({ d, director }) {
  const t = d.last30.totals;
  const budget = d.budget;
  return (
    <>
      <Grid min={160}>
        <Stat label="Spend · 30 days" value={gbp(t.spend)} sub={budget.monthly ? `this month ${gbp(budget.monthSpend)} of ${gbp(budget.monthly)}` : 'no monthly ceiling set'} tone={budget.monthly && budget.monthSpend > budget.monthly ? 'warn' : undefined} />
        <Stat label="Link clicks" value={num(t.linkClicks)} sub={t.ctr !== null ? `${(t.ctr * 100).toFixed(2)}% of impressions` : ''} />
        <Stat label="Leads (Meta)" value={num(t.leads)} sub={t.costPerLead ? `${gbp(t.costPerLead)} each` : ''} />
        <Stat label="Enquiries in pipeline" value={num(d.last30.paidEnquiries)} sub="from paid links and lead forms" />
        <Stat label="Affordable per enquiry" value={d.target ? gbp(d.target.value) : '—'} sub={director && d.target ? `${gbp(d.target.avgWon)} avg booking × ${Math.round(d.target.winRate * 100)}% won × ${Math.round(d.target.acquisitionShare * 100)}%` : 'ceiling for cost per enquiry'} />
      </Grid>

      <SectionHead>Spend per day · 30 days</SectionHead>
      <Card>
        <Columns data={d.daily.map(x => ({ ...x, value: Math.round(x.spend) }))} labelKey="label" height={130} tip={x => `${x.day}: ${gbp(x.spend)} · ${x.leads} leads`} />
      </Card>

      <SectionHead>Campaigns · 30 days</SectionHead>
      <Table
        empty="No campaign activity in the last 30 days."
        cols={[
          { key: 'campaign', label: 'Campaign', wrap: true },
          { key: 'spend', label: 'Spend', align: 'right', render: c => gbp(c.spend) },
          { key: 'linkClicks', label: 'Clicks', align: 'right', render: c => num(c.linkClicks) },
          { key: 'leads', label: 'Leads', align: 'right', render: c => num(c.leads) },
          { key: 'enquiries', label: 'Enquiries', align: 'right', render: c => num(c.enquiries) },
          { key: 'won', label: 'Booked', align: 'right', render: c => num(c.won) },
          { key: 'cpe', label: 'Per enquiry', align: 'right', render: c => gbp(c.costPerEnquiry) },
          { key: 'cpb', label: 'Per booking', align: 'right', render: c => gbp(c.costPerBooking) },
          { key: 'freq', label: 'Freq.', align: 'right', render: c => (c.avgFrequency ? <span>{c.avgFrequency.toFixed(1)} {c.avgFrequency > 3.5 && <Pill tone="warn">tiring</Pill>}</span> : '—') },
        ]}
        rows={d.last30.campaigns.map(c => ({ ...c, key: c.campaign }))}
      />
    </>
  );
}

function Plan({ d, director }) {
  return (
    <>
      <SectionHead right={<a href="https://www.notion.so/4026ca9d054981459fe9d6873bfc06ea" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', fontSize: 12, textDecoration: 'none' }}>Full launch kit in Notion →</a>}>The plan</SectionHead>
      <Grid min={280} gap={12}>
        {PLAN.map(p => (
          <Card key={p.name}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>{p.share}</div>
            <Line label="Who">{p.who}</Line>
            <Line label="What they see">{p.what}</Line>
            <Line label="Aim">{p.goal}</Line>
          </Card>
        ))}
      </Grid>
      <SectionHead>Rules we run by</SectionHead>
      <Card pad="4px 18px">
        {RULES.map(r => <Note key={r} tone="info" text={r} compact />)}
        {director && !d.budget.monthly && <Note tone="action" text="Set the monthly ad ceiling and the per-boost limit on the Connections page before the first campaign." link="/growth/setup" />}
      </Card>
      {!d.pixel && (
        <div style={{ marginTop: 12 }}>
          <Empty>No pixel chosen yet. Ads can still run and be measured through tracked links and Instant Forms; the pixel adds website measurement for people who accept cookies.</Empty>
        </div>
      )}
    </>
  );
}

function Line({ label, children }) {
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.55, marginBottom: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginRight: 6 }}>{label}</span>
      {children}
    </div>
  );
}
