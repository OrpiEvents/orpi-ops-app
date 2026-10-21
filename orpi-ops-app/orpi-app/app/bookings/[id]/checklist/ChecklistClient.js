'use client';
import { useEffect, useState } from 'react';
import AppShell from '../../../AppShell';
import { createClient } from '@/lib/supabaseBrowser';

const STANDARD_CHECKLIST = {
  'Admin & Booking': [
    'Deposit received', 'Balance received', 'Final guest count confirmed',
    'Cocktail & mocktail selection signed off by client', 'Drinks tasting scheduled & completed',
    'Venue contact and access time confirmed', 'Internal notes reviewed by whole team',
  ],
  'Staffing & Logistics': [
    'Staff count confirmed', 'Lead bartender assigned', 'Staff briefed on run of show & drink specs',
    'Staff travel / arrival time confirmed', 'Uniform / dress code confirmed', 'Transport to venue booked',
  ],
  'Bar Kit & Stock': [
    'Soft drinks & mixers packed', 'Garnishes packed',
    'Ice supply confirmed', 'Glassware confirmed (venue or ORPI backup)', 'Boston shakers, strainers, jiggers packed',
    'Bar mats, spill trays, waste bags packed', 'Dry ice / smoke gun / extras tested if included',
  ],
  'Event Day': [
    'Arrived on time, venue access confirmed', 'Bar set up and dressed', 'Glassware checked and racked',
    'Back bar laid out', 'Soft drinks chilled and stocked', 'Bar menus displayed', 'Mid-event stock check',
    'Bar closed on time', 'All equipment packed and venue left clean', 'Leftover stock counted',
    'Client / planner sign-off obtained', 'Post-event debrief notes filed',
  ],
};
// Only relevant when ORPI is supplying the alcohol — spliced into
// "Bar Kit & Stock" ahead of the other items when applicable.
const ALCOHOL_ONLY_ITEM = 'All spirits for menu ordered/packed';

