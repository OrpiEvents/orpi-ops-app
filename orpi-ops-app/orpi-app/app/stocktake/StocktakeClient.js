'use client';
import { useEffect, useState } from 'react';
import AppShell from '../AppShell';

const CATEGORIES = ['Spirit', 'Liqueur', 'Wine', 'Prosecco', 'Champagne', 'Beer',
  'Non-Alcoholic', 'Mixer', 'Soft Drink', 'Garnish', 'Ice', 'Other'];

export default function StocktakeClient({ userEmail }) {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', cat: 'Spirit', size: '', unit: 'Bottle', count: '' });
  const [q, setQ] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/stock');
      // A failing route returns an HTML error page, not JSON — reading the
      // status first means we report that rather than choking on the parse.
      if (!res.ok) throw new Error(`Stock list returned ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setItems(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      // Runs whatever happens. Without this the page sits on "Loading…"
      // forever and never says why.
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function setCount(id, val) { setCounts(prev => ({ ...prev, [id]: val })); }

  // Anything found in the unit that stock doesn't know about. Created with
  // "Needs setup" ticked so it shows in that Notion view for pricing later —
  // nobody should be looking up unit costs mid-count.
  async function addItem() {
    const name = draft.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch('/api/inventory/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ name, cat: draft.cat, size: draft.size, unit: draft.unit }] }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      const created = res.items?.[0];
      if (!created) throw new Error('Notion accepted it but returned nothing — reload and check.');

      setItems(prev => [...prev, {
        id: created.id, name, category: draft.cat, size: draft.size,
        unit: draft.unit, currentStock: 0, parLevel: null, isNew: true,
      }]);
      if (draft.count !== '') setCount(created.id, draft.count);
      setDraft({ name: '', cat: draft.cat, size: '', unit: 'Bottle', count: '' });
      setAdding(false);
    } catch (err) {
      alert('Could not add: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

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
      setSaveMsg(`\u2713 Saved ${res.updated} item(s) to Notion`);
      setItems(items.map(i => counts[i.id] !== undefined && counts[i.id] !== '' ? { ...i, currentStock: parseInt(counts[i.id]) } : i));
      setCounts({});
      setTimeout(() => setSaveMsg(''), 4000);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const term = q.trim().toLowerCase();
  const shown = term
    ? items.filter(i => i.name.toLowerCase().includes(term) || (i.category || '').toLowerCase().includes(term))
    : items;
  const entered = Object.values(counts).filter(v => v !== '' && v !== undefined).length;
  const newCount = items.filter(i => i.isNew).length;

  const cols = '2fr 80px 80px 90px 80px';
  const head = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' };
  const field = { width: '100%', padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 };

  return (
    <AppShell active="/stocktake" userEmail={userEmail}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Stock take</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>Count your actual stock — saves directly to Notion</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={() => setAdding(a => !a)} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', fontSize: 13, cursor: 'pointer' }}>
            {adding ? 'Cancel' : '+ New item'}
          </button>
          <button onClick={saveAll} disabled={saving || !entered} style={{ background: entered ? 'var(--black)' : 'var(--mid)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: entered ? 'pointer' : 'default' }}>
            {saving ? 'Saving…' : entered ? `Save ${entered} to Notion` : 'Save all to Notion'}
          </button>
        </div>
      </div>

      {adding && (
        <div style={{ background: '#fff', border: '1px solid var(--gold)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Something in the unit that isn't on the list</div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Name it and count it now. It gets flagged <strong>Needs setup</strong> in Notion so you can
            add the price when you're back at a desk — don't go looking up unit costs mid-count.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 90px 100px 90px', gap: 8, alignItems: 'end' }}>
            <div>
              <div style={head}>Item name</div>
              <input autoFocus style={field} placeholder="Smirnoff Red 1L" value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') addItem(); }} />
            </div>
            <div>
              <div style={head}>Category</div>
              <select style={field} value={draft.cat} onChange={e => setDraft({ ...draft, cat: e.target.value })}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={head}>Size</div>
              <input style={field} placeholder="70cl" value={draft.size} onChange={e => setDraft({ ...draft, size: e.target.value })} />
            </div>
            <div>
              <div style={head}>Unit</div>
              <input style={field} placeholder="Bottle" value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} />
            </div>
            <div>
              <div style={head}>Count</div>
              <input type="number" min="0" style={field} value={draft.count} onChange={e => setDraft({ ...draft, count: e.target.value })} />
            </div>
          </div>
          <button onClick={addItem} disabled={!draft.name.trim() || saving} style={{ marginTop: 12, background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer' }}>
            Add to inventory
          </button>
        </div>
      )}

      <div style={{ background: 'var(--gold-bg)', color: '#8a6a00', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
        Count each item physically and enter the actual quantity. This overwrites current stock levels in Notion.
        {newCount > 0 && <> {newCount} new item{newCount === 1 ? '' : 's'} added — price {newCount === 1 ? 'it' : 'them'} later from the <strong>Needs setup</strong> view.</>}
      </div>

      {saveMsg && <div style={{ background: 'var(--success-bg)', color: 'var(--success)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{saveMsg}</div>}

      {error && (
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '12px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          Couldn't load stock: {error}
          <button onClick={load} style={{ marginLeft: 12, background: 'none', border: '1px solid currentColor', borderRadius: 6, padding: '3px 10px', fontSize: 12, color: 'inherit', cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && (
        <input style={{ ...field, marginBottom: 12, maxWidth: 320 }} placeholder={`Search ${items.length} items…`}
          value={q} onChange={e => setQ(e.target.value)} />
      )}

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center' }}>Loading…</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            {['Item', 'Par level', 'Previous', 'Count now', 'Diff'].map(h => <span key={h} style={head}>{h}</span>)}
          </div>
          {shown.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              {items.length ? 'Nothing matches that search.' : 'No stock items found in Notion.'}
            </div>
          )}
          {shown.map(i => {
            const val = counts[i.id];
            const diff = val !== undefined && val !== '' && !isNaN(parseInt(val)) ? parseInt(val) - (i.currentStock || 0) : null;
            return (
              <div key={i.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--off)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {i.name}
                    {i.isNew && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--gold)', border: '1px solid var(--gold)', borderRadius: 4, padding: '1px 5px' }}>new</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{i.category} · {i.size || ''} {i.unit || ''}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>{i.parLevel ?? '—'}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>{i.currentStock ?? '—'}</div>
                <input type="number" min="0" placeholder={String(i.currentStock ?? 0)}
                  value={val ?? ''} onChange={e => setCount(i.id, e.target.value)}
                  style={{ width: 80, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 13, textAlign: 'center' }} />
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
