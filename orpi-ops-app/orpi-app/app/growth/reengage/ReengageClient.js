'use client';
import { useState } from 'react';
import AppShell from '../../AppShell';
import { useJson, PageHead, SectionHead, Card, Grid, Loading, ErrorBox, Empty, Pill, Note, gbp, btn } from '../ui';

const KIND = { reply: 'New enquiries waiting on a reply', quote: 'Quotes due a follow-up', date: 'Quiet couples at a wedding-date milestone' };
const pretty = iso => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

export default function ReengageClient({ userEmail, role }) {
  const { data, error, loading, reload } = useJson('/api/growth/reengage');
  return (
    <AppShell active="/growth/reengage" userEmail={userEmail} role={role}>
      <PageHead
        title="Re-engage"
        sub="Who to follow up today, with a drafted message for each. Nothing is sent for you: open WhatsApp or email, tweak the words, send, then mark it here so the clock moves on."
      />
      {loading && <Loading what="follow-ups" />}
      {error && <ErrorBox error={error} />}
      {data && <Body d={data} reload={reload} />}
    </AppShell>
  );
}

function Body({ d, reload }) {
  const groups = ['reply', 'quote', 'date'].map(k => ({ k, items: d.queue.filter(q => q.touch.kind === k) })).filter(g => g.items.length);
  return (
    <>
      <Card pad="10px 16px" style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text)', fontWeight: 600 }}>The clock:</strong> reply to new enquiries the same day · after a quote, day 2 (check-in), day 5 (what’s included), day 10 (tailor to budget) · then, if it goes quiet, about 6 months, 3 months and 6–8 weeks before their date.
          Anyone who says no, or asks not to be contacted, gets <em>Marketing = Opted out</em> in Notion and drops off this list.
        </div>
      </Card>
      {!groups.length && <Empty>No follow-ups due today. Nice.</Empty>}
      {groups.map(g => (
        <div key={g.k}>
          <SectionHead>{KIND[g.k]} · {g.items.length}</SectionHead>
          <div style={{ display: 'grid', gap: 12 }}>
            {g.items.map(q => <Item key={`${q.enquiryId}-${q.touch.key}`} q={q} done={reload} />)}
          </div>
        </div>
      ))}

      {d.recentTouches.length > 0 && (
        <>
          <SectionHead>Recently done</SectionHead>
          <Card pad="4px 18px">
            {d.recentTouches.map((t, i) => (
              <Note key={i} compact tone={t.action === 'sent' ? 'good' : 'info'}
                text={`${pretty(String(t.at).slice(0, 10))} · ${t.name || 'Enquiry'} · ${t.label} · ${t.action}${t.action === 'snoozed' && t.snooze_until ? ` until ${pretty(t.snooze_until)}` : ''}${t.by_email ? ` · ${t.by_email.split('@')[0]}` : ''}`} />
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function Item({ q, done }) {
  const [text, setText] = useState(q.draft);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const waBase = q.waLink ? q.waLink.split('?')[0] : '';
  const waHref = waBase ? `${waBase}?text=${encodeURIComponent(text)}` : '';
  const mailHref = q.email ? `mailto:${q.email}?subject=${encodeURIComponent(q.mailLink ? decodeURIComponent((q.mailLink.match(/subject=([^&]*)/) || [])[1] || '') : 'Your event')}&body=${encodeURIComponent(text)}` : '';

  async function mark(action, extra = {}) {
    setBusy(action);
    await fetch('/api/growth/reengage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enquiryId: q.enquiryId, touchKey: q.touch.key, action, name: q.name, ...extra }),
    });
    setBusy('');
    done();
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <a href={q.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, fontSize: 14.5, color: 'inherit', textDecoration: 'none' }}>{q.name}</a>
          <span style={{ marginLeft: 8 }}><Pill tone="gold">{q.touch.label}</Pill></span>
          {q.overdueDays > 1 && <span style={{ marginLeft: 6 }}><Pill tone="warn">{q.overdueDays} days overdue</Pill></span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{q.channel}</div>
      </div>
      <Grid min={130} gap={8} style={{ margin: '10px 0' }}>
        <Fact label="Event">{q.eventType || '—'}</Fact>
        <Fact label="Date">{pretty(q.eventDate)}</Fact>
        <Fact label="Stage now">{q.stageNow || '—'}</Fact>
        <Fact label="Quote">{q.quote ? gbp(q.quote) : '—'}</Fact>
        <Fact label="Guests">{q.guestCount || '—'}</Fact>
        <Fact label="Source · status">{[q.source, q.status, q.lostReason].filter(Boolean).join(' · ')}</Fact>
      </Grid>
      {q.dateClash && <Note tone="warn" text="There’s already a confirmed booking on this date. Check you can cover it before offering it; the draft doesn’t say the date is free." />}
      <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, lineHeight: 1.5, background: 'var(--off)', marginTop: 6 }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {waHref && <a href={waHref} target="_blank" rel="noreferrer" style={{ ...btn(true), textDecoration: 'none' }}>Open in WhatsApp</a>}
        {mailHref && <a href={mailHref} style={{ ...btn(!waHref), textDecoration: 'none' }}>Open in email</a>}
        <button onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }} style={btn()}>{copied ? 'Copied ✓' : 'Copy'}</button>
        <span style={{ flex: 1 }} />
        <button disabled={!!busy} onClick={() => mark('sent')} style={{ ...btn(), borderColor: '#9fd3b4', color: '#1a7a4a' }}>{busy === 'sent' ? '…' : 'Mark sent'}</button>
        <button disabled={!!busy} onClick={() => mark('snoozed', { snoozeDays: 7 })} style={btn()}>{busy === 'snoozed' ? '…' : 'Snooze a week'}</button>
        <button disabled={!!busy} onClick={() => mark('skipped')} style={btn()}>{busy === 'skipped' ? '…' : 'Skip'}</button>
      </div>
    </Card>
  );
}

function Fact({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  );
}
