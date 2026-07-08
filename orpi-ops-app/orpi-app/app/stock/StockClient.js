'use client';
import { useEffect, useState } from 'react';
import AppShell from '../AppShell';

const CATEGORIES = ['all', 'Spirit', 'Soft Drink', 'Mixer', 'Beer', 'Wine', 'Prosecco', 'Champagne', 'Liqueur', 'Garnish', 'Ice', 'Other'];

export default function StockClient({ userEmail }) {
  const [items, setItems] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adjustInputs, setAdjustInputs] = useState({});

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [stockRes, bookingsRes] = await Promise.all([
        fetch('/api/stock').then(r => r.json()),
        fetch('/api/bookings').then(r => r.json()),
      ]);
      if (stockRes.error) throw new Error(stockRes.error);
      setItems(stockRes.items || []);
      if (!bookingsRes.error) setBookings(bookingsRes.bookings || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Cross-reference confirmed bookings' cocktail/mocktail menus against
  // stock to build a "needed for upcoming events" count per item.
  const neededCounts = {};
  bookings.forEach(b => {
    [b.cocktailMenu, b.mocktailMenu].filter(Boolean).forEach(menu => {
      menu.split(',').map(s => s.trim()).filter(s => s && s !== 'TBC').forEach(drink => {
        const match = items.find(i => i.name.toLowerCase().includes(drink.toLowerCase().split(' ')[0]));
        if (match) neededCounts[match.id] = (neededCounts[match.id] || 0) + 1;
      });
    });
  });

  const filtered = filter === 'all' ? items : items.filter(i => i.category === filter);
  const lowItems = filtered.filter(i => (i.currentStock || 0) < (i.parLevel || 0));
  const forecastItems = Object.keys(neededCounts).filter(id => {
    const item = items.find(i => i.id === id);
    return item && (item.currentStock || 0) < (item.parLevel || 0) + neededCounts[id];
  });

  async function adjust(id, name, direction) {
    const qty = parseInt(adjustInputs[id]) || 0;
    if (!qty) return;
    const item = items.find(i => i.id === id);
    const newStock = Math.max(0, (item.currentStock || 0) + (direction * qty));
    setItems(items.map(i => i.id === id ? { ...i, currentStock: newStock } : i));
    setAdjustInputs({ ...adjustInputs, [id]: '' });
    try {
      const res = await fetch(`/api/stock/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentStock: newStock, itemName: name }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
    } catch (err) {
      alert('Failed to save: ' + err.message);
      load();
    }
  }

  return (
    <AppShell active="/stock" userEmail={userEmail}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Stock tracker</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>Live from Notion — updated by stock takes and purchases</p>
        </div>
        <button onClick={load} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', fontSize: 12 }}>↻ Refresh</button>
      </div>

      {error && <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>Couldn't load stock: {error}</div>}

      {forecastItems.length > 0 && (
        <div style={{ background: 'var(--gold-bg)', color: '#8a6a00', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          📋 Needed for upcoming events, below par: {forecastItems.map(id => items.find(i => i.id === id)?.name).join(', ')}
        </div>
      )}
      {lowItems.length > 0 && (
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          ⚠ {lowItems.length} item{lowItems.length > 1 ? 's' : ''} below par in this view
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16, overflowX: 'auto' }}>
        {CATEGORIES.map(c => (
          <div key={c} onClick={() => setFilter(c)} style={{
            padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
            color: filter === c ? 'var(--text)' : 'var(--muted)',
            borderBottom: filter === c ? '2px solid var(--gold)' : '2px solid transparent', marginBottom: -1,
          }}>{c === 'all' ? 'All' : c}</div>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center' }}>Loading…</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--off)' }}>
                {['Item', 'Category', 'Size', 'Unit', 'In stock', 'Par', 'Needed', 'Status', 'Adjust'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 14px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No items in this category</td></tr>
              ) : filtered.map(i => {
                const low = (i.currentStock || 0) < (i.parLevel || 0);
                const pct = i.parLevel ? Math.min(100, Math.round((i.currentStock / i.parLevel) * 100)) : 100;
                const fillColor = low ? 'var(--danger)' : pct < 150 ? 'var(--gold)' : 'var(--success)';
                const needed = neededCounts[i.id] || 0;
                return (
                  <tr key={i.id} style={{ background: low ? 'var(--danger-bg)' : 'transparent' }}>
                    <Td><strong>{i.name}</strong></Td>
                    <Td muted>{i.category}</Td>
                    <Td muted>{i.size || '—'}</Td>
                    <Td muted>{i.unit || '—'}</Td>
                    <Td>
                      <strong>{i.currentStock ?? '—'}</strong>
                      <div style={{ width: 80, height: 4, background: 'var(--mid)', borderRadius: 2, marginTop: 3 }}>
                        <div style={{ width: `${pct}%`, height: 4, background: fillColor, borderRadius: 2 }} />
                      </div>
                    </Td>
                    <Td muted>{i.parLevel ?? '—'}</Td>
                    <Td>{needed ? <span style={{ fontWeight: 500, color: 'var(--warning, #b8720a)' }}>{needed}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</Td>
                    <Td>
                      {low
                        ? <span style={{ background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 12 }}>Below par</span>
                        : <span style={{ background: 'var(--success-bg)', color: 'var(--success)', fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 12 }}>OK</span>}
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="number" min="0" placeholder="0"
                          value={adjustInputs[i.id] || ''}
                          onChange={e => setAdjustInputs({ ...adjustInputs, [i.id]: e.target.value })}
                          style={{ width: 56, padding: '4px 7px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12, textAlign: 'center' }}
                        />
                        <button onClick={() => adjust(i.id, i.name, 1)} style={miniBtn}>+</button>
                        <button onClick={() => adjust(i.id, i.name, -1)} style={miniBtn}>−</button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

function Td({ children, muted }) { return <td style={{ padding: '10px 14px', fontSize: 13, borderBottom: '1px solid var(--off)', color: muted ? 'var(--muted)' : 'inherit' }}>{children}</td>; }
const miniBtn = { background: 'transparent', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 8px', fontSize: 11, cursor: 'pointer' };
