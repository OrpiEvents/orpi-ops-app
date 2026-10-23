'use client';
import AppShell from '../AppShell';
import { useJson, PageHead, SectionHead, Card, Grid, Stat, Columns, HBars, Table, Empty, Loading, ErrorBox, Note, Pill, gbp, pct, num } from './ui';

const ago = iso => {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
};

export default function OverviewClient({ userEmail, role }) {
  const { data, error, loading } = useJson('/api/growth/overview');
  const director = role === 'director';

  return (
    <AppShell active="/growth" userEmail={userEmail} role={role}>
      <PageHead
        title="Growth"
        sub="From first look to booking: what brings couples in, where they are in their planning, and what turns into bookings."
        right={<a href="/growth/brief" style={{ color: 'var(--gold)', fontSize: 13, textDecoration: 'none' }}>This week’s brief →</a>}
      />
      {loading && <Loading what="growth data" />}
      {error && <ErrorBox error={`Couldn’t load: ${error}`} />}
      {data && <Body d={data} director={director} />}
    </AppShell>
  );
}

function Body({ d, director }) {
  const k = d.kpis;
  const delta = k.enquiries30 - k.enquiriesPrev30;
  const missing = [
    !d.connected.content && 'Content Calendar',
    !d.connected.instagram && 'Instagram',
    !d.connected.ads && 'Meta ads',
  ].filter(Boolean);
  const f = d.funnel30;

  return (
    <>
      {missing.length > 0 && (
        <Card style={{ marginBottom: 16, background: 'var(--gold-bg)', borderColor: '#efe2bd' }}>
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>
            <strong style={{ fontWeight: 600 }}>Not connected yet:</strong> {missing.join(', ')}. The pipeline numbers below are live from Notion; social and ads fill in once they’re connected.{' '}
            <a href="/growth/setup" style={{ color: 'var(--gold)', textDecoration: 'none' }}>Connections →</a>
          </div>
        </Card>
      )}

      <Grid min={150}>
        <Stat label="Enquiries · 30 days" value={num(k.enquiries30)} sub={`${delta === 0 ? 'same as' : delta > 0 ? `+${delta} on` : `${delta} on`} the 30 days before`} tone={delta > 0 ? 'good' : undefined} />
        <Stat label="Quotes sent · 30 days" value={num(k.quotes30)} />
        <Stat label="Won · 30 days" value={num(k.won30)} sub={director && k.wonValue30 ? gbp(k.wonValue30) : undefined} />
        <Stat label="Win rate · 12 months" value={pct(k.winRate12m)} sub="of decided enquiries" />
        <Stat label="Speed to quote" value={k.speedToQuote30.median === null ? '—' : `${k.speedToQuote30.median} d`} sub={k.speedToQuote30.n ? `median, ${k.speedToQuote30.n} quotes in 30 days` : 'no quotes in 30 days'} tone={k.speedToQuote30.median > 2 ? 'warn' : undefined} />
        <Stat label="Weddings enquire" value={k.weddingLeadMonths === null ? '—' : `${k.weddingLeadMonths.toFixed(1)} mo`} sub="ahead of the date (median)" />
      </Grid>

      <SectionHead>The funnel · last 30 days</SectionHead>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          {[
            ['Tracked-link clicks', f.clicks, 'bio, stories, ads, QR'],
            ['Enquiry page views', f.formViews, ''],
            ['Started the form', f.formStarts, f.formViews ? `${pct(f.formStarts / f.formViews)} of views` : ''],
            ['Sent the form', f.formSubmits, f.formStarts ? `${pct(f.formSubmits / f.formStarts)} of starts` : ''],
            ['All enquiries', f.enquiries, 'incl. DMs, WhatsApp, email'],
            ['Quotes sent', f.quotes, ''],
            ['Won', f.won, ''],
          ].map(([label, n, sub], i) => (
            <div key={label} style={{ borderLeft: i ? '1px solid var(--off)' : 'none', paddingLeft: i ? 12 : 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, margin: '3px 0 1px' }}>{num(n)}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>
            </div>
          ))}
        </div>
        {f.clicks === 0 && f.formViews === 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
            The first four steps start counting once the tracked bio link and enquiry page are in use. <a href="/growth/links" style={{ color: 'var(--gold)', textDecoration: 'none' }}>Make the bio link →</a>
          </p>
        )}
      </Card>

      <SectionHead>Enquiries per month</SectionHead>
      <Card>
        <Columns data={d.monthly} valueKey="enquiries" labelKey="label" height={160} tip={m => `${m.label} ${m.month.slice(0, 4)}: ${m.enquiries} ${m.enquiries === 1 ? 'enquiry' : 'enquiries'} · ${m.won} won`} />
      </Card>

      <Grid min={340} gap={16} style={{ marginTop: 4 }}>
        <div>
          <SectionHead>Where enquiries come from · 12 months</SectionHead>
          <Table
            cols={[
              { key: 'source', label: 'Source' },
              { key: 'enquiries', label: 'Enquiries', align: 'right' },
              { key: 'won', label: 'Won', align: 'right' },
              { key: 'winRate', label: 'Win rate', align: 'right', render: r => (r.decided >= 3 ? pct(r.winRate) : <span style={{ color: 'var(--muted)' }}>{r.decided ? `${r.won}/${r.decided}` : '—'}</span>) },
              ...(director ? [{ key: 'avgWon', label: 'Avg booking', align: 'right', render: r => gbp(r.avgWon) }] : []),
            ]}
            rows={d.sources.map(r => ({ ...r, key: r.source }))}
          />
          <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Win rate shows once a source has 3+ decided enquiries.</p>
        </div>
        <div>
          <SectionHead>Planning stage when they enquired · 12 months</SectionHead>
          <Card>
            <HBars rows={d.stages.map(s => ({ ...s, value: s.enquiries }))} labelKey="label"
              format={(v, r) => `${v}${r.decided >= 3 ? ` · ${pct(r.winRate)} won` : ''}`}
              tip={r => `${r.label}: ${r.enquiries} enquiries, ${r.won} won of ${r.decided} decided`} />
          </Card>
          <SectionHead>Couples we’re keeping warm · by stage now</SectionHead>
          <Card>
            <HBars rows={d.warm.map(s => ({ ...s, value: s.count }))} labelKey="label" format={v => `${v}`} tip={r => `${r.count} open or dormant couples are ${r.label} from their date`} />
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              Dormant pool: {d.dormant.count} quiet couples with dates still ahead{director && d.dormant.value ? ` (${gbp(d.dormant.value)} of quotes)` : ''}. Content and retargeting should follow them through these stages.
              {director && <> <a href="/growth/reengage" style={{ color: 'var(--gold)', textDecoration: 'none' }}>Re-engage →</a></>}
            </p>
          </Card>
        </div>
      </Grid>

      <SectionHead>Instagram · 30 days</SectionHead>
      {d.ig ? <Instagram ig={d.ig} /> : <Empty>Instagram isn’t connected yet. Once it is, reach, profile visits, link taps and your best posts land here every morning. <a href="/growth/setup" style={{ color: 'var(--gold)', textDecoration: 'none' }}>Connections →</a></Empty>}

      <SectionHead>Ads · 30 days</SectionHead>
      {d.ads ? (
        <Grid min={160}>
          <Stat label="Spend" value={gbp(d.ads.totals.spend)} />
          <Stat label="Link clicks" value={num(d.ads.totals.linkClicks)} sub={d.ads.totals.ctr !== null ? `${(d.ads.totals.ctr * 100).toFixed(2)}% CTR` : ''} />
          <Stat label="Leads (Meta)" value={num(d.ads.totals.leads)} sub={d.ads.totals.costPerLead ? `${gbp(d.ads.totals.costPerLead)} each` : ''} />
          <Stat label="Enquiries from ads" value={num(d.ads.paidEnquiries)} sub="tracked in the pipeline" />
        </Grid>
      ) : <Empty>No ads connected yet. The launch plan is on the <a href="/growth/ads" style={{ color: 'var(--gold)', textDecoration: 'none' }}>Ads page</a>.</Empty>}

      <Grid min={340} gap={16} style={{ marginTop: 4 }}>
        <div>
          <SectionHead right={<a href="/growth/links" style={{ color: 'var(--gold)', fontSize: 12, textDecoration: 'none' }}>All links →</a>}>Top tracked links · 30 days</SectionHead>
          <Table
            cols={[
              { key: 'label', label: 'Link' },
              { key: 'clicks30', label: 'Clicks', align: 'right' },
              { key: 'enquiries', label: 'Enquiries', align: 'right' },
            ]}
            rows={d.links.map(l => ({ ...l, key: l.slug }))}
            empty="No tracked links yet. Start with the Instagram bio link."
          />
        </div>
        <div>
          <SectionHead right={<a href="/growth/content" style={{ color: 'var(--gold)', fontSize: 12, textDecoration: 'none' }}>Content plan →</a>}>Next fortnight’s content</SectionHead>
          {d.content.error ? <Note tone="warn" text="The app can’t read the Content Calendar yet: add the ORPI integration to it in Notion (••• → Connections)." /> : (
            <Card>
              <div style={{ fontSize: 13, marginBottom: 8 }}>{d.content.coverage.planned} posts planned in the next 14 days{d.content.coverage.anyStage ? ` (${d.content.coverage.anyStage} for any stage)` : ''}.</div>
              <HBars rows={d.content.coverage.byStage.map(s => ({ ...s, value: s.count }))} labelKey="label" format={v => `${v}`} />
            </Card>
          )}
        </div>
      </Grid>

      {d.lastSync && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 18 }}>
          Last data sync: {ago(d.lastSync.at)} · <Pill tone={d.lastSync.ok ? 'good' : 'warn'}>{d.lastSync.ok ? 'ok' : 'had a problem'}</Pill>
        </p>
      )}
    </>
  );
}

