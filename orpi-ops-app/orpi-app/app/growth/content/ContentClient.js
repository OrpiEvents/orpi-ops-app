'use client';
import { useMemo, useState } from 'react';
import AppShell from '../../AppShell';
import { useJson, PageHead, SectionHead, Card, Grid, HBars, Table, Empty, Loading, ErrorBox, Pill, Note, num, btn } from '../ui';

const STATUS_TONE = { Idea: 'neutral', Planned: 'neutral', Filming: 'gold', Editing: 'gold', Scheduled: 'gold', Posted: 'good' };
const pretty = iso => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—');

export default function ContentClient({ userEmail, role }) {
  const { data, error, loading } = useJson('/api/growth/content');
  const [view, setView] = useState('upcoming');

  return (
    <AppShell active="/growth/content" userEmail={userEmail} role={role}>
      <PageHead
        title="Content plan"
        sub="The Notion Content Calendar, with each post’s results alongside. Edit posts in Notion; numbers fill in here and on the calendar every morning."
        right={<a href="https://www.notion.so/6f252abe6e394eec8e40d326b3da49e2" target="_blank" rel="noreferrer" style={{ ...btn(true), textDecoration: 'none' }}>Open calendar in Notion</a>}
      />
      {loading && <Loading what="the content calendar" />}
      {error && <ErrorBox error={error} />}
      {data && data.error && (
        <Card style={{ background: 'var(--gold-bg)', borderColor: '#efe2bd' }}>
          <Note tone="action" text="The app can’t read the Content Calendar yet. In Notion: open the Content Calendar, click ••• (top right) → Connections → add the ORPI integration (the same one the Sales Pipeline uses). Then refresh this page." />
        </Card>
      )}
      {data && !data.error && <Body d={data} view={view} setView={setView} />}
    </AppShell>
  );
}

function Body({ d, view, setView }) {
  const today = d.today;
  const items = useMemo(() => {
    const list = d.items.filter(c => c.date);
    if (view === 'upcoming') return list.filter(c => c.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    if (view === 'posted') return list.filter(c => c.status === 'Posted').sort((a, b) => b.date.localeCompare(a.date));
    return [...list].sort((a, b) => a.date.localeCompare(b.date));
  }, [d.items, view, today]);
  const noDate = d.items.filter(c => !c.date);
  const top = Math.max(...d.warm.map(w => w.count), 0);

  return (
    <>
      <Grid min={300} gap={16}>
        <div>
          <SectionHead>Next 14 days · posts by planning stage</SectionHead>
          <Card>
            <HBars rows={d.coverage.byStage.map(s => ({ ...s, value: s.count }))} format={v => `${v} ${v === 1 ? 'post' : 'posts'}`} />
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{d.coverage.planned} planned{d.coverage.anyStage ? `, ${d.coverage.anyStage} for any stage` : ''}.</p>
          </Card>
        </div>
        <div>
          <SectionHead>Couples we’re keeping warm · stage now</SectionHead>
          <Card>
            <HBars rows={d.warm.map(s => ({ ...s, value: s.count }))} format={v => `${v} ${v === 1 ? 'couple' : 'couples'}`} />
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              {top ? 'Aim the next fortnight at the biggest group here, so the people already interested keep seeing what they need next.' : 'No warm couples with future dates right now.'}
            </p>
          </Card>
        </div>
      </Grid>

      <SectionHead right={(
        <div style={{ display: 'flex', gap: 6 }}>
          {[['upcoming', 'Upcoming'], ['posted', 'Posted'], ['all', 'All']].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ ...btn(view === k), padding: '5px 10px', fontSize: 12 }}>{l}</button>
          ))}
        </div>
      )}>Posts</SectionHead>
      <Table
        empty="Nothing here yet."
        cols={[
          { key: 'date', label: 'Date', render: c => pretty(c.date) },
          { key: 'post', label: 'Post', wrap: true, render: c => (
            <div style={{ minWidth: 220 }}>
              <a href={c.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 500, textDecoration: 'none' }}>{c.post || 'Untitled'}</a>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{[c.format, c.pillar, c.stage].filter(Boolean).join(' · ')}</div>
              {flags(c, today).length > 0 && <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>{flags(c, today).map(f => <Pill key={f} tone="warn">{f}</Pill>)}</div>}
            </div>
          ) },
          { key: 'status', label: 'Status', render: c => <Pill tone={STATUS_TONE[c.status] || 'neutral'}>{c.status || '—'}</Pill> },
          { key: 'boost', label: 'Boost?', align: 'center', render: c => (c.boost ? <Pill tone="gold">candidate</Pill> : '') },
          { key: 'views', label: 'Views', align: 'right', render: c => num(c.live.ig?.views ?? c.views) },
          { key: 'saves', label: 'Saves', align: 'right', render: c => num(c.live.ig?.saved ?? c.saves) },
          { key: 'shares', label: 'Shares', align: 'right', render: c => num(c.live.ig?.shares ?? c.shares) },
          { key: 'clicks', label: 'Link clicks', align: 'right', render: c => (c.slug ? num(c.live.clicks) : <span style={{ color: 'var(--muted)' }}>no link</span>) },
          { key: 'enq', label: 'Enquiries', align: 'right', render: c => (c.slug ? num(c.live.enquiries) : '—') },
        ]}
        rows={items.map(c => ({ ...c, key: c.id }))}
      />

      {noDate.length > 0 && (
        <>
          <SectionHead>Ideas without a date ({noDate.length})</SectionHead>
          <Card pad="4px 18px">{noDate.map(c => <Note key={c.id} text={c.post || 'Untitled'} link={c.url} compact />)}</Card>
        </>
      )}

      {d.unmatched.length > 0 && (
        <>
          <SectionHead>On Instagram but not in the calendar · last 30 days</SectionHead>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Paste each link into a calendar post’s “Post URL” so its numbers are tracked against what it was for.</p>
          <Table
            cols={[
              { key: 'posted', label: 'Posted', render: m => pretty(m.posted) },
              { key: 'caption', label: 'Post', wrap: true, render: m => <a href={m.permalink} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{m.caption || m.type}</a> },
              { key: 'saved', label: 'Saves', align: 'right', render: m => num(m.saved) },
              { key: 'shares', label: 'Shares', align: 'right', render: m => num(m.shares) },
              { key: 'reach', label: 'Reach', align: 'right', render: m => num(m.reach) },
            ]}
            rows={d.unmatched.map(m => ({ ...m, key: m.permalink }))}
          />
        </>
      )}
      {!d.connected.instagram && (
        <div style={{ marginTop: 14 }}><Empty>Views, saves and shares fill in automatically once Instagram is connected. Until then, numbers typed into Notion show here.</Empty></div>
      )}
    </>
  );
}

function flags(c, today) {
  const out = [];
  const days = Math.round((new Date(`${c.date}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000);
  if (days >= 0 && days <= 2 && ['Idea', 'Planned'].includes(c.status)) out.push('not filmed yet');
  if (c.status !== 'Posted' && !c.caption) out.push('no caption');
  if (!c.trackedLink && /link in bio|DM/i.test(c.cta || '')) out.push('needs a tracked link');
  if (c.status === 'Posted' && !c.postUrl) out.push('add the Post URL');
  return out;
}
