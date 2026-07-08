'use client';
import { useEffect, useState } from 'react';
import AppShell from '../AppShell';

export default function StocktakeClient({ userEmail }) {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    fetch('/api/stock').then(r => r.json()).then(res => {
      if (res.error) setError(res.error);
      else setItems(res.items || []);
      setLoading(false);
    });
  }, []);

  function setCount(id, val) { setCounts({ ...counts, [id]: val }); }

  async function saveAll() {
    const entries = Object.entries(counts).filter(([, v]) => v !== '' && v !== undefined && !isNaN(parseInt(v)));
    if (!entries.length) { alert('No counts entered yet.'); return; }
    setSaving(true);
    try {
      const payload = entries.map(([id, v]) => {
        const item = items.find(i => i.id === id);
        return { id, name: item?.name, currentStock: parseInt(v) };
      });
      const res = await fetch('/api/stocktake', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counts: payload }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      setSaveMsg(`✓ Saved ${res.updated} item(s) to Notion`);
      setItems(items.map(i => counts[i.id] !== undefined && counts[i.id] !== '' ? { ...i, currentStock: parseInt(counts[i.id]) } : i));
      setCounts({});
      setTimeout(() => setSaveMsg(''), 4000);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell active="/stocktake" userEmail={userEmail}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Stock take</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>Count your actual stock — saves directly to Notion</p>
        </div>
        <button onClick={saveAll} disabled={saving} style={{ background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13 }}>
          {saving ? 'Saving…' : 'Save all to Notion'}
        </button>
      </div>

      <div style={{ background: 'var(--gold-bg)', color: '#8a6a00', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
        Count each item physically and enter the actual quantity. This overwrites current stock levels in Notion.
      </div>
      {saveMsg && <div style={{ background: 'var(--success-bg)', color: 'var(--success)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{saveMsg}</div>}
      {error && <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center' }}>Loading…</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 90px 80px', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            {['Item', 'Par level', 'Previous', 'Count now', 'Diff'].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>{h}</span>
            ))}
          </div>
          {items.map(i => {
            const val = counts[i.id];
            const diff = val !== undefined && val !== '' && !isNaN(parseInt(val)) ? parseInt(val) - (i.currentStock || 0) : null;
            return (
              <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 90px 80px', gap: 8, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--off)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{i.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{i.category} · {i.size || ''} {i.unit || ''}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>{i.parLevel ?? '—'}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>{i.currentStock ?? '—'}</div>
                <input
                  type="number" min="0" placeholder={String(i.currentStock ?? 0)}
                  value={val ?? ''} onChange={e => setCount(i.id, e.target.value)}
                  style={{ width: 80, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 13, textAlign: 'center' }}
                />
                <div style={{ fontSize: 12, textAlign: 'center', fontWeight: 500, color: diff == null ? 'var(--muted)' : diff < 0 ? 'var(--danger)' : diff > 0 ? 'var(--success)' : 'var(--muted)' }}>
                  {diff == null ? '—' : (diff >= 0 ? `+${diff}` : diff)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
