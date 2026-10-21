'use client';
// Fixed costs (company overheads), edited in the app and stored in Supabase
// (app_state key "fixed_costs"). The dashboard reads the same row to show
// overhead as a % of revenue, true margin after overhead, and breakeven.
// This lives in the app rather than Notion so the read never depends on a
// Notion integration having access.
import { useEffect, useState } from 'react';
import AppShell from '../AppShell';
import { createClient } from '@/lib/supabaseBrowser';

const CATEGORIES = ['Insurance', 'Vehicle', 'Storage', 'Software & Subscriptions', 'Marketing', 'Professional Fees', 'Equipment', 'Admin', 'Other'];
const FREQS = ['Monthly', 'Quarterly', 'Annual', 'One-off'];

function monthlyOf(f) {
  const amt = Number(f.amount) || 0;
  return f.frequency === 'Annual' ? amt / 12
    : f.frequency === 'Quarterly' ? amt / 3
    : f.frequency === 'One-off' ? 0
    : amt;
}
function gbp0(n) { return '£' + Math.round(n || 0).toLocaleString('en-GB'); }
function newRow() {
  return { id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: '', category: 'Other', amount: '', frequency: 'Monthly', active: true, notes: '' };
}

const inp = { width: '100%', padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: '#fff' };
const sel = { ...inp, cursor: 'pointer' };
const th = { textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', borderBottom: '1px solid var(--border)' };
const td = { padding: '6px 10px', borderBottom: '1px solid var(--off)', verticalAlign: 'middle' };

export default function OverheadsClient({ userEmail }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await createClient()
          .from('app_state').select('value').eq('key', 'fixed_costs').maybeSingle();
        setRows(Array.isArray(data?.value) ? data.value : []);
      } catch { setRows([]); }
      setLoading(false);
    })();
  }, []);

  function update(id, patch) { setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r)); setMsg(''); }
  function remove(id) { setRows(rs => rs.filter(r => r.id !== id)); setMsg(''); }
  function add() { setRows(rs => [...rs, newRow()]); setMsg(''); }

  async function save() {
    setSaving(true); setMsg('');
    const clean = rows
      .filter(r => (r.name || '').trim() || r.amount !== '')
      .map(r => ({
        id: r.id, name: (r.name || '').trim(), category: r.category || 'Other',
        amount: r.amount === '' || r.amount == null ? null : Number(r.amount),
        frequency: r.frequency || 'Monthly', active: !!r.active, notes: r.notes || '',
      }));
    try {
      const { error } = await createClient().from('app_state').upsert(
        { key: 'fixed_costs', value: clean, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
      if (error) throw new Error(error.message);
      setRows(clean);
      setMsg('✓ Saved — the dashboard will reflect this on its next load.');
      setTimeout(() => setMsg(''), 5000);
    } catch (err) {
      setMsg('Save failed: ' + err.message);
    }
    setSaving(false);
  }

  const active = rows.filter(r => r.active);
  const monthly = active.reduce((s, r) => s + monthlyOf(r), 0);
  const annual = monthly * 12;
  const blanks = active.filter(r => !(Number(r.amount) > 0)).length;

  return (
    <AppShell active="/overheads" userEmail={userEmail}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Overheads</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3, lineHeight: 1.5, maxWidth: 680 }}>
          Your company fixed costs. These feed the dashboard&rsquo;s overhead %, true margin after overhead, and breakeven.
          Log each at the frequency it actually bills — it&rsquo;s normalised to a monthly figure automatically. Untick anything that doesn&rsquo;t currently apply.
        </p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center' }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 18px', minWidth: 160 }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)' }}>Monthly overhead</div>
              <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }}>{gbp0(monthly)}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{gbp0(annual)}/yr · {active.length} active{blanks > 0 ? ` · ${blanks} blank` : ''}</div>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--off)' }}>
                  <th style={{ ...th, width: 42, textAlign: 'center' }}>On</th>
                  <th style={th}>Name</th>
                  <th style={{ ...th, width: 200 }}>Category</th>
                  <th style={{ ...th, width: 120 }}>Amount (£)</th>
                  <th style={{ ...th, width: 130 }}>Frequency</th>
                  <th style={{ ...th, width: 90, textAlign: 'right' }}>Monthly</th>
                  <th style={{ ...th, width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28, fontSize: 13 }}>No overheads yet — add your first below.</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id} style={{ opacity: r.active ? 1 : 0.55 }}>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <input type="checkbox" checked={!!r.active} onChange={e => update(r.id, { active: e.target.checked })} />
                    </td>
                    <td style={td}><input style={inp} value={r.name || ''} onChange={e => update(r.id, { name: e.target.value })} placeholder="e.g. Storage unit" /></td>
                    <td style={td}>
                      <select style={sel} value={r.category || 'Other'} onChange={e => update(r.id, { category: e.target.value })}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={td}><input style={inp} type="number" step="0.01" value={r.amount ?? ''} onChange={e => update(r.id, { amount: e.target.value })} placeholder="—" /></td>
                    <td style={td}>
                      <select style={sel} value={r.frequency || 'Monthly'} onChange={e => update(r.id, { frequency: e.target.value })}>
                        {FREQS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontSize: 13, color: 'var(--muted)' }}>{r.active ? gbp0(monthlyOf(r)) : '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button onClick={() => remove(r.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
            <button onClick={add} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>+ Add cost</button>
            <button onClick={save} disabled={saving} style={{ background: saving ? '#bbb' : 'var(--gold)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>{saving ? 'Saving…' : 'Save overheads'}</button>
            {msg && <span style={{ fontSize: 12.5, color: msg.startsWith('Save failed') ? 'var(--danger)' : 'var(--success)' }}>{msg}</span>}
          </div>
        </>
      )}
    </AppShell>
  );
}