// Run-sheet draft, keyed by booking in the shared app_state table, so a van
// load-out and the post-event reconcile can be done on different devices.
async function saveRunsheetDraft(bookingId, state) {
  try {
    await createClient().from('app_state').upsert({
      key: `runsheet:${bookingId}`, value: state, updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  } catch { /* best effort */ }
}

export default function ChecklistClient({ userEmail, booking, costs, cocktails, mocktails, stockItems, cocktailStock = [], serviceStock = [], savedRunsheet = null, garnishSuggestions = [], error }) {
  const combinedSuggested = [...cocktailStock, ...serviceStock];
  const suggestedIds = new Set(combinedSuggested.map(s => s.id));

  // ── Run sheet: three buckets ─────────────────────────────────────
  //  loaded  { [itemId]: { takenOut, returned } }  — stock we already owned
  //  bought  [{ id, inventoryItemId, itemName, category, unitCost, boughtQty, returned, addToLibrary }]
  //  garnish { [name]: cost }  — per-event actuals
  const [loaded, setLoaded] = useState(() => savedRunsheet?.loaded || {});
  const [bought, setBought] = useState(() => savedRunsheet?.bought || []);
  const [garnish, setGarnish] = useState(() => savedRunsheet?.garnish || {});
  const [addItemId, setAddItemId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Autosave the in-progress sheet to the booking (debounced), so the van
  // load-out and the post-event reconcile can happen on different devices.
  useEffect(() => {
    if (!booking?.id) return;
    const t = setTimeout(() => saveRunsheetDraft(booking.id, { loaded, bought, garnish, savedAt: new Date().toISOString() }), 800);
    return () => clearTimeout(t);
  }, [loaded, bought, garnish, booking]);

  if (error || !booking) {
    return (
      <AppShell active="/bookings" userEmail={userEmail}>
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '14px 18px', borderRadius: 8 }}>
          Couldn't load this booking: {error || 'not found'}
        </div>
      </AppShell>
    );
  }

  const providesAlcohol = booking.alcoholProvidedBy === 'ORPI';
  const flags = buildFlags(booking, cocktails, mocktails);
  const totalCost = costs.reduce((s, c) => s + (c.finalCost ?? c.cost ?? 0), 0);
  const staffNeeded = (booking.guestCount || 0) > 150 ? '6+' : '4+';
  const num = v => Number(v) || 0;

  // Style shorthands, kept local so the three buckets read cleanly.
  const inpStyle = { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 16, textAlign: 'center', background: '#faf9f6' };
  const lblStyle = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', display: 'block', marginBottom: 4 };
  const cardStyle = { background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 };
  const bucketLabel = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold)', margin: '4px 0 8px' };

  // Loaded rows = suggested stock (always shown) + anything manually added.
  const loadedIds = [...new Set([...combinedSuggested.map(s => s.id), ...Object.keys(loaded)])];
  const loadedRows = loadedIds.map(id => ({ item: stockItems.find(s => s.id === id), manual: !suggestedIds.has(id), ...(loaded[id] || { takenOut: '', returned: '' }) })).filter(r => r.item);

  function setLoadedField(id, field, value) { setLoaded(prev => ({ ...prev, [id]: { ...(prev[id] || { takenOut: '', returned: '' }), [field]: value } })); }
  function clearLoaded(id) { setLoaded(prev => { const nx = { ...prev }; delete nx[id]; return nx; }); }
  function addLoaded() { if (!addItemId) return; setLoaded(prev => prev[addItemId] ? prev : ({ ...prev, [addItemId]: { takenOut: '', returned: '' } })); setAddItemId(''); }

  function addBought() { setBought(prev => [...prev, { id: Date.now(), inventoryItemId: '', itemName: '', category: 'Spirit', unitCost: '', boughtQty: '', returned: '', addToLibrary: false }]); }
  function updateBought(id, patch) { setBought(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b)); }
  function removeBought(id) { setBought(prev => prev.filter(b => b.id !== id)); }
  function pickBoughtItem(id, invId) {
    const it = stockItems.find(s => s.id === invId);
    updateBought(id, it ? { inventoryItemId: invId, itemName: it.name, category: it.category, unitCost: it.averageUnitCost ?? '', addToLibrary: false } : { inventoryItemId: '' });
  }

  const garnishNames = [...new Set([...garnishSuggestions, ...Object.keys(garnish)])];
  function setGarnishCost(name, value) { setGarnish(prev => ({ ...prev, [name]: value })); }
  function addGarnish(name) { const t = (name || '').trim(); if (!t) return; setGarnish(prev => ({ ...prev, [t]: prev[t] ?? '' })); }

  const loadedCost = loadedRows.reduce((t, r) => t + Math.max(0, num(r.takenOut) - num(r.returned)) * num(r.item.averageUnitCost), 0);
  const boughtCost = bought.reduce((t, b) => t + Math.max(0, num(b.boughtQty) - num(b.returned)) * num(b.unitCost), 0);
  const garnishTotal = garnishNames.reduce((t, nm) => t + num(garnish[nm]), 0);
  const eventCost = loadedCost + boughtCost + garnishTotal;
  const backToStock = loadedRows.reduce((t, r) => t + num(r.returned), 0) + bought.reduce((t, b) => t + num(b.returned), 0);

  async function saveRunSheet() {
    const loadedPayload = loadedRows.filter(r => r.takenOut !== '' || r.returned !== '').map(r => ({
      inventoryItemId: r.item.id, itemName: r.item.name, category: r.item.category,
      currentStock: r.item.currentStock, averageUnitCost: r.item.averageUnitCost,
      takenOut: r.takenOut, returned: r.returned,
    }));
    const boughtPayload = bought.filter(b => num(b.boughtQty) > 0).map(b => ({
      inventoryItemId: b.inventoryItemId || null, itemName: b.itemName || 'Unnamed item', category: b.category,
      currentStock: b.inventoryItemId ? (stockItems.find(s => s.id === b.inventoryItemId)?.currentStock ?? 0) : 0,
      unitCost: b.unitCost, boughtQty: b.boughtQty, returned: b.returned, addToLibrary: !b.inventoryItemId && b.addToLibrary,
    }));
    const garnishPayload = garnishNames.filter(nm => num(garnish[nm]) > 0).map(nm => ({ name: nm, cost: garnish[nm] }));
    if (!loadedPayload.length && !boughtPayload.length && !garnishPayload.length) { alert('Enter some usage, a purchase, or a garnish cost first.'); return; }
    setSaving(true); setSaveMsg('');
    try {
      const res = await fetch(`/api/bookings/${booking.id}/stock-reconcile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loaded: loadedPayload, bought: boughtPayload, garnish: garnishPayload }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      const bits = [res.loaded && `${res.loaded} loaded`, res.bought && `${res.bought} bought`, res.garnish && `${res.garnish} garnish`].filter(Boolean).join(', ');
      setSaveMsg(`✓ Saved — ${bits} costed${res.newItems ? `, ${res.newItems} new to library` : ''}${res.backToStock ? `, ${res.backToStock} back in stock` : ''}. Refresh the booking to see the cost lines.`);
    } catch (err) { alert('Failed to save: ' + err.message); }
    finally { setSaving(false); }
  }
  return (
    <AppShell active="/bookings" userEmail={userEmail}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Event checklist</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>{booking.name}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={`/bookings`} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', fontSize: 13, textDecoration: 'none', color: 'var(--text)' }}>← Back</a>
          <button onClick={() => window.print()} style={{ background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13 }}>🖨 Print checklist</button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxWidth: 820 }}>
        {/* Header */}
        <div style={{ background: 'var(--black)', padding: '22px 32px' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 700, letterSpacing: '.16em', color: '#fff' }}>ORPI</div>
          <div style={{ fontSize: 11, letterSpacing: '.14em', color: '#888', marginTop: 2, textTransform: 'uppercase' }}>Event Brief &amp; Checklist</div>
          <div style={{ fontSize: 13, color: '#ccc', marginTop: 10 }}>
            {booking.name} &nbsp;|&nbsp; {booking.venue || 'Venue TBC'} &nbsp;|&nbsp; {fmtDateLong(booking.eventDate)} &nbsp;|&nbsp; {booking.guestCount || '?'} guests
          </div>
        </div>
        <div style={{ height: 3, background: 'var(--gold)' }} />

        <div style={{ padding: '20px 32px' }}>
          {/* Flags */}
          {flags.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              {flags.map((f, i) => (
                <div key={i} style={{ background: 'var(--gold-bg)', borderLeft: '3px solid var(--gold)', padding: '8px 14px', fontSize: 13, marginBottom: 6, borderRadius: '0 4px 4px 0' }}>⚠️ {f}</div>
              ))}
            </div>
          )}

          {/* Event overview */}
          <SectionHead icon="📋">Event overview</SectionHead>
          <Grid>
            <GridRow label="Venue" value={booking.venue} />
            <GridRow label="Event date" value={fmtDateLong(booking.eventDate)} />
            <GridRow label="Guest count" value={booking.guestCount} />
            <GridRow label="Service" value={booking.typeOfService} />
            <GridRow label="Alcohol provided by" value={booking.alcoholProvidedBy} />
            <GridRow label="Staff required" value={`Minimum ${staffNeeded} ORPI staff`} />
            <GridRow label="Quote value" value={gbp(booking.finalQuoteAmount ?? booking.quoteAmount)} />
            <GridRow label="Deposit / Balance" value={`${booking.depositReceived ? '✓' : '✗'} deposit, ${booking.balanceReceived ? '✓' : '✗'} balance`} />
            <GridRow label="Client" value={booking.clientName} />
            <GridRow label="Client contact" value={[booking.clientPhone, booking.clientEmail].filter(Boolean).join(' · ')} />
            {booking.referredBy && <GridRow label="Referred by" value={booking.referredBy} />}
            {booking.drinksTastingDate && <GridRow label="Drinks tasting" value={fmtDateLong(booking.drinksTastingDate)} />}
          </Grid>

          {/* Event drink selections — the specifics agreed for THIS event */}
          {providesAlcohol && (booking.beerSelection || booking.spiritsSelection || booking.softDrinksSelection) && (
            <>
              <SectionHead icon="🥃">This event's selections</SectionHead>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                What was confirmed with the client for this event — packs may differ from the standard quote.
              </p>
              {booking.spiritsSelection && (
                <SelectionRow label="Spirits" value={booking.spiritsSelection} />
              )}
              {booking.beerSelection && (
                <SelectionRow label="Beer" value={booking.beerSelection} />
              )}
              {booking.softDrinksSelection && (
                <SelectionRow label="Soft drinks & mixers" value={booking.softDrinksSelection} />
              )}
            </>
          )}

          {/* Drinks menu */}
          {(cocktails.length > 0 || mocktails.length > 0) && (
            <>
              <SectionHead icon="🍹">Drinks menu &amp; recipes</SectionHead>
              {cocktails.length > 0 && <DrinkGroup title={`Cocktails (${cocktails.length})`} drinks={cocktails} />}
              {mocktails.length > 0 && <DrinkGroup title={`Mocktails (${mocktails.length})`} drinks={mocktails} />}
            </>
          )}

          {/* Notes */}
          {(booking.internalNotes || booking.tastingNotes) && (
            <>
              <SectionHead icon="📝">Notes</SectionHead>
              {booking.tastingNotes && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 4 }}>Tasting notes</div>
                  <div style={{ fontSize: 13, background: 'var(--off)', padding: '10px 14px', borderRadius: 6, whiteSpace: 'pre-wrap' }}>{booking.tastingNotes}</div>
                </div>
              )}
              {booking.internalNotes && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 4 }}>Internal notes</div>
                  <div style={{ fontSize: 13, background: 'var(--off)', padding: '10px 14px', borderRadius: 6, whiteSpace: 'pre-wrap' }}>{booking.internalNotes}</div>
                </div>
              )}
            </>
          )}

          {/* Costs on file */}
          {costs.length > 0 && (
            <>
              <SectionHead icon="💷">Costs on file</SectionHead>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                <tbody>
                  {costs.map(c => (
                    <tr key={c.id}>
                      <td style={{ padding: '4px 0', fontSize: 12 }}>{c.name}</td>
                      <td style={{ padding: '4px 0', fontSize: 11, color: 'var(--muted)' }}>{c.costType}</td>
                      <td style={{ padding: '4px 0', fontSize: 12, textAlign: 'right' }}>{gbp(c.finalCost ?? c.cost)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 0', fontSize: 13, fontWeight: 600 }} colSpan={2}>Total</td>
                    <td style={{ padding: '6px 0', fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{gbp(totalCost)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* Standard checklist */}
          <SectionHead icon="✅">Pre-event &amp; day-of checklist</SectionHead>
          {Object.entries(STANDARD_CHECKLIST).map(([section, checkItems]) => {
            const items = section === 'Bar Kit & Stock' && providesAlcohol
              ? [ALCOHOL_ONLY_ITEM, ...checkItems]
              : checkItems;
            return (
              <div key={section} style={{ marginBottom: 14, breakInside: 'avoid' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{section}</div>
                {items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12.5, borderBottom: '1px solid var(--off)' }}>
                    <span style={{ width: 14, height: 14, border: '1.5px solid var(--muted)', borderRadius: 3, flexShrink: 0, display: 'inline-block' }} />
                    {item}
                  </div>
                ))}
              </div>
            );
          })}

          {/* ── RUN SHEET — three buckets: loaded / bought / garnish ──
              Saving costs the event for what was used, returns leftover stock
              to inventory, logs the buys, and writes the cost lines. */}
          <div className="no-print" style={{ marginTop: 20 }}>
            <SectionHead icon="🚐">Run sheet — stock &amp; costs</SectionHead>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.55 }}>
              Log what you <strong>loaded</strong> from stock, anything you <strong>bought</strong> for the event, and the <strong>garnish</strong> spend. The event is charged only for what's used; leftover bottles go back into stock. Autosaves as you go.
            </p>

            {/* 1 — LOADED FROM STOCK */}
            <div style={bucketLabel}>1 · Loaded from stock</div>
            {loadedRows.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Nothing suggested for this booking — add stock below.</p>}
            {loadedRows.map(r => {
              const used = Math.max(0, num(r.takenOut) - num(r.returned));
              const line = used * num(r.item.averageUnitCost);
              return (
                <div key={r.item.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{r.item.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.item.category} · stock now {r.item.currentStock ?? '—'} · {gbp(r.item.averageUnitCost)}/unit</div>
                    </div>
                    {r.manual && <button onClick={() => clearLoaded(r.item.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }} aria-label="Remove">✕</button>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><label style={lblStyle}>Taken out</label><input type="number" inputMode="numeric" min="0" placeholder="0" value={r.takenOut} onChange={e => setLoadedField(r.item.id, 'takenOut', e.target.value)} style={inpStyle} /></div>
                    <div><label style={lblStyle}>Came back (sealed)</label><input type="number" inputMode="numeric" min="0" placeholder="0" value={r.returned} onChange={e => setLoadedField(r.item.id, 'returned', e.target.value)} style={inpStyle} /></div>
                  </div>
                  {(r.takenOut !== '' || r.returned !== '') && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>Used <strong style={{ color: 'var(--text)' }}>{used}</strong> · <strong style={{ color: 'var(--gold)' }}>{gbp(line)}</strong></div>
                  )}
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 8, margin: '6px 0 22px', alignItems: 'center' }}>
              <select value={addItemId} onChange={e => setAddItemId(e.target.value)} style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, background: '#fff' }}>
                <option value="">— add stock item —</option>
                {stockItems.filter(s => !loaded[s.id] && !combinedSuggested.find(c => c.id === s.id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button onClick={addLoaded} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontSize: 14 }}>+ Add</button>
            </div>

            {/* 2 — BOUGHT FOR THE EVENT */}
            <div style={bucketLabel}>2 · Bought for the event</div>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>Stock bought for the day — pick an item or type an off-catalogue one. Charged for what's used; leftovers return to stock.</p>
            {bought.map(b => {
              const used = Math.max(0, num(b.boughtQty) - num(b.returned));
              const line = used * num(b.unitCost);
              const isNew = !b.inventoryItemId;
              return (
                <div key={b.id} style={cardStyle}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                    <select value={b.inventoryItemId} onChange={e => pickBoughtItem(b.id, e.target.value)} style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                      <option value="">— off-catalogue (type below) —</option>
                      {stockItems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button onClick={() => removeBought(b.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, padding: 4 }} aria-label="Remove">✕</button>
                  </div>
                  {isNew && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 8, marginBottom: 10 }}>
                      <input placeholder="Item name (e.g. Smirnoff 1L)" value={b.itemName} onChange={e => updateBought(b.id, { itemName: e.target.value })} style={{ ...inpStyle, textAlign: 'left', fontSize: 14 }} />
                      <select value={b.category} onChange={e => updateBought(b.id, { category: e.target.value })} style={{ padding: '10px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                        {['Spirit', 'Liqueur', 'Mixer', 'Beer', 'Wine', 'Prosecco', 'Garnish', 'Other'].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div><label style={lblStyle}>£ / unit</label><input type="number" inputMode="decimal" min="0" placeholder="0.00" value={b.unitCost} onChange={e => updateBought(b.id, { unitCost: e.target.value })} style={inpStyle} /></div>
                    <div><label style={lblStyle}>Bought</label><input type="number" inputMode="numeric" min="0" placeholder="0" value={b.boughtQty} onChange={e => updateBought(b.id, { boughtQty: e.target.value })} style={inpStyle} /></div>
                    <div><label style={lblStyle}>Came back</label><input type="number" inputMode="numeric" min="0" placeholder="0" value={b.returned} onChange={e => updateBought(b.id, { returned: e.target.value })} style={inpStyle} /></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, minHeight: 20 }}>
                    {isNew && b.itemName.trim()
                      ? <label style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={b.addToLibrary} onChange={e => updateBought(b.id, { addToLibrary: e.target.checked })} /> Add to Notion library</label>
                      : <span />}
                    {b.boughtQty !== '' && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Used <strong style={{ color: 'var(--text)' }}>{used}</strong> · <strong style={{ color: 'var(--gold)' }}>{gbp(line)}</strong></div>}
                  </div>
                </div>
              );
            })}
            <button onClick={addBought} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontSize: 14, marginBottom: 22 }}>+ Add a purchase</button>

            {/* 3 — GARNISH */}
            <div style={bucketLabel}>3 · Garnish (per-event spend)</div>
            {garnishNames.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>No garnishes on this menu — add any below.</p>}
            {garnishNames.map(nm => (
              <div key={nm} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ flex: 1, fontSize: 13 }}>{nm}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: 'var(--muted)' }}>£</span>
                  <input type="number" inputMode="decimal" min="0" placeholder="0.00" value={garnish[nm] ?? ''} onChange={e => setGarnishCost(nm, e.target.value)} style={{ width: 90, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, textAlign: 'center', background: '#faf9f6' }} />
                </div>
              </div>
            ))}
            <GarnishAdder onAdd={addGarnish} />

            {/* SUMMARY + SAVE */}
            <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}><span style={{ color: 'var(--muted)' }}>Loaded from stock</span><span>{gbp(loadedCost)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}><span style={{ color: 'var(--muted)' }}>Bought for event</span><span>{gbp(boughtCost)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}><span style={{ color: 'var(--muted)' }}>Garnish</span><span>{gbp(garnishTotal)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 600, paddingTop: 8, borderTop: '1px solid var(--border)' }}><span>Event cost</span><span style={{ color: 'var(--gold)' }}>{gbp(eventCost)}</span></div>
              {backToStock > 0 && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>{backToStock} unit(s) coming back into stock</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={saveRunSheet} disabled={saving} style={{ background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save run sheet'}</button>
              {saveMsg && <span style={{ fontSize: 12.5, color: 'var(--success)' }}>{saveMsg}</span>}
            </div>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
            ORPI Events LTD &nbsp;|&nbsp; Unit 5 Clements Court, Clements Lane, Ilford, IG1 2QY &nbsp;|&nbsp; hello@orpi.events
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function buildFlags(booking, cocktails, mocktails) {
  const flags = [];
  if (!booking.depositReceived) flags.push('Deposit not yet received');
  if (!booking.balanceReceived) flags.push('Balance not yet received');
  if (!booking.cocktailsConfirmed && cocktails.length) flags.push('Cocktail menu not yet confirmed with client');
  if (!booking.mocktailsConfirmed && mocktails.length) flags.push('Mocktail menu not yet confirmed with client');
  if (!booking.staffConfirmed) flags.push('Staff not yet confirmed');
  if (!booking.venueAccessConfirmed) flags.push('Venue access & setup time not yet confirmed');
  if (!booking.drinksTastingDate) flags.push('Drinks tasting not yet scheduled');
  [...cocktails, ...mocktails].forEach(d => {
    if (!d.isTbc && !d.found) flags.push(`"${d.name}" not found in ORPI Drinks Library — add recipe or confirm spelling`);
  });
  return flags;
}

function SectionHead({ icon, children }) {
  return (
    <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 10px', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
      <span>{icon}</span>{children}
    </div>
  );
}
function Grid({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 2, marginBottom: 8 }}>{children}</div>; }
function GridRow({ label, value }) {
  return (<><div style={{ fontSize: 11, color: 'var(--muted)', padding: '3px 0' }}>{label}</div><div style={{ fontSize: 12, padding: '3px 0' }}>{value || '—'}</div></>);
}

function SelectionRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 14, padding: '6px 0', borderBottom: '1px solid var(--off)', fontSize: 12, breakInside: 'avoid' }}>
      <span style={{ color: 'var(--muted)', width: 140, flexShrink: 0, textTransform: 'uppercase', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', paddingTop: 2 }}>{label}</span>
      <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{value}</span>
    </div>
  );
}

function DrinkGroup({ title, drinks }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>{title}</div>
      {drinks.map((d, i) => <DrinkCard key={i} drink={d} />)}
    </div>
  );
}

function DrinkCard({ drink }) {
  if (drink.isTbc) return null;
  if (!drink.found) {
    return (
      <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
        <strong>{drink.name}</strong> — not found in ORPI Drinks Library. Confirm recipe with the team before the event.
      </div>
    );
  }
  const d = drink.drink || {};
  const metaBits = [d.method, d.glassware, d.ice ? `${d.ice} ice` : null].filter(Boolean);
  return (
    <div style={{ border: drink.hasOverride ? '1px solid var(--gold)' : '1px solid var(--border)', borderRadius: 6, padding: '12px 16px', marginBottom: 8, breakInside: 'avoid' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {drink.name}
          {drink.hasOverride && (
            <span style={{ fontSize: 10, fontWeight: 600, color: '#8a6a00', background: 'var(--gold-bg)', padding: '2px 6px', borderRadius: 3, marginLeft: 8, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              {drink.isOverrideOnly ? 'Custom recipe (not in library)' : 'Custom for this event'}
            </span>
          )}
        </div>
        {metaBits.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{metaBits.join(' · ')}</div>
        )}
      </div>
      {drink.ingredients?.length > 0 && (
        <div style={{ fontSize: 12, marginBottom: 6 }}>
          {drink.ingredients.map((ing, i) => <div key={i}>• {ing}</div>)}
        </div>
      )}
      {drink.methodText && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{drink.methodText}</div>}
      {(d.garnish || d.rim || d.batchable || d.prepRequired) && (
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          {d.garnish && <>Garnish: {d.garnish}{d.rim ? ' · ' : ''}</>}
          {d.rim && <>Rim: {d.rim}</>}
          {d.batchable && <span style={{ marginLeft: 8 }}>· Batchable</span>}
          {d.prepRequired && <span style={{ marginLeft: 8 }}>· Prep required</span>}
        </div>
      )}
    </div>
  );
}

function fmtDateLong(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } }
function gbp(n) { return '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function GarnishAdder({ onAdd }) {
  const [v, setV] = useState('');
  const add = () => { onAdd(v); setV(''); };
  return (
    <div className="no-print" style={{ display: 'flex', gap: 8, margin: '4px 0 22px' }}>
      <input placeholder="+ add a garnish" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, background: '#fff' }} />
      <button onClick={add} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', fontSize: 14 }}>Add</button>
    </div>
  );
}

