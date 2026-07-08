'use client';
import { useEffect, useState } from 'react';
import AppShell from '../AppShell';

const CATEGORIES = ['Spirit', 'Beer', 'Wine', 'Prosecco', 'Champagne', 'Liqueur', 'Soft Drink', 'Mixer', 'Garnish', 'Ice', 'Other'];
const UNITS = ['Bottle', 'Can', 'Each', 'Case', 'Box'];
const SUPPLIERS = ['Tesco', 'Asda', 'Costco', 'Sainsburys', 'Venus', 'Other'];
const OWNERS = ['ORPI', 'Snehal'];
const today = () => new Date().toISOString().split('T')[0];

const EMPTY = {
  selectedId: '', newName: '', category: 'Spirit', quantity: '', unit: 'Bottle',
  size: '', unitCost: '', supplier: 'Tesco', ownedBy: 'ORPI', dateBought: today(),
};

export default function PurchasesClient({ userEmail }) {
  const [items, setItems] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [stockRes, purRes] = await Promise.all([
        fetch('/api/stock').then(r => r.json()),
        fetch('/api/purchases').then(r => r.json()),
      ]);
      if (stockRes.error) throw new Error(stockRes.error);
      setItems(stockRes.items || []);
      if (!purRes.error) setPurchases(purRes.purchases || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function set(patch) { setForm(prev => ({ ...prev, ...patch })); }

  async function submit() {
    const name = form.selectedId ? items.find(i => i.id === form.selectedId)?.name : form.newName.trim();
    if (!name || !form.quantity) { alert('Item and quantity are required.'); return; }
    setSaving(true);
    try {
      const body = {
        itemName: name,
        quantity: form.quantity,
        unitCost: form.unitCost,
        supplier: form.supplier,
        dateBought: form.dateBought,
        ownedBy: form.ownedBy,
      };
      if (form.selectedId) body.inventoryItemId = form.selectedId;
      else body.newItem = { category: form.category, unit: form.unit, size: form.size };

      const res = await fetch('/api/purchases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);

      setSaveMsg('✓ Saved — stock updated');
      setForm({ ...EMPTY, dateBought: today() });
      setTimeout(() => setSaveMsg(''), 3000);
      await load();
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell active="/purchases" userEmail={userEmail}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Stock purchases</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>Log purchases — stock levels update automatically in Notion</p>
      </div>

      {error && <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 20, maxWidth: 680, marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Log new purchase</div>
        <Row>
          <Field label="Item">
            <select style={selStyle} value={form.selectedId} onChange={e => set({ selectedId: e.target.value })}>
              <option value="">— select existing item —</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </Field>
          <Field label="Or new item name">
            <input style={inputStyle} value={form.newName} onChange={e => set({ newName: e.target.value })} placeholder="New item name" disabled={!!form.selectedId} />
          </Field>
        </Row>
        <ThreeCol>
          <Field label="Category">
            <select style={selStyle} value={form.category} onChange={e => set({ category: e.target.value })} disabled={!!form.selectedId}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Quantity bought"><input type="number" style={inputStyle} value={form.quantity} onChange={e => set({ quantity: e.target.value })} placeholder="12" /></Field>
          <Field label="Unit">
            <select style={selStyle} value={form.unit} onChange={e => set({ unit: e.target.value })} disabled={!!form.selectedId}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </Field>
        </ThreeCol>
        <ThreeCol>
          <Field label="Size"><input style={inputStyle} value={form.size} onChange={e => set({ size: e.target.value })} placeholder="70cl" disabled={!!form.selectedId} /></Field>
          <Field label="Unit cost (£)"><input type="number" step="0.01" style={inputStyle} value={form.unitCost} onChange={e => set({ unitCost: e.target.value })} placeholder="18.50" /></Field>
          <Field label="Supplier">
            <select style={selStyle} value={form.supplier} onChange={e => set({ supplier: e.target.value })}>
              {SUPPLIERS.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </ThreeCol>
        <Row>
          <Field label="Owned by">
            <select style={selStyle} value={form.ownedBy} onChange={e => set({ ownedBy: e.target.value })}>
              {OWNERS.map(o => <option key={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Date bought"><input type="date" style={inputStyle} value={form.dateBought} onChange={e => set({ dateBought: e.target.value })} /></Field>
        </Row>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <button onClick={submit} disabled={saving} style={{ background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13 }}>
            {saving ? 'Saving…' : 'Log & update stock'}
          </button>
          {saveMsg && <span style={{ fontSize: 12, color: 'var(--success)' }}>{saveMsg}</span>}
        </div>
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Purchase history</div>
      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center' }}>Loading…</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--off)' }}>
                {['Date', 'Purchase', 'Supplier', 'Qty', 'Unit cost', 'Total', 'Owned by'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 14px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No purchases logged yet</td></tr>
              ) : purchases.map(p => (
                <tr key={p.id}>
                  <Td muted>{fmtDate(p.dateBought)}</Td>
                  <Td><strong>{p.line}</strong></Td>
                  <Td muted>{p.supplier}</Td>
                  <Td>{p.quantityBought}</Td>
                  <Td>{gbp(p.unitCost)}</Td>
                  <Td><strong>{gbp(p.totalCost)}</strong></Td>
                  <Td muted>{p.ownedBy}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

function Td({ children, muted }) { return <td style={{ padding: '10px 14px', fontSize: 13, borderBottom: '1px solid var(--off)', color: muted ? 'var(--muted)' : 'inherit' }}>{children}</td>; }
function Row({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>{children}</div>; }
function ThreeCol({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>{children}</div>; }
function Field({ label, children }) {
  return (<div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 4 }}>{label}</label>{children}</div>);
}
const inputStyle = { width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 };
const selStyle = { ...inputStyle, cursor: 'pointer' };
function fmtDate(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }
function gbp(n) { return '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
