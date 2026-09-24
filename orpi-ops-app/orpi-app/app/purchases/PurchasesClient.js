'use client';
//
// Purchases — one screen for everything you buy.
//
// A line here can do three things at once: log the purchase (which is what sets
// the price everything else is costed at), put the stock on the shelf, and
// charge an event for the part of it that got used. Link an event and a "used"
// column appears; whatever you don't mark as used stays in stock.
//
// That last bit is the whole point. Buy 6 litres of cherry juice for a wedding,
// use 2, and the wedding carries 2 while 4 go back on the shelf — without
// anyone working it out.

import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../AppShell';
import { matchScore, SUGGEST_AT } from '@/lib/matching';
import { CATEGORIES } from '@/lib/taxonomy';

// lib/matching deliberately ignores bottle sizes, because "Absolut" has to find
// "Absolut Vodka 1L" when a quote is matched to stock. Here that's the wrong
// question. "Gordons Dry Gin 70cl" and "Gordons Dry Gin 1L" are the same words
// and a different bottle, and they're meant to be two rows in inventory — so
// "do we already have this?" is decided on the literal name, and everything
// close but not identical is raised as a possible duplicate instead.
const flat = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const sameProduct = (a, b) => flat(a) === flat(b);
const dupesOf = (name, inv) => inv
  .map(i => ({ i, s: matchScore(name, i.name) }))
  .filter(x => x.s >= SUGGEST_AT && !sameProduct(x.i.name, name))
  .sort((a, b) => b.s - a.s)
  .slice(0, 3)
  .map(x => x.i);

const UNITS = ['Bottle', 'Can', 'Case', 'Litre', 'Kg', 'Each', 'Pack'];
const OWNERS = ['Business', 'Director'];
const CHUNK = 5;
const DRAFT_KEY = 'orpi:purchase-draft';

const n = v => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
const money = v => `£${(Math.round(v * 100) / 100).toFixed(2)}`;
const today = () => new Date().toISOString().split('T')[0];

// Price can be typed per unit or as the line total off a receipt. Everything
// downstream wants the unit cost, so convert once, here.
const unitOf = (r, mode) => {
  const q = n(r.qty), p = n(r.price);
  return mode === 'total' ? (q ? p / q : 0) : p;
};
const spendOf = (r, mode) => n(r.qty) * unitOf(r, mode);

const fmtDate = d => {
  if (!d) return '';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  catch { return d; }
};

