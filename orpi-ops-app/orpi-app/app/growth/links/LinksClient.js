'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../AppShell';
import { useJson, PageHead, SectionHead, Card, Grid, Table, Loading, ErrorBox, Pill, Note, num, pct, btn, inputStyle, labelStyle } from '../ui';
import { slugify } from '@/lib/tracking';

const DESTS = [
  { key: 'enquire', label: 'Enquiry page (recommended)' },
  { key: 'whatsapp', label: 'WhatsApp chat' },
  { key: 'instagram', label: 'Instagram profile' },
  { key: 'custom', label: 'Another web address' },
];
const WHATSAPP = 'https://wa.me/447424505763';
const INSTAGRAM = 'https://instagram.com/orpi.events';

export default function LinksClient({ userEmail, role }) {
  const { data, error, loading, reload } = useJson('/api/growth/links');
  const [posts, setPosts] = useState([]);
  useEffect(() => {
    fetch('/api/growth/content', { cache: 'no-store' }).then(r => r.json()).then(j => {
      if (!j.error && Array.isArray(j.items)) setPosts(j.items.filter(c => c.date && c.date >= (j.today || '').slice(0, 7)).sort((a, b) => a.date.localeCompare(b.date)));
    }).catch(() => {});
  }, []);

  return (
    <AppShell active="/growth/links" userEmail={userEmail} role={role}>
      <PageHead
        title="Tracked links"
        sub="A short link for every place we point people: the Instagram bio, stories, ads, WhatsApp, QR codes on the bar. Each click is counted, and every enquiry it brings in is credited to it."
      />
      {loading && <Loading what="links" />}
      {error && <ErrorBox error={error} />}
      {data && <Body d={data} posts={posts} reload={reload} />}
    </AppShell>
  );
}

