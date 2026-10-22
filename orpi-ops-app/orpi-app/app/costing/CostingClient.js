'use client';
// Drinks costing gaps. Reads /api/drinks (which costs every recipe ingredient
// live from Inventory + Purchases) and flags each drink whose per-serve cost is
// understated because an ingredient isn't linked to stock, or is linked to an
// item with no price / no bottle volume. This is what makes a never-made
// cocktail show an unreal low cost per serve.
import { useEffect, useState } from 'react';
import AppShell from '../AppShell';
import { GARNISH_SECTION } from '@/lib/taxonomy';

const gbp = n => '£' + (Number(n) || 0).toFixed(2);

export default function CostingClient({ userEmail }) {
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyGaps, setOnlyGaps] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/api/drinks').then(r => r.json()).then(res => {
      if (res.error) setError(res.error);
      else setDrinks(res.drinks || []);
      setLoading(false);
    }).catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  // A "gap" is a non-garnish ingredient that costs £0 — either not linked to a
  // stock item (no `s`), or linked to one with no price / no volume (c === 0).
  const rows = drinks.map(d => {
    const liquid = (d.ing || []).filter(i => i.sec !== GARNISH_SECTION);
    const gaps = liquid.filter(i => !(i.c > 0)).map(i => ({
      name: i.n,
      stock: i.s || '',
      reason: i.s ? 'linked to “' + i.s + '” but it has no price/volume' : 'not linked to a stock item',
    }));
    const costSoFar = liquid.reduce((s, i) => s + (Number(i.c) || 0), 0);
    return { name: d.name, type: d.type, tier: d.tier, gaps, costSoFar, complete: gaps.length === 0 };
  });

  const total = rows.length;
  const complete = rows.filter(r => r.complete).length;
  const gapsCount = total - complete;
  const ingredientGaps = rows.reduce((s, r) => s + r.gaps.length, 0);

  const ql = q.trim().toLowerCase();
  const shown = rows
    .filter(r => (onlyGaps ? !r.complete : true))
    .filter(r => !ql || r.name.toLowerCase().includes(ql) || r.gaps.some(g => (g.name || '').toLowerCase().includes(ql)))
    .sort((a, b) => Number(a.complete) - Number(b.complete) || b.gaps.length - a.gaps.length || a.name.localeCompare(b.name));

  return (
    <AppShell active="/costing" userEmail={userEmail}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Drinks costing</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3, lineHeight: 1.5, maxWidth: 680 }}>
          Every drink whose per-serve cost is understated because an ingredient isn&rsquo;t priced.
          Fix each by linking the ingredient to a stock item in the Notion recipe, or logging a purchase
          (and a bottle volume) for the item it points to.
        </p>
      </div>

      {error && <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>Couldn&rsquo;t load drinks: {error}</div>}

      {!loading && !error && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <Stat label="Drinks" value={total} />
          <Stat label="Fully costed" value={complete} tone="var(--success)" />
          <Stat label="With gaps" value={gapsCount} tone={gapsCount ? '#b8720a' : 'var(--muted)'} />
          <Stat label="Ingredients to price" value={ingredientGaps} tone={ingredientGaps ? 'var(--danger)' : 'var(--muted)'} />
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search drink or ingredient…"
            style={{ flex: 1, minWidth: 220, maxWidth: 320, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
          <label style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyGaps} onChange={e => setOnlyGaps(e.target.checked)} /> Only show drinks with gaps
          </label>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center' }}>Loading drinks &amp; prices…</div>
      ) : shown.length === 0 ? (
        <div style={{ background: 'var(--success-bg)', color: 'var(--success)', padding: '14px 18px', borderRadius: 8, fontSize: 13 }}>
          {onlyGaps ? '✓ No costing gaps — every drink is fully priced.' : 'No drinks match.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((r, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid var(--border)', borderLeft: `3px solid ${r.complete ? 'var(--success)' : '#e0a13a'}`, borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</span>
                  {r.type && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{r.type}{r.tier ? ` · ${r.tier}` : ''}</span>}
                </div>
                <div style={{ fontSize: 13, color: r.complete ? 'var(--text)' : '#b8720a', whiteSpace: 'nowrap' }}>
                  {r.complete ? gbp(r.costSoFar) : `${gbp(r.costSoFar)} so far`}
                </div>
              </div>
              {!r.complete && (
                <ul style={{ margin: '8px 0 0 18px', padding: 0, fontSize: 12.5, color: '#7a5a00', lineHeight: 1.6 }}>
                  {r.gaps.map((g, j) => (
                    <li key={j}><strong>{g.name}</strong> — {g.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 18px', minWidth: 130 }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4, color: tone || 'var(--text)' }}>{value}</div>
    </div>
  );
}