function Instagram({ ig }) {
  const n = ig.now, p = ig.prev;
  const change = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}% on prior 30 days` : '');
  return (
    <>
      <Grid min={150}>
        <Stat label="Followers" value={num(n.followersNow)} sub={n.followersChange !== null ? `${n.followersChange >= 0 ? '+' : ''}${n.followersChange} in 30 days` : 'trend builds from today'} />
        <Stat label="Accounts reached" value={num(n.reach)} sub={change(n.reach, p.reach) || 'daily totals, incl. ads'} />
        <Stat label="Saves" value={num(n.saves)} sub={change(n.saves, p.saves) || '“keeping this for later”'} />
        <Stat label="Shares" value={num(n.shares)} sub={change(n.shares, p.shares)} />
        <Stat label="Profile visits from posts" value={num(n.profileVisitsFromPosts)} sub="feed posts + stories" />
        <Stat label="Bio-link clicks" value={ig.bioClicks === null ? '—' : num(ig.bioClicks)} sub={ig.bioClicks === null ? 'needs the tracked bio link' : 'from the tracked link'} />
      </Grid>
      {n.top.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Table
            cols={[
              { key: 'posted', label: 'Posted', render: m => (m.posted_at || '').slice(0, 10) },
              { key: 'caption', label: 'Post', wrap: true, render: m => <a href={m.permalink} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{(m.caption || m.product_type || 'Post').slice(0, 70)}</a> },
              { key: 'reach', label: 'Reach', align: 'right', render: m => num(m.reach) },
              { key: 'saved', label: 'Saves', align: 'right', render: m => num(m.saved) },
              { key: 'shares', label: 'Shares', align: 'right', render: m => num(m.shares) },
            ]}
            rows={n.top.map(m => ({ ...m, key: m.media_id }))}
          />
          <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Ranked by saves and shares: the “I’m planning, keep this” signals that predict enquiries better than likes.</p>
        </div>
      )}
    </>
  );
}