function Body({ d, posts, reload }) {
  const [f, setF] = useState({ label: '', placement: 'bio', dest: 'enquire', custom: '', campaign: '', slug: '', post: '' });
  const [slugEdited, setSlugEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const autoSlug = slugEdited ? f.slug : slugify(f.label);
  const hasBio = d.links.some(l => l.placement === 'bio' && !l.archived);

  const destination = f.dest === 'enquire' ? d.enquireUrl : f.dest === 'whatsapp' ? WHATSAPP : f.dest === 'instagram' ? INSTAGRAM : f.custom;

  async function create(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch('/api/growth/links', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: f.label, placement: f.placement, destination, utmCampaign: f.campaign, slug: autoSlug, contentPageId: f.post || undefined }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || j.error) return setMsg({ tone: 'warn', text: j.error || 'Could not create the link.' });
    setMsg({ tone: 'good', text: `Created: ${j.link.shortUrl}`, url: j.link.shortUrl, slug: j.link.slug, qr: f.placement === 'qr' });
    setF({ label: '', placement: f.placement, dest: 'enquire', custom: '', campaign: f.campaign, slug: '', post: '' });
    setSlugEdited(false);
    reload();
  }

  async function archive(slug, archived) {
    await fetch('/api/growth/links', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, archived }) });
    reload();
  }

  const rows = useMemo(() => d.links.filter(l => showArchived || !l.archived), [d.links, showArchived]);

  return (
    <>
      {!hasBio && (
        <Card style={{ marginBottom: 14, background: 'var(--gold-bg)', borderColor: '#efe2bd' }}>
          <Note tone="action" text="Start here: make the Instagram bio link (name it “Instagram bio”, where used: Instagram bio link). Put the short link in the bio, and every bio enquiry is counted from then on." />
        </Card>
      )}

      <SectionHead>New link</SectionHead>
      <Card>
        <form onSubmit={create}>
          <Grid min={220} gap={14}>
            <div>
              <label style={labelStyle}>Name</label>
              <input required value={f.label} onChange={e => set('label', e.target.value)} placeholder="e.g. Instagram bio, Mocktails reel, Bar QR" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Where it’s used</label>
              <select value={f.placement} onChange={e => set('placement', e.target.value)} style={inputStyle}>
                {Object.entries(d.placements).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Takes people to</label>
              <select value={f.dest} onChange={e => set('dest', e.target.value)} style={inputStyle}>
                {DESTS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              {f.dest === 'custom' && <input value={f.custom} onChange={e => set('custom', e.target.value)} placeholder="https://…" style={{ ...inputStyle, marginTop: 6 }} />}
            </div>
            <div>
              <label style={labelStyle}>Campaign (optional)</label>
              <input value={f.campaign} onChange={e => set('campaign', e.target.value)} placeholder="e.g. 2027 weddings, Diwali" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Short name</label>
              <input value={autoSlug} onChange={e => { setSlugEdited(true); set('slug', slugify(e.target.value)); }} placeholder="auto" style={inputStyle} />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, wordBreak: 'break-all' }}>{d.origin}/go/{autoSlug || '…'}</div>
            </div>
            <div>
              <label style={labelStyle}>For a calendar post (optional)</label>
              <select value={f.post} onChange={e => set('post', e.target.value)} style={inputStyle}>
                <option value="">—</option>
                {posts.map(p => <option key={p.id} value={p.id}>{p.date.slice(5)} · {p.post}</option>)}
              </select>
            </div>
          </Grid>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <button disabled={busy} style={btn(true)}>{busy ? 'Creating…' : 'Create link'}</button>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Tags added automatically: source {d.placements[f.placement]?.source}, medium {d.placements[f.placement]?.medium}{f.campaign ? `, campaign ${slugify(f.campaign)}` : ''}.</span>
          </div>
        </form>
        {msg && (
          <div style={{ marginTop: 12 }}>
            <Note tone={msg.tone} text={msg.text} />
            {msg.url && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <CopyButton text={msg.url} />
                {msg.qr && <a href={`/api/growth/links/qr?slug=${msg.slug}`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: 'none' }}>Open QR code</a>}
              </div>
            )}
          </div>
        )}
      </Card>

      <SectionHead right={<label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> show archived</label>}>
        All links
      </SectionHead>
      <Table
        empty="No links yet."
        cols={[
          { key: 'label', label: 'Link', wrap: true, render: l => (
            <div style={{ minWidth: 180 }}>
              <div style={{ fontWeight: 500 }}>{l.label} {l.archived && <Pill>archived</Pill>}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', wordBreak: 'break-all' }}>{l.shortUrl}</div>
            </div>
          ) },
          { key: 'placement', label: 'Used in', render: l => d.placements[l.placement]?.label || l.placement },
          { key: 'clicks7', label: '7 days', align: 'right', render: l => num(l.clicks7) },
          { key: 'clicks30', label: '30 days', align: 'right', render: l => num(l.clicks30) },
          { key: 'clicksAll', label: 'All clicks', align: 'right', render: l => num(l.clicksAll) },
          { key: 'enquiries', label: 'Enquiries', align: 'right', render: l => num(l.enquiries) },
          { key: 'conversion', label: 'Click → enquiry', align: 'right', render: l => (l.clicksAll ? pct(l.conversion) : '—') },
          { key: 'actions', label: '', render: l => (
            <div style={{ display: 'flex', gap: 6 }}>
              <CopyButton text={l.shortUrl} small />
              <a href={`/api/growth/links/qr?slug=${l.slug}`} target="_blank" rel="noreferrer" style={{ ...btn(), padding: '4px 8px', fontSize: 11.5, textDecoration: 'none' }}>QR</a>
              <button onClick={() => archive(l.slug, !l.archived)} style={{ ...btn(), padding: '4px 8px', fontSize: 11.5 }}>{l.archived ? 'Restore' : 'Archive'}</button>
            </div>
          ) },
        ]}
        rows={rows.map(l => ({ ...l, key: l.slug }))}
      />
      <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
        Clicks from link previews and bots (WhatsApp, Instagram, search engines) are left out of the counts. Enquiries count when someone arrives through the link and sends the enquiry form; DMs that started from a link can’t be traced, so ask “how did you hear about us?” in DMs too.
      </p>
    </>
  );
}

function CopyButton({ text, small }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* blocked */ } }}
      style={{ ...btn(!small), ...(small ? { padding: '4px 8px', fontSize: 11.5 } : {}) }}>
      {done ? 'Copied ✓' : 'Copy'}
    </button>
  );
}