export default function PurchasesClient({ userEmail }) {
  const [inv, setInv] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [recent, setRecent] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [head, setHead] = useState({ date: today(), supplier: '', ownedBy: 'Business', adHoc: false, bookingId: '' });
  const [priceMode, setPriceMode] = useState('each');
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [newFor, setNewFor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);

  const seq = useRef(0);
  const searchRef = useRef(null);

  async function load() {
    setLoading(true); setErr('');
    try {
      const [stock, bk, pur] = await Promise.all([
        fetch('/api/stock').then(r => r.json()).catch(() => ({})),
        fetch('/api/bookings').then(r => r.json()).catch(() => ({})),
        fetch('/api/purchases').then(r => r.json()).catch(() => ({})),
      ]);
      if (stock.error) throw new Error(stock.error);
      setInv(stock.items || []);
      setBookings(bk.bookings || []);
      setRecent(pur.purchases || []);
      setSuppliers(pur.suppliers || []);
    } catch (e) {
      setErr(e.message || 'Could not load inventory.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // Handed over from the run sheet's shopping list, so nothing gets retyped
  // standing in a cash and carry. Runs once inventory is in, because the names
  // have to be resolved to real items before they can be costed.
  useEffect(() => {
    if (!inv.length) return;
    let draft;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      sessionStorage.removeItem(DRAFT_KEY);
      draft = JSON.parse(raw);
    } catch { return; }
    if (!draft?.items?.length) return;

    setHead(h => ({ ...h, bookingId: draft.bookingId || '', adHoc: draft.adHoc ?? true }));
    // The run sheet's "paid" box is what the whole line came to, not a unit price.
    if (draft.priceMode) setPriceMode(draft.priceMode);
    setRows(draft.items.map(it => {
      // Linked only on an exact name. The run sheet's shopping rows come from
      // inventory so they match; typed extras (blue roll, limes) don't, and
      // guessing at those would put stock against the wrong bottle.
      const known = inv.find(i => sameProduct(i.name, it.name)) || null;
      return {
        key: `k${++seq.current}`,
        itemId: known?.id || '',
        name: known?.name || it.name,
        category: known?.category || 'Other',
        size: '', unit: '',
        qty: it.qty ? String(it.qty) : '',
        price: it.price ? String(it.price) : '',
        used: '',
        // Anything the run sheet couldn't match is treated as a new product, so
        // the duplicate check runs on it before a second row appears in Notion.
        unmatched: !known, isNew: !known,
      };
    }));
  }, [inv]);

  const byId = useMemo(() => { const m = {}; inv.forEach(i => { m[i.id] = i; }); return m; }, [inv]);

  const evLinked = !!head.bookingId;
  const booking = bookings.find(b => b.id === head.bookingId);
  const eventLabel = booking ? (booking.clientName || booking.name || '') : '';

  const taken = useMemo(() => new Set(rows.map(r => r.itemId).filter(Boolean)), [rows]);
  const hits = useMemo(() => {
    const term = q.trim();
    if (term.length < 2) return [];
    return inv
      .map(i => ({ i, s: Math.max(matchScore(term, i.name), i.name.toLowerCase().includes(term.toLowerCase()) ? 0.8 : 0) }))
      .filter(x => x.s > 0.35 && !taken.has(x.i.id))
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map(x => x.i);
  }, [q, inv, taken]);
  // Checked against all of inventory, not just the visible hits — an item
  // already on this receipt is still a reason not to offer "add as new".
  const exact = q.trim().length >= 2 && inv.some(i => sameProduct(i.name, q));

  const spend = rows.reduce((t, r) => t + spendOf(r, priceMode), 0);
  const charged = rows.reduce((t, r) => t + (evLinked ? Math.min(n(r.qty), n(r.used)) * unitOf(r, priceMode) : 0), 0);
  const toStock = spend - charged;
  const usable = rows.filter(r => r.name.trim() && n(r.qty) > 0);
  const unpriced = usable.filter(r => n(r.price) <= 0);

  // Price is deliberately left empty. Pre-filling it with the last known cost
  // invites tapping through, and a guessed figure saved as a real purchase is
  // exactly what makes the average wrong. The old price shows on the row as a
  // hint instead, so a surprise is visible.
  function addRow(item) {
    setRows(rs => [...rs, {
      key: `k${++seq.current}`,
      itemId: item?.id || '', name: item?.name || '', category: item?.category || '',
      size: item?.size || '', unit: item?.unit || '',
      qty: '1', price: '', used: '',
    }]);
    setQ('');
    searchRef.current?.focus();
  }
  const patch = (key, k, v) => setRows(rs => rs.map(r => (r.key === key ? { ...r, [k]: v } : r)));
  const drop = key => setRows(rs => rs.filter(r => r.key !== key));
  const useAll = () => setRows(rs => rs.map(r => ({ ...r, used: r.qty })));

  function saveNewItem(f) {
    const name = (f.name || '').trim();
    if (!name) return;
    setRows(rs => [...rs, {
      key: `k${++seq.current}`,
      itemId: '', name, category: f.category, size: f.size, unit: f.unit,
      qty: '1', price: '', used: '', isNew: true,
    }]);
    setNewFor(null); setQ('');
  }

  async function save() {
    if (!usable.length) { setResult({ error: 'Add at least one item with a quantity.' }); return; }
    if (unpriced.length && !confirm(
      `${unpriced.length} item${unpriced.length === 1 ? ' has' : 's have'} no price. ` +
      'They\'ll go into stock but won\'t update what anything costs. Save anyway?'
    )) return;

    setSaving(true); setResult(null);
    const done = { saved: [], createdItems: [], failed: [], spend: 0, charged: 0, toStock: 0 };
    // Tracked by row key, not name — two lines can share a name, and rows with
    // no quantity aren't sent at all but must survive on screen.
    const savedKeys = new Set();

    try {
      for (let i = 0; i < usable.length; i += CHUNK) {
        const slice = usable.slice(i, i + CHUNK);
        setProgress(`Saving ${Math.min(i + slice.length, usable.length)} of ${usable.length}…`);

        const res = await fetch('/api/purchases', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dateBought: head.date, supplier: head.supplier, ownedBy: head.ownedBy,
            adHoc: head.adHoc, bookingId: head.bookingId, eventLabel,
            lines: slice.map(r => ({
              itemId: r.itemId, name: r.name.trim(), category: r.category, size: r.size, unit: r.unit,
              qty: n(r.qty), unitCost: unitOf(r, priceMode),
              used: evLinked ? Math.min(n(r.qty), n(r.used)) : 0,
            })),
          }),
        }).then(r => r.json());

        if (res.error) {
          // Stop rather than push on — a half-written receipt is worse than a
          // clear line about where it got to.
          setResult({ ...done, error: res.error, partial: done.saved.length > 0 });
          setRows(rs => rs.filter(r => !savedKeys.has(r.key)));
          return;
        }

        done.saved.push(...(res.saved || []));
        done.createdItems.push(...(res.createdItems || []));
        done.failed.push(...(res.failed || []));
        done.spend += res.spend || 0;
        done.charged += res.charged || 0;
        done.toStock += res.toStock || 0;

        // Clear what landed, so a retry can never save the same line twice.
        const ok = new Set((res.saved || []).map(s => s.name));
        slice.forEach(r => { if (ok.has(r.name.trim())) savedKeys.add(r.key); });
      }

      setResult(done);
      setRows(rs => rs.filter(r => !savedKeys.has(r.key)));
      load();
    } catch (e) {
      setResult({ ...done, error: 'Lost connection partway through. Check Notion before saving again — some lines may already be in.', partial: true });
    } finally {
      setSaving(false); setProgress('');
    }
  }

  return (
    <AppShell active="/purchases" userEmail={userEmail}>
      <style>{CSS}</style>

      <div className="pu-head">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Purchases</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
            Logs the price, adds the stock, and charges the event — in one go
          </p>
        </div>
        <button onClick={save} disabled={saving || !usable.length} className="pu-save">
          {saving ? (progress || 'Saving…') : `Save ${usable.length || ''} ${usable.length === 1 ? 'line' : 'lines'}`.trim()}
        </button>
      </div>

      {err && <Banner tone="danger">Couldn't load inventory: {err} <button onClick={load} className="pu-link">Retry</button></Banner>}
      {result && <ResultBanner result={result} />}

      {/* ---- The receipt header ---- */}
      <div className="pu-card">
        <div className="pu-grid4">
          <Field label="Date bought">
            <input type="date" className="pu-input" value={head.date} onChange={e => setHead({ ...head, date: e.target.value })} />
          </Field>
          <Field label="Supplier">
            <input className="pu-input" list="pu-suppliers" placeholder="Bookers, Tesco…" value={head.supplier}
              onChange={e => setHead({ ...head, supplier: e.target.value })} />
            <datalist id="pu-suppliers">{suppliers.map(s => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="Paid by">
            <select className="pu-input" value={head.ownedBy} onChange={e => setHead({ ...head, ownedBy: e.target.value })}>
              {OWNERS.map(o => <option key={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="For an event?">
            <select className="pu-input" value={head.bookingId} onChange={e => setHead({ ...head, bookingId: e.target.value })}>
              <option value="">Just restocking</option>
              {bookings.map(b => (
                <option key={b.id} value={b.id}>{b.clientName || b.name}{b.eventDate ? ` — ${fmtDate(b.eventDate)}` : ''}</option>
              ))}
            </select>
          </Field>
        </div>

        <label className="pu-check">
          <input type="checkbox" checked={head.adHoc} onChange={e => setHead({ ...head, adHoc: e.target.checked })} />
          <span>
            <b>Emergency buy</b> — corner shop on the way to a venue. Still charged to the event,
            but kept out of the average that sets what things cost.
          </span>
        </label>

        {evLinked && (
          <div className="pu-note">
            Costs go to <b>{eventLabel}</b>. Fill in <b>used</b> for each line — anything you don't
            mark as used stays in stock for the next event.
          </div>
        )}
      </div>

      {/* ---- Add items ---- */}
      <div className="pu-card">
        <div className="pu-searchwrap">
          <input
            ref={searchRef} className="pu-input pu-search" placeholder="Search inventory, or type a new product name…"
            value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && hits.length) { e.preventDefault(); addRow(hits[0]); } }}
          />
          {q.trim().length >= 2 && (
            <div className="pu-hits">
              {hits.map(i => (
                <button key={i.id} className="pu-hit" onClick={() => addRow(i)}>
                  <span>
                    <b>{i.name}</b>
                    <small>{[i.category, i.size].filter(Boolean).join(' · ')}</small>
                  </span>
                  <small>{i.currentStock ?? 0} in stock</small>
                </button>
              ))}
              {!exact && (
                <button className="pu-hit pu-hit-new" onClick={() => setNewFor(q.trim())}>
                  + Add “{q.trim()}” as a new product
                </button>
              )}
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="pu-modes">
            <span>Price entered as</span>
            <button className={priceMode === 'each' ? 'pu-mode on' : 'pu-mode'} onClick={() => setPriceMode('each')}>each</button>
            <button className={priceMode === 'total' ? 'pu-mode on' : 'pu-mode'} onClick={() => setPriceMode('total')}>line total</button>
            {evLinked && <button className="pu-link" style={{ marginLeft: 'auto' }} onClick={useAll}>Mark everything used</button>}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="pu-empty">Nothing added yet. Search above, or paste a shopping list over from the run sheet.</div>
        ) : (
          <div className="pu-rows">
            <div className={evLinked ? 'pu-row pu-row-ev pu-rowhead' : 'pu-row pu-rowhead'}>
              <span>Item</span><span>Qty</span><span>{priceMode === 'each' ? '£ each' : '£ total'}</span>
              {evLinked && <span>Used</span>}
              <span className="pu-right">Line</span><span />
            </div>
            {rows.map(r => {
              const u = unitOf(r, priceMode);
              const left = n(r.qty) - Math.min(n(r.qty), n(r.used));
              const dupes = (r.isNew || r.unmatched) ? dupesOf(r.name, inv) : [];
              const known = byId[r.itemId];
              const last = known?.averageUnitCost || 0;
              // Flagged when what you paid is a long way off what the books say
              // — usually a typo, occasionally a genuine price rise worth seeing.
              const off = last > 0 && u > 0 && Math.abs(u - last) / last > 0.25;
              return (
                <div key={r.key}>
                  <div className={evLinked ? 'pu-row pu-row-ev' : 'pu-row'}>
                    <span className="pu-name">
                      <b>{r.name}</b>
                      <small>
                        {r.isNew ? 'new product' : r.category || ''}
                        {r.unmatched ? ' · not in inventory — will be created' : ''}
                        {known ? ` · ${known.currentStock ?? 0} in stock` : ''}
                        {last > 0 && <em className={off ? 'pu-off' : 'pu-plain'}> · last {money(last)}</em>}
                      </small>
                    </span>
                    <input className="pu-input pu-sm" inputMode="decimal" placeholder="qty"
                      value={r.qty} onChange={e => patch(r.key, 'qty', e.target.value.replace(/[^0-9.]/g, ''))} />
                    <input className="pu-input pu-sm" inputMode="decimal" placeholder="0.00"
                      value={r.price} onChange={e => patch(r.key, 'price', e.target.value.replace(/[^0-9.]/g, ''))} />
                    {evLinked && (
                      <span className="pu-used">
                        <input className="pu-input pu-sm" inputMode="decimal" placeholder="0"
                          value={r.used} onChange={e => patch(r.key, 'used', e.target.value.replace(/[^0-9.]/g, ''))} />
                        <button className="pu-link" onClick={() => patch(r.key, 'used', r.qty)}>all</button>
                      </span>
                    )}
                    <span className="pu-right pu-line">
                      {money(spendOf(r, priceMode))}
                      {priceMode === 'total' && n(r.qty) > 0 && <small>{money(u)} each</small>}
                      {evLinked && left > 0 && <small>{left} left over</small>}
                    </span>
                    <button className="pu-x" onClick={() => drop(r.key)} aria-label="Remove">×</button>
                  </div>
                  {dupes.length > 0 && (
                    <div className="pu-dupe">
                      Already in inventory: {dupes.map(d => d.name).join(', ')}.{' '}
                      <button className="pu-link" onClick={() => { drop(r.key); addRow(dupes[0]); }}>
                        Use {dupes[0].name} instead
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {rows.length > 0 && (
          <div className="pu-totals">
            <Total label="Spent" value={money(spend)} strong />
            {evLinked && <Total label={`To ${eventLabel || 'the event'}`} value={money(charged)} />}
            {evLinked && <Total label="Stays in stock" value={money(toStock)} />}
            {!evLinked && <Total label="All to stock" value={money(spend)} />}
          </div>
        )}
      </div>

      {/* ---- Recent ---- */}
      <div className="pu-card">
        <h2 className="pu-h2">Recent purchases</h2>
        {loading ? <div className="pu-empty">Loading…</div>
          : recent.length === 0 ? <div className="pu-empty">Nothing logged yet.</div>
            : (
              <div className="pu-recent">
                {recent.slice(0, 25).map(p => (
                  <div key={p.id} className="pu-rec">
                    <span>
                      <b>{p.item || p.line}</b>
                      <small>{[fmtDate(p.dateBought), p.supplier, p.adHoc ? 'emergency' : ''].filter(Boolean).join(' · ')}</small>
                    </span>
                    <small>{p.qty ?? '—'} × {p.unitCost != null ? money(p.unitCost) : '—'}</small>
                  </div>
                ))}
              </div>
            )}
      </div>

      {newFor !== null && <NewProductSheet name={newFor} inv={inv} onCancel={() => setNewFor(null)} onSave={saveNewItem} />}
    </AppShell>
  );
}

/* ---------- pieces (kept out here so typing never remounts an input) -------- */

function Field({ label, children }) {
  return <label className="pu-field"><span>{label}</span>{children}</label>;
}
function Total({ label, value, strong }) {
  return <div className={strong ? 'pu-total strong' : 'pu-total'}><span>{label}</span><b>{value}</b></div>;
}
function Banner({ tone, children }) {
  return <div className={`pu-banner ${tone}`}>{children}</div>;
}

function ResultBanner({ result }) {
  if (result.error && !result.partial) return <Banner tone="danger">{result.error}</Banner>;
  const { saved = [], createdItems = [], failed = [] } = result;
  return (
    <Banner tone={result.error ? 'warn' : 'ok'}>
      {result.error && <div style={{ marginBottom: 6 }}><b>Stopped partway.</b> {result.error}</div>}
      <div>
        <b>{saved.length} line{saved.length === 1 ? '' : 's'} saved</b> — {money(result.spend)} spent
        {result.charged > 0 && <> · {money(result.charged)} charged to the event</>}
        {result.toStock > 0 && <> · {money(result.toStock)} added to stock</>}
      </div>
      {createdItems.length > 0 && <div style={{ marginTop: 4 }}>New inventory items: {createdItems.join(', ')}</div>}
      {failed.length > 0 && (
        <div style={{ marginTop: 4 }}>
          Not saved: {failed.map(f => `${f.name} (${f.why})`).join('; ')}
        </div>
      )}
    </Banner>
  );
}

function NewProductSheet({ name, inv, onCancel, onSave }) {
  const [f, setF] = useState({ name, category: 'Other', size: '', unit: 'Bottle' });
  const dupes = dupesOf(f.name, inv);
  return (
    <div className="pu-modal" onClick={onCancel}>
      <div className="pu-sheet" onClick={e => e.stopPropagation()}>
        <h2 className="pu-h2">New product</h2>
        {dupes.length > 0 && (
          <div className="pu-banner warn" style={{ margin: '0 0 12px' }}>
            Similar items already exist: <b>{dupes.map(d => d.name).join(', ')}</b>. Duplicates split
            your stock and your pricing — worth checking this isn't one of those in another size.
          </div>
        )}
        <Field label="Name"><input className="pu-input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <div className="pu-grid3">
          <Field label="Category">
            <select className="pu-input" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Size"><input className="pu-input" placeholder="70cl" value={f.size} onChange={e => setF({ ...f, size: e.target.value })} /></Field>
          <Field label="Unit">
            <select className="pu-input" value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="pu-save" onClick={() => onSave(f)}>Add to this receipt</button>
          <button className="pu-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.pu-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.pu-card{background:#fff;border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px}
.pu-h2{font-size:13px;font-weight:600;margin-bottom:10px}
.pu-input{width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:8px;font-size:16px;background:#fff}
.pu-sm{text-align:center;padding:9px 6px}
.pu-field{display:block;margin-bottom:10px}
.pu-field>span{display:block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:4px}
.pu-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.pu-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.pu-check{display:flex;gap:9px;align-items:flex-start;font-size:12px;color:var(--muted);margin-top:4px;line-height:1.5}
.pu-check input{margin-top:2px;flex-shrink:0}
.pu-note{background:var(--gold-bg);color:#8a6a00;padding:9px 12px;border-radius:8px;font-size:12.5px;margin-top:12px;line-height:1.5}
.pu-searchwrap{position:relative}
.pu-search{font-size:16px}
.pu-hits{position:absolute;top:100%;left:0;right:0;z-index:50;background:#fff;border:1px solid var(--border);border-radius:8px;margin-top:4px;box-shadow:0 8px 24px rgba(0,0,0,.09);overflow:hidden;max-height:330px;overflow-y:auto}
.pu-hit{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;border:none;background:#fff;border-bottom:1px solid var(--off);font-size:13px;cursor:pointer}
.pu-hit:hover{background:var(--off)}
.pu-hit small{display:block;color:var(--muted);font-size:11px;margin-top:1px}
.pu-hit-new{color:var(--gold);font-weight:500}
.pu-modes{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--muted);margin:14px 0 8px}
.pu-mode{border:1px solid var(--border);background:#fff;border-radius:20px;padding:3px 11px;font-size:11px;cursor:pointer;color:var(--muted)}
.pu-mode.on{background:var(--black);color:#fff;border-color:var(--black)}
.pu-rows{border-top:1px solid var(--border)}
.pu-row{display:grid;grid-template-columns:1fr 70px 88px 88px 34px;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid var(--off)}
.pu-row-ev{grid-template-columns:1fr 66px 82px 96px 88px 34px}
.pu-rowhead{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);border-bottom:1px solid var(--border);padding:8px 0}
.pu-name b{font-size:13px;font-weight:500;display:block}
.pu-name small{font-size:11px;color:var(--muted)}
.pu-used{display:flex;align-items:center;gap:5px}
.pu-right{text-align:right}
.pu-line{font-size:13px;font-variant-numeric:tabular-nums}
.pu-line small{display:block;font-size:10.5px;color:var(--muted);font-weight:400}
.pu-x{background:none;border:none;color:#c9c4ba;font-size:20px;line-height:1;cursor:pointer;padding:0}
.pu-dupe{background:#fef6e4;color:#b8720a;font-size:12px;padding:7px 10px;border-radius:7px;margin:0 0 8px}
.pu-plain{font-style:normal}
.pu-off{font-style:normal;color:#b8720a;font-weight:500}
.pu-link{background:none;border:none;color:var(--gold);font-size:11.5px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:0}
.pu-totals{display:flex;gap:22px;flex-wrap:wrap;border-top:1px solid var(--border);margin-top:4px;padding-top:12px}
.pu-total span{display:block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.pu-total b{font-size:15px;font-variant-numeric:tabular-nums}
.pu-total.strong b{font-size:19px}
.pu-empty{color:var(--muted);font-size:13px;padding:18px 0;text-align:center}
.pu-recent{border-top:1px solid var(--border)}
.pu-rec{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--off);font-size:13px}
.pu-rec b{font-weight:500}
.pu-rec small{color:var(--muted);font-size:11px;white-space:nowrap}
.pu-rec span small{display:block;white-space:normal}
.pu-save{background:var(--black);color:#fff;border:none;border-radius:8px;padding:10px 18px;font-size:13px;cursor:pointer}
.pu-save:disabled{opacity:.4;cursor:default}
.pu-ghost{background:transparent;border:1px solid var(--border);border-radius:8px;padding:10px 18px;font-size:13px;cursor:pointer}
.pu-banner{padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:13px;line-height:1.5}
.pu-banner.ok{background:var(--success-bg);color:var(--success)}
.pu-banner.warn{background:#fef6e4;color:#b8720a}
.pu-banner.danger{background:var(--danger-bg);color:var(--danger)}
.pu-modal{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;display:flex;align-items:flex-start;justify-content:center;padding:40px 12px;overflow-y:auto}
.pu-sheet{background:#fff;border-radius:12px;width:520px;max-width:100%;padding:22px}
@media(max-width:820px){
  .pu-grid4,.pu-grid3{grid-template-columns:1fr 1fr}
  /* Name takes its own line, then the numbers sit under it. The header row is
     hidden, so each input keeps its placeholder as the label. */
  .pu-row{grid-template-columns:56px 78px 1fr 30px;row-gap:6px;column-gap:7px}
  .pu-row-ev{grid-template-columns:52px 66px 74px 1fr 30px;row-gap:6px;column-gap:6px}
  .pu-row .pu-name,.pu-row-ev .pu-name{grid-column:1/-1}
  .pu-rowhead{display:none}
  .pu-used .pu-link{display:none}
  .pu-line small{font-size:10px}
  .pu-totals{gap:16px}
  .pu-head .pu-save{width:100%}
  .pu-sm{padding:9px 4px}
}
`;
