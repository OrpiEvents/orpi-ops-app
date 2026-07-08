'use client';
import { useEffect, useState } from 'react';
import AppShell from '../AppShell';

export default function ActivityClient({ userEmail }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/activity').then(r => r.json()).then(res => {
      if (res.error) setError(res.error);
      else setRows(res.activity || []);
      setLoading(false);
    });
  }, []);

  return (
    <AppShell active="/activity" userEmail={userEmail}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Activity log</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>Every change made in the app, with who made it</p>
      </div>
      {error && <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center' }}>Loading…</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--off)' }}>
                {['When', 'Who', 'Action', 'Record'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 14px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No activity logged yet</td></tr>
              ) : rows.map(r => (
                <tr key={r.id}>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--off)' }}>{new Date(r.created_at).toLocaleString('en-GB')}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, borderBottom: '1px solid var(--off)' }}>{r.user_email}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, borderBottom: '1px solid var(--off)' }}><code style={{ fontSize: 12 }}>{r.action}</code></td>
                  <td style={{ padding: '10px 14px', fontSize: 13, borderBottom: '1px solid var(--off)' }}>{r.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
