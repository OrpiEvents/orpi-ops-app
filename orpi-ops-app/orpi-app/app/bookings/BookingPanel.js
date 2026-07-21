'use client';
import { useEffect, useState } from 'react';
import { drinksConfirmationGates, eventCompletionGates } from '@/lib/gates';

const COST_TYPES = ['Alcohol', 'Staff', 'Mixers', 'Ice', 'Logistics/Travel', 'Equipment', 'Printing/Branding', 'Marketing', 'Glassware', 'Estimation', 'Other/Misc'];

// Maps an Inventory Items category to the nearest Event Costing "Cost Type"
// option, so picking a stock item auto-suggests a sensible cost type.
const CATEGORY_TO_COST_TYPE = {
  Spirit: 'Alcohol', Beer: 'Alcohol', Wine: 'Alcohol', Prosecco: 'Alcohol', Champagne: 'Alcohol', Liqueur: 'Alcohol',
  Mixer: 'Mixers', 'Soft Drink': 'Mixers', Ice: 'Ice', Garnish: 'Other/Misc', Other: 'Other/Misc',
};

export default function BookingPanel({ booking, onClose, onSaved }) {
  const [tab, setTab] = useState('overview');
  const [form, setForm] = useState(() => ({
    drinksTastingDate: booking.drinksTastingDate || '',
    tastingNotes: booking.tastingNotes || '',
    cocktailMenu: booking.cocktailMenu || '',
    mocktailMenu: booking.mocktailMenu || '',
    cocktailRecipeOverrides: booking.cocktailRecipeOverrides || '',
    mocktailRecipeOverrides: booking.mocktailRecipeOverrides || '',
    beerSelection: booking.beerSelection || '',
    spiritsSelection: booking.spiritsSelection || '',
    softDrinksSelection: booking.softDrinksSelection || '',
    cocktailsConfirmed: !!booking.cocktailsConfirmed,
    mocktailsConfirmed: !!booking.mocktailsConfirmed,
    staffConfirmed: !!booking.staffConfirmed,
    eventBriefSent: !!booking.eventBriefSent,
    venueAccessConfirmed: !!booking.venueAccessConfirmed,
    depositReceived: !!booking.depositReceived,
    balanceReceived: !!booking.balanceReceived,
    marketingEvent: !!booking.marketingEvent,
    internalNotes: booking.internalNotes || '',
  }));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [costs, setCosts] = useState([]);
  const [costsLoading, setCostsLoading] = useState(true);
  const [newCost, setNewCost] = useState({ name: '', costType: 'Staff', cost: '' });
  const [addingCost, setAddingCost] = useState(false);

  const [costMode, setCostMode] = useState('stock'); // 'stock' | 'manual'
  const [stockItems, setStockItems] = useState([]);
  const [stockForm, setStockForm] = useState({ itemId: '', quantityUsed: '' });
  const [addingStockCost, setAddingStockCost] = useState(false);
  const [drinksLibrary, setDrinksLibrary] = useState([]);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    fetch(`/api/bookings/${booking.id}/costs`).then(r => r.json()).then(res => {
      if (!res.error) setCosts(res.costs || []);
      setCostsLoading(false);
    });
    fetch('/api/stock').then(r => r.json()).then(res => {
      if (!res.error) setStockItems(res.items || []);
    });
    fetch('/api/drinks').then(r => r.json()).then(res => {
      if (!res.error) setDrinksLibrary(res.drinks || []);
    });
  }, [booking.id]);

  function set(patch) { setForm(prev => ({ ...prev, ...patch })); }

  async function savePlanningAndNotes() {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      }).then(r => r.json());
      if (res.error) {
        if (res.gates?.length) {
          alert(`${res.error}\n\n${res.gates.map(g => `• ${g.label}\n   → ${g.fix}`).join('\n\n')}`);
        } else {
          alert(res.error);
        }
        return;
      }
      setSaveMsg('✓ Saved to Notion');
      onSaved?.(res.booking);
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function markCompleted() {
    if (!confirm(`Mark "${booking.name}" as Completed? This closes out the event.`)) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/complete`, { method: 'POST' }).then(r => r.json());
      if (res.error) {
        if (res.gates?.length) {
          alert(`${res.error}\n\n${res.gates.map(g => `• ${g.label}\n   → ${g.fix}`).join('\n\n')}`);
        } else {
          alert(res.error);
        }
        return;
      }
      onSaved?.(res.booking);
      alert('✓ Event marked Completed.');
      onClose();
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setCompleting(false);
    }
  }

  async function addCostFromStock() {
    const item = stockItems.find(i => i.id === stockForm.itemId);
    const qty = parseFloat(stockForm.quantityUsed);
    if (!item || !qty) { alert('Select an item and enter the quantity used.'); return; }
    setAddingStockCost(true);
    try {
      const lockedUnitCost = item.averageUnitCost || 0;
      const res = await fetch(`/api/bookings/${booking.id}/costs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: item.name,
          costType: CATEGORY_TO_COST_TYPE[item.category] || 'Other/Misc',
          inventoryItemId: item.id,
          quantityUsed: qty,
          lockedUnitCost,
        }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      setCosts([...costs, res.cost]);
      setStockForm({ itemId: '', quantityUsed: '' });
    } catch (err) {
      alert('Failed to add cost: ' + err.message);
    } finally {
      setAddingStockCost(false);
    }
  }

  async function addCost() {
    if (!newCost.name.trim() || !newCost.cost) { alert('Description and cost are required.'); return; }
    setAddingCost(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/costs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCost.name, costType: newCost.costType, cost: parseFloat(newCost.cost) || 0 }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      setCosts([...costs, res.cost]);
      setNewCost({ name: '', costType: 'Staff', cost: '' });
    } catch (err) {
      alert('Failed to add cost: ' + err.message);
    } finally {
      setAddingCost(false);
    }
  }

  async function removeCost(costId) {
    if (!confirm('Remove this cost line?')) return;
    try {
      const res = await fetch(`/api/bookings/costs/${costId}`, { method: 'DELETE' }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      setCosts(costs.filter(c => c.id !== costId));
    } catch (err) {
      alert('Failed to remove: ' + err.message);
    }
  }

  const totalCost = costs.reduce((s, c) => s + (c.finalCost ?? c.cost ?? 0), 0);

  // Live gate checks. We use the local form state where relevant so the
  // gates update as the user edits (e.g. type a new cocktail name → the
  // "Cocktails not in library" gate updates immediately).
  const cocktailGates = drinksConfirmationGates(form.cocktailMenu, drinksLibrary, 'Cocktails', form.cocktailRecipeOverrides);
  const mocktailGates = drinksConfirmationGates(form.mocktailMenu, drinksLibrary, 'Mocktails', form.mocktailRecipeOverrides);
  // Merge live form state into a booking-shape for completion gate calc.
  const bookingForGates = { ...booking, ...form };
  const completionGates = eventCompletionGates(bookingForGates, costs, { drinksLibrary });
  const canComplete = booking.status !== 'Completed' && completionGates.length === 0 && drinksLibrary.length > 0;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '95vw', height: '100vh', background: '#fff', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,.08)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>{booking.name}</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{fmtDate(booking.eventDate)} · {booking.venue}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <a href={`/bookings/${booking.id}/checklist`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, background: 'var(--gold)', color: '#fff', padding: '7px 12px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              🖨 Checklist
            </a>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20, lineHeight: 1 }}>✕</button>
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {[['overview', 'Overview'], ['planning', 'Planning'], ['costs', 'Event costs'], ['notes', 'Notes']].map(([k, label]) => (
            <div key={k} onClick={() => setTab(k)} style={{
              padding: '10px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              color: tab === k ? 'var(--text)' : 'var(--muted)',
              borderBottom: tab === k ? '2px solid var(--gold)' : '2px solid transparent', marginBottom: -1,
            }}>{label}</div>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {tab === 'overview' && (
            <>
              <Section title="Event details">
                <Row label="Event date" value={fmtDate(booking.eventDate)} />
                <Row label="Venue" value={booking.venue} />
                <Row label="Guests" value={booking.guestCount} />
                <Row label="Event type" value={booking.eventType} />
                <Row label="Service" value={booking.typeOfService} />
                <Row label="Quote value" value={gbp(booking.finalQuoteAmount ?? booking.quoteAmount)} />
                {booking.referredBy && <Row label="Referred by" value={booking.referredBy} />}
              </Section>
              <Section title="Client">
                <Row label="Name" value={booking.clientName} />
                <Row label="Email" value={booking.clientEmail} />
                <Row label="Phone" value={booking.clientPhone} />
              </Section>
              <Section title="Payment">
                <Row label="Deposit" value={booking.depositReceived ? '✓ Received' : 'Pending'} />
                <Row label="Balance" value={booking.balanceReceived ? '✓ Received' : 'Pending'} />
              </Section>

              <Section title="Close event">
                {booking.status === 'Completed' ? (
                  <div style={{ background: 'var(--success-bg)', color: 'var(--success)', padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>
                    ✓ This event is marked Completed.
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                      Once all pre- and post-event steps are done, close the event. The button unlocks automatically when every requirement below is met.
                    </p>
                    {completionGates.length > 0 && (
                      <div style={{ background: '#fff8e0', color: '#9a7500', padding: '10px 14px', borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
                        <strong>{completionGates.length} outstanding item{completionGates.length !== 1 ? 's' : ''}:</strong>
                        <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                          {completionGates.map((g, i) => (
                            <li key={i} style={{ marginBottom: 4 }}>
                              {g.label}
                              <div style={{ fontStyle: 'italic', color: '#7a5a00', fontSize: 11 }}>→ {g.fix}</div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <button
                      onClick={markCompleted}
                      disabled={!canComplete || completing}
                      style={{
                        background: canComplete ? 'var(--gold)' : 'var(--mid)',
                        color: canComplete ? '#fff' : 'var(--muted)',
                        border: 'none', borderRadius: 8, padding: '10px 18px',
                        fontSize: 13, cursor: canComplete ? 'pointer' : 'not-allowed', fontWeight: 500,
                      }}>
                      {completing ? 'Marking completed…' : 'Mark event as Completed'}
                    </button>
                  </>
                )}
              </Section>
            </>
          )}

          {tab === 'planning' && (
            <>
              <Section title="Drinks tasting">
                <Field label="Tasting date"><input type="date" style={inputStyle} value={form.drinksTastingDate} onChange={e => set({ drinksTastingDate: e.target.value })} /></Field>
                <Field label="Tasting notes"><textarea style={{ ...inputStyle, resize: 'vertical' }} rows={3} value={form.tastingNotes} onChange={e => set({ tastingNotes: e.target.value })} /></Field>
              </Section>
              <Section title="Cocktail & mocktail menu">
                <Field label="Cocktails"><textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={form.cocktailMenu} onChange={e => set({ cocktailMenu: e.target.value })} placeholder="Pornstar Martini, Strawberry Mojito, TBC" /></Field>
                <Field label="Mocktails"><textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={form.mocktailMenu} onChange={e => set({ mocktailMenu: e.target.value })} placeholder="TBC, TBC" /></Field>
              </Section>
              <Section title="Event-specific selections">
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  What we're actually bringing on the day. Overrides the standard package — the checklist and pack list will use these.
                </p>
                <Field label="Spirits"><textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={form.spiritsSelection} onChange={e => set({ spiritsSelection: e.target.value })} placeholder="Absolut, Bombay Sapphire, Jameson…" /></Field>
                <Field label="Beer"><textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={form.beerSelection} onChange={e => set({ beerSelection: e.target.value })} placeholder="Budweiser only (dropped Peroni)" /></Field>
                <Field label="Soft drinks & mixers"><textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={form.softDrinksSelection} onChange={e => set({ softDrinksSelection: e.target.value })} placeholder="Coca-Cola, Diet Coke, Lemonade, Tonic, Soda…" /></Field>
              </Section>
              <Section title="Recipe overrides">
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  If a drink needs a custom recipe for THIS client only (different spirit, different measures), enter it here.
                  Format: drink name on its own line ending with a colon, then one ingredient per line. A new colon-ending line starts the next drink.
                </p>
                <Field label="Cocktail overrides"><textarea style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} rows={6} value={form.cocktailRecipeOverrides} onChange={e => set({ cocktailRecipeOverrides: e.target.value })} placeholder={"Espresso Martini:\n50ml Grey Goose\n35ml Baileys (not Kahlúa)\n25ml fresh espresso\nMethod: Shake hard, double strain\nPornstar Martini:\n50ml Absolut Vanilla\n..."} /></Field>
                <Field label="Mocktail overrides"><textarea style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} rows={4} value={form.mocktailRecipeOverrides} onChange={e => set({ mocktailRecipeOverrides: e.target.value })} placeholder="Same format as cocktails above" /></Field>
              </Section>
              <Section title="Confirmations">
                <Check
                  label="Cocktails confirmed"
                  checked={form.cocktailsConfirmed}
                  onChange={v => set({ cocktailsConfirmed: v })}
                  disabled={form.cocktailsConfirmed ? false : cocktailGates.length > 0}
                />
                {cocktailGates.length > 0 && !form.cocktailsConfirmed && (
                  <div style={{ background: '#fff8e0', color: '#9a7500', padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 4, marginBottom: 6 }}>
                    ⚠ {cocktailGates[0].label}<br />
                    <em style={{ color: '#7a5a00' }}>{cocktailGates[0].fix}</em>
                  </div>
                )}
                <Check
                  label="Mocktails confirmed"
                  checked={form.mocktailsConfirmed}
                  onChange={v => set({ mocktailsConfirmed: v })}
                  disabled={form.mocktailsConfirmed ? false : mocktailGates.length > 0}
                />
                {mocktailGates.length > 0 && !form.mocktailsConfirmed && (
                  <div style={{ background: '#fff8e0', color: '#9a7500', padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 4, marginBottom: 6 }}>
                    ⚠ {mocktailGates[0].label}<br />
                    <em style={{ color: '#7a5a00' }}>{mocktailGates[0].fix}</em>
                  </div>
                )}
                <Check label="Staff confirmed" checked={form.staffConfirmed} onChange={v => set({ staffConfirmed: v })} />
                <Check label="Event brief sent" checked={form.eventBriefSent} onChange={v => set({ eventBriefSent: v })} />
                <Check label="Venue access confirmed" checked={form.venueAccessConfirmed} onChange={v => set({ venueAccessConfirmed: v })} />
                <Check label="Deposit received" checked={form.depositReceived} onChange={v => set({ depositReceived: v })} />
                <Check label="Balance received" checked={form.balanceReceived} onChange={v => set({ balanceReceived: v })} />
              </Section>
              <Section title="KPI tagging">
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Excludes this event from commercial cost-per-head averages (e.g. wedding shows, promo events)</p>
                <Check label="This is a marketing / promo event" checked={form.marketingEvent} onChange={v => set({ marketingEvent: v })} />
              </Section>
            </>
          )}

          {tab === 'costs' && (
            <>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', marginBottom: 10 }}>
                Event costs — saved to Notion Event Costing
              </div>
              {costsLoading ? (
                <div style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>Loading…</div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  {costs.length === 0 ? (
                    <div style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0' }}>No costs logged yet</div>
                  ) : costs.map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--off)' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {c.costType}
                          {c.quantityUsed ? ` · ${c.quantityUsed} × ${gbp(c.lockedUnitCost)} (locked)` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{gbp(c.finalCost ?? c.cost)}</span>
                        <button onClick={() => removeCost(c.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>✕</button>
                      </div>
                    </div>
                  ))}
                  {costs.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontWeight: 600, fontSize: 13 }}>
                      <span>Total</span><span>{gbp(totalCost)}</span>
                    </div>
                  )}
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
                  <div onClick={() => setCostMode('stock')} style={{
                    padding: '6px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    color: costMode === 'stock' ? 'var(--text)' : 'var(--muted)',
                    borderBottom: costMode === 'stock' ? '2px solid var(--gold)' : '2px solid transparent', marginBottom: -1,
                  }}>From stock</div>
                  <div onClick={() => setCostMode('manual')} style={{
                    padding: '6px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    color: costMode === 'manual' ? 'var(--text)' : 'var(--muted)',
                    borderBottom: costMode === 'manual' ? '2px solid var(--gold)' : '2px solid transparent', marginBottom: -1,
                  }}>Manual entry</div>
                </div>

                {costMode === 'stock' ? (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                      Locks in today's average unit cost for this item — won't change later if you buy more stock at a different price.
                    </p>
                    <select style={{ ...inputStyle, marginBottom: 8, cursor: 'pointer' }} value={stockForm.itemId} onChange={e => setStockForm({ ...stockForm, itemId: e.target.value })}>
                      <option value="">— select item —</option>
                      {stockItems.map(i => <option key={i.id} value={i.id}>{i.name} ({i.category})</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="number" step="0.01" style={{ ...inputStyle, flex: 1 }} placeholder="Quantity used" value={stockForm.quantityUsed} onChange={e => setStockForm({ ...stockForm, quantityUsed: e.target.value })} />
                      <button onClick={addCostFromStock} disabled={addingStockCost} style={{ background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>
                        {addingStockCost ? 'Adding…' : '+ Add'}
                      </button>
                    </div>
                    {stockForm.itemId && stockForm.quantityUsed && (() => {
                      const item = stockItems.find(i => i.id === stockForm.itemId);
                      const unitCost = item?.averageUnitCost || 0;
                      const qty = parseFloat(stockForm.quantityUsed) || 0;
                      return (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                          {qty} × {gbp(unitCost)} = <strong style={{ color: 'var(--text)' }}>{gbp(qty * unitCost)}</strong>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
                      <input style={inputStyle} placeholder="Description" value={newCost.name} onChange={e => setNewCost({ ...newCost, name: e.target.value })} />
                      <select style={{ ...inputStyle, cursor: 'pointer' }} value={newCost.costType} onChange={e => setNewCost({ ...newCost, costType: e.target.value })}>
                        {COST_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" step="0.01" style={inputStyle} placeholder="Cost (£)" value={newCost.cost} onChange={e => setNewCost({ ...newCost, cost: e.target.value })} />
                      <button onClick={addCost} disabled={addingCost} style={{ background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>
                        {addingCost ? 'Adding…' : '+ Add'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'notes' && (
            <Section title="Internal notes">
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Private — never shared with the client</p>
              <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={12} value={form.internalNotes} onChange={e => set({ internalNotes: e.target.value })} placeholder="Notes about calls, preferences, logistics…" />
            </Section>
          )}
        </div>

        {tab !== 'costs' && (
          <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={savePlanningAndNotes} disabled={saving} style={{ background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13 }}>
              {saving ? 'Saving…' : 'Save to Notion'}
            </button>
            {saveMsg && <span style={{ fontSize: 12, color: 'var(--success)' }}>{saveMsg}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--off)' }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ label, value }) {
  return (<div style={{ display: 'flex', gap: 12, padding: '5px 0', borderBottom: '1px solid var(--off)' }}><span style={{ fontSize: 12, color: 'var(--muted)', width: 130, flexShrink: 0 }}>{label}</span><span style={{ fontSize: 13, flex: 1 }}>{value || '—'}</span></div>);
}
function Field({ label, children }) {
  return (<div style={{ marginBottom: 12 }}><label style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 4 }}>{label}</label>{children}</div>);
}
function Check({ label, checked, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0', borderBottom: '1px solid var(--off)', opacity: disabled ? 0.5 : 1 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>{label}</span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--gold)', cursor: disabled ? 'not-allowed' : 'pointer' }} />
    </div>
  );
}
const inputStyle = { width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' };
function fmtDate(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }
function gbp(n) { return '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
