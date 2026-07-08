'use client';
import { useEffect, useState } from 'react';

const COST_TYPES = ['Alcohol', 'Staff', 'Mixers', 'Ice', 'Logistics/Travel', 'Equipment', 'Printing/Branding', 'Marketing', 'Glassware', 'Estimation', 'Other/Misc'];

export default function BookingPanel({ booking, onClose, onSaved }) {
  const [tab, setTab] = useState('overview');
  const [form, setForm] = useState(() => ({
    drinksTastingDate: booking.drinksTastingDate || '',
    tastingNotes: booking.tastingNotes || '',
    cocktailMenu: booking.cocktailMenu || '',
    mocktailMenu: booking.mocktailMenu || '',
    cocktailsConfirmed: !!booking.cocktailsConfirmed,
    mocktailsConfirmed: !!booking.mocktailsConfirmed,
    staffConfirmed: !!booking.staffConfirmed,
    eventBriefSent: !!booking.eventBriefSent,
    venueAccessConfirmed: !!booking.venueAccessConfirmed,
    depositReceived: !!booking.depositReceived,
    balanceReceived: !!booking.balanceReceived,
    internalNotes: booking.internalNotes || '',
  }));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [costs, setCosts] = useState([]);
  const [costsLoading, setCostsLoading] = useState(true);
  const [newCost, setNewCost] = useState({ name: '', costType: 'Staff', cost: '' });
  const [addingCost, setAddingCost] = useState(false);

  useEffect(() => {
    fetch(`/api/bookings/${booking.id}/costs`).then(r => r.json()).then(res => {
      if (!res.error) setCosts(res.costs || []);
      setCostsLoading(false);
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
      if (res.error) throw new Error(res.error);
      setSaveMsg('✓ Saved to Notion');
      onSaved?.(res.booking);
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
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
              <Section title="Confirmations">
                <Check label="Cocktails confirmed" checked={form.cocktailsConfirmed} onChange={v => set({ cocktailsConfirmed: v })} />
                <Check label="Mocktails confirmed" checked={form.mocktailsConfirmed} onChange={v => set({ mocktailsConfirmed: v })} />
                <Check label="Staff confirmed" checked={form.staffConfirmed} onChange={v => set({ staffConfirmed: v })} />
                <Check label="Event brief sent" checked={form.eventBriefSent} onChange={v => set({ eventBriefSent: v })} />
                <Check label="Venue access confirmed" checked={form.venueAccessConfirmed} onChange={v => set({ venueAccessConfirmed: v })} />
                <Check label="Deposit received" checked={form.depositReceived} onChange={v => set({ depositReceived: v })} />
                <Check label="Balance received" checked={form.balanceReceived} onChange={v => set({ balanceReceived: v })} />
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
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.costType}</div>
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
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>Add cost line</div>
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
function Check({ label, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0', borderBottom: '1px solid var(--off)' }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--gold)', cursor: 'pointer' }} />
    </div>
  );
}
const inputStyle = { width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' };
function fmtDate(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }
function gbp(n) { return '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
