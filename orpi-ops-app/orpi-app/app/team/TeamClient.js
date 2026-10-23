'use client';
import { useState } from 'react';
import AppShell from '../AppShell';
import { useJson, PageHead, SectionHead, Card, Grid, Table, Loading, ErrorBox, Pill, Note, btn, inputStyle, labelStyle } from '../growth/ui';

const ROLE_INFO = {
  director: 'Everything: pipeline, quotes, bookings, costs, invoices, growth, team.',
  marketing: 'Growth workspace only: content plan, tracked links, Instagram and ads numbers, the weekly brief. No client contact details, costs, quotes or invoices.',
};

export default function TeamClient({ userEmail, role, myId }) {
  const { data, error, loading, reload } = useJson('/api/team');
  return (
    <AppShell active="/team" userEmail={userEmail} role={role}>
      <PageHead title="Team" sub="Who can log in, and what they can see. Invites and password links are one-time links; each person chooses their own password." />
      {loading && !data && <Loading what="the team" />}
      {error && <ErrorBox error={error} />}
      {data && <Body d={data} myId={myId} reload={reload} />}
    </AppShell>
  );
}

function Body({ d, myId, reload }) {
  const [f, setF] = useState({ email: '', role: 'marketing' });
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const secure = d.security?.app_state_director_only && d.security?.activity_log_director_only;

  async function post(body) {
    setBusy(true); setOut(null);
    const res = await fetch('/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || j.error) { setOut({ tone: 'warn', text: j.error || 'Something went wrong.' }); return null; }
    reload();
    return j;
  }

  async function invite(e) {
    e.preventDefault();
    const j = await post({ action: 'invite', email: f.email, role: f.role });
    if (j) setOut({ tone: 'good', text: j.emailed ? `Invite emailed to ${f.email}.` : `Invite ready. Email couldn’t be sent, so send ${f.email} this link yourself:`, link: j.emailed ? '' : j.link });
  }

  return (
    <>
      {!secure && (
        <Card style={{ marginBottom: 14, background: 'var(--gold-bg)', borderColor: '#efe2bd' }}>
          <Note tone="action" text="Marketing logins are on hold until the directors-only database change is applied (it stops a marketing login reading quotes, invoices, overheads and run sheets from the browser). Director invites work now." />
        </Card>
      )}
      <SectionHead>Invite someone</SectionHead>
      <Card>
        <form onSubmit={invite}>
          <Grid min={220} gap={14}>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" required value={f.email} onChange={e => setF(p => ({ ...p, email: e.target.value }))} placeholder="name@orpi.events" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Role</label>
              <select value={f.role} onChange={e => setF(p => ({ ...p, role: e.target.value }))} style={inputStyle}>
                <option value="marketing">Marketing (Growth only)</option>
                <option value="director">Director (everything)</option>
              </select>
            </div>
          </Grid>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 12px' }}>{ROLE_INFO[f.role]}</p>
          <button disabled={busy} style={btn(true)}>{busy ? 'Working…' : 'Send invite'}</button>
        </form>
        {out && (
          <div style={{ marginTop: 12 }}>
            <Note tone={out.tone} text={out.text} />
            {out.link && <div style={{ fontSize: 12, wordBreak: 'break-all', background: 'var(--off)', padding: '8px 10px', borderRadius: 6, marginTop: 6 }}>{out.link}</div>}
          </div>
        )}
      </Card>

      <SectionHead>Who has access</SectionHead>
      <Table
        cols={[
          { key: 'email', label: 'Login' },
          { key: 'role', label: 'Role', render: u => <Pill tone={u.role === 'director' ? 'gold' : u.role === 'marketing' ? 'good' : 'bad'}>{u.role === 'none' ? 'no access' : u.role}</Pill> },
          { key: 'lastSignIn', label: 'Last signed in', render: u => (u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString('en-GB') : <span style={{ color: 'var(--muted)' }}>not yet</span>) },
          { key: 'actions', label: '', render: u => (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button disabled={busy} onClick={async () => { const j = await post({ action: 'link', email: u.email }); if (j) setOut({ tone: 'good', text: j.emailed ? `Password link emailed to ${u.email}.` : `Send ${u.email} this link:`, link: j.emailed ? '' : j.link }); }} style={{ ...btn(), padding: '4px 8px', fontSize: 11.5 }}>Password link</button>
              {u.id !== myId && (
                <select value={u.roleSet || ''} onChange={e => e.target.value && post({ action: 'role', id: u.id, role: e.target.value })} style={{ ...inputStyle, width: 'auto', padding: '3px 6px', fontSize: 11.5 }}>
                  <option value="">Change role…</option>
                  <option value="director">Director</option>
                  <option value="marketing">Marketing</option>
                  <option value="disabled">Remove access</option>
                </select>
              )}
            </div>
          ) },
        ]}
        rows={d.team.map(u => ({ ...u, key: u.id }))}
      />
      <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>Links work once and expire after about an hour. “Remove access” keeps the account but blocks it; you can restore it later.</p>

      <CalendarFeed />
    </>
  );
}

// The team calendar: one subscription link for Apple Calendar (or Google or
// Outlook). Holds for dated enquiries, bookings as booked, refreshed from
// Notion about every hour.
function CalendarFeed() {
  const { data, error, loading, reload } = useJson('/api/calendar');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function reset() {
    if (!confirm('Make a new calendar link? Calendars subscribed with the current link stop updating, so everyone will need to subscribe again with the new one.')) return;
    setBusy(true); setMsg(null);
    const res = await fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset' }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || j.error) { setMsg({ tone: 'warn', text: j.error || 'Couldn’t make a new link.' }); return; }
    setMsg({ tone: 'good', text: 'New link made. The old one no longer works.' });
    reload();
  }

  function copy() {
    navigator.clipboard?.writeText(data.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  return (
    <>
      <SectionHead>Team calendar</SectionHead>
      <Card>
        <p style={{ fontSize: 13, margin: '0 0 6px' }}>
          Every enquiry with a date shows as a <strong>hold</strong>, and every confirmed booking as <strong>booked</strong>, in one calendar the team subscribes to.
        </p>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>
          It updates from Notion about every hour. When an enquiry is won its hold turns into the booking, and a lost enquiry drops off. Only names, dates, venues, guest numbers and the type of event are shown: no contact details or prices.
        </p>
        {loading && !data && <Loading what="the calendar link" />}
        {error && <ErrorBox error={error} />}
        {data && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <a href={data.webcal} style={{ ...btn(true), textDecoration: 'none' }}>Subscribe on this device</a>
              <button onClick={copy} style={btn()}>{copied ? '✓ Copied' : 'Copy link'}</button>
            </div>
            <div style={{ fontSize: 12, wordBreak: 'break-all', background: 'var(--off)', padding: '8px 10px', borderRadius: 6, marginBottom: 12 }}>{data.url}</div>
            <ul style={{ fontSize: 12.5, margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.6 }}>
              <li><strong>iPhone or iPad:</strong> open this page on it, tap Subscribe on this device, then Subscribe.</li>
              <li><strong>Mac:</strong> in Calendar choose File → New Calendar Subscription, paste the link, then set Location to iCloud and Auto-refresh to every hour. It then appears on your iPhone too.</li>
              <li>Everyone in the team subscribes once with the same link.</li>
            </ul>
            <Note tone="action" text="Anyone with this link can see client names, dates and venues, so keep it inside the team. If it gets out, make a new link: the old one stops working straight away." />
            <div style={{ marginTop: 10 }}>
              <button disabled={busy} onClick={reset} style={{ ...btn(), fontSize: 12 }}>{busy ? 'Working…' : 'Make a new link'}</button>
            </div>
          </>
        )}
        {msg && <div style={{ marginTop: 10 }}><Note tone={msg.tone} text={msg.text} /></div>}
      </Card>
    </>
  );
}
