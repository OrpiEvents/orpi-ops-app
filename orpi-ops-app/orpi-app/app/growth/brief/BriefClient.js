'use client';
import { useState } from 'react';
import AppShell from '../../AppShell';
import { useJson, PageHead, SectionHead, Card, Note, Loading, ErrorBox, btn } from '../ui';

export default function BriefClient({ userEmail, role }) {
  const { data, error, loading, reload } = useJson('/api/growth/brief');
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = await fetch('/api/growth/brief?format=text', { cache: 'no-store' }).then(r => r.text());
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  }

  return (
    <AppShell active="/growth/brief" userEmail={userEmail} role={role}>
      <PageHead
        title="Weekly brief"
        sub={role === 'director'
          ? 'What happened this week and what to do next: content and ads for Reeya, follow-ups and approvals for you. Built live from the data.'
          : 'What happened this week and what to do next on content, social and ads. Built live from the data.'}
        right={(
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={reload} style={btn()}>Refresh</button>
            <button onClick={copy} style={btn(true)}>{copied ? 'Copied ✓' : 'Copy as text'}</button>
          </div>
        )}
      />
      {loading && <Loading what="this week’s brief" />}
      {error && <ErrorBox error={`Couldn’t build the brief: ${error}`} />}
      {data && data.sections.map(s => (
        <div key={s.key}>
          <SectionHead>{s.title}{s.audience === 'director' ? ' · directors only' : ''}</SectionHead>
          <Card pad="4px 18px">
            {s.items.length ? s.items.map((i, n) => <Note key={n} {...i} />) : <Note text="Nothing to report." />}
          </Card>
        </div>
      ))}
      {data && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 16, lineHeight: 1.5 }}>
          The agent drafts and recommends; it never messages clients, posts, boosts or spends. Anything involving spend or a client needs Ruds’s OK.
        </p>
      )}
    </AppShell>
  );
}
