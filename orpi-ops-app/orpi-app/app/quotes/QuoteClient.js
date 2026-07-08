'use client';
import { useEffect, useState } from 'react';
import AppShell from '../AppShell';

let idCounter = 0;
const uid = () => `item_${++idCounter}_${Date.now()}`;

const DEF_WD = ['Budweiser / Peroni', 'Ombre Juices', 'Pimms Cocktails', 'Prosecco'];
const DEF_INCL = ['Full open bar service', 'Bespoke cocktails', 'Mocktails', 'Full soft drinks range', 'Complete glassware', 'Ice & garnishes', 'Bar décor', 'Personalised bar menus', 'Pre-event drinks tasting', 'Minimum 4 ORPI staff', 'Dry ice', 'Bubble smoke gun'];
const DEF_SPIRITS = [
  { cat: 'Vodka', items: ['Absolut'] },
  { cat: 'Whiskey', items: ['Jameson'] },
  { cat: 'Rum', items: ['Bacardi Carta Blanca', "Captain's Spiced"] },
  { cat: 'Gin', items: ["Gordon's Pink", "Gordon's Dry"] },
  { cat: 'Wine', items: ['House Red', 'House White'] },
  { cat: 'Beer / Lager', items: ['Corona', 'Budweiser'] },
];
const DEF_SOFT = ['Coca-Cola', 'Coke Zero', 'Lemonade', 'Lemonade Zero', 'Tonic', 'Soda', 'Water', 'Cranberry Juice', 'Tropical Juice'];
const DEF_ADDONS = [
  { label: 'Personalised bar accessories', desc: 'Bar mats (keepsake), drinks coasters, cocktail napkins & cocktail toppers/stirrers printed with event name, logo or monogram', price: '', on: false },
  { label: 'Flair bartending show', desc: 'Theatrical bar performance (subject to venue)', price: '', on: false },
  { label: 'Bar hire', desc: '4m round LED bar, non-LED bar, or bespoke unit', price: '', on: false },
  { label: 'Bar van', desc: 'Fully equipped outdoor bar van', price: '', on: false },
  { label: 'Custom bar print', desc: 'Branded bar front print', price: '', on: false },
  { label: 'Ripple machine', desc: 'Prints images onto the surface of drinks', price: '', on: false },
  { label: 'Champagne tower', desc: 'Tiered glass tower — filled and cascaded', price: '', on: false },
  { label: 'Cocktail masterclass', desc: 'Interactive session hosted by ORPI staff', price: '', on: false },
  { label: 'Neon signage', desc: 'Custom neon sign for the bar or event space', price: '', on: false },
  { label: 'Extended bar hours', desc: 'Additional service time (per hour)', price: '', on: false },
  { label: 'Additional staff', desc: 'Extra ORPI staff (per person)', price: '', on: false },
];
const DEF_COMP = ['Dry ice', 'Bubble smoke gun'];

function withIds(arr) { return arr.map(v => ({ id: uid(), text: v, on: true })); }
function spiritsWithIds(rows) { return rows.map(r => ({ id: uid(), cat: r.cat, on: true, items: withIds(r.items) })); }
function addonsWithIds(arr) { return arr.map(a => ({ id: uid(), ...a })); }

function freshState() {
  return {
    doctype: 'quote', invNum: '', date: new Date().toISOString().split('T')[0], due: '', salesPerson: 'Ruds',
    enquiryId: null, client: '', etype: 'Wedding Reception', venue: '', edate: '', etime: '', guests: '',
    pkg: 'Unlimited Service', duration: '', setup: '',
    wdOn: true, wdDur: '2 hours', wdItems: withIds(DEF_WD),
    inclItems: withIds(DEF_INCL),
    spiritRows: spiritsWithIds(DEF_SPIRITS),
    softItems: withIds(DEF_SOFT),
    nct: 3, nmt: 2, cocktailNames: ['', '', ''], mocktailNames: ['', ''],
    addons: addonsWithIds(DEF_ADDONS),
    compItems: withIds(DEF_COMP),
    notes: '', base: '', disc: '',
  };
}

export default function QuoteClient({ userEmail }) {
  const [s, setS] = useState(freshState);
  const [enquiries, setEnquiries] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    fetch('/api/enquiries').then(r => r.json()).then(res => {
      if (!res.error) setEnquiries(res.enquiries || []);
    });
  }, []);

  function set(patch) { setS(prev => ({ ...prev, ...patch })); }

  function loadFromEnquiry(id) {
    if (!id) return;
    const e = enquiries.find(x => x.id === id);
    if (!e) return;
    set({
      enquiryId: e.id, client: e.name || '', venue: e.venue || '',
      edate: e.eventDate || '', guests: e.guestCount ?? '',
      etype: e.eventType || s.etype,
    });
  }

  const addonTotal = s.addons.filter(a => a.on && parseFloat(a.price) > 0).reduce((sum, a) => sum + parseFloat(a.price), 0);
  const base = parseFloat(s.base) || 0;
  const disc = parseFloat(s.disc) || 0;
  const total = Math.max(0, base + addonTotal - disc);
  const dep = total * 0.5;

  async function saveToNotion() {
    if (!s.client.trim()) { alert('Please enter a client name first.'); return; }
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enquiryId: s.enquiryId, name: s.client, amount: base, doctype: s.doctype }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      setSaveMsg('✓ Saved to Notion');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function resetAll() {
    if (!confirm('Reset the quote builder?')) return;
    setS(freshState());
  }

  return (
    <AppShell active="/quotes" userEmail={userEmail}>
      <QuoteBuilderUI
        s={s} set={set} enquiries={enquiries} loadFromEnquiry={loadFromEnquiry}
        addonTotal={addonTotal} total={total} dep={dep}
        saving={saving} saveMsg={saveMsg} saveToNotion={saveToNotion} resetAll={resetAll}
      />
    </AppShell>
  );
}

function QuoteBuilderUI({ s, set, enquiries, loadFromEnquiry, addonTotal, total, dep, saving, saveMsg, saveToNotion, resetAll }) {
  return (
    <div>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Quote builder</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>Build, preview live, print as PDF — saves to Notion</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select onChange={e => loadFromEnquiry(e.target.value)} defaultValue="" style={selStyle}>
            <option value="">Load from enquiry…</option>
            {enquiries.map(e => <option key={e.id} value={e.id}>{e.name} — {fmtDate(e.eventDate)}</option>)}
          </select>
          <button onClick={() => window.print()} style={btnBlack}>🖨 Download PDF</button>
        </div>
      </div>

      <div className="print-grid-collapse" style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 20, alignItems: 'start' }}>
        <div className="no-print" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 20, position: 'sticky', top: 24, maxHeight: 'calc(100vh - 60px)', overflowY: 'auto' }}>
          <SectionHead>Document</SectionHead>
          <ThreeCol>
            <Field label="Type">
              <select style={selStyle} value={s.doctype} onChange={e => set({ doctype: e.target.value })}>
                <option value="quote">Quotation</option>
                <option value="deposit">Deposit Invoice</option>
                <option value="balance">Balance Invoice</option>
              </select>
            </Field>
            <Field label="Invoice no."><input style={inputStyle} value={s.invNum} onChange={e => set({ invNum: e.target.value })} placeholder="ORPI-001" /></Field>
            <Field label="Date"><input type="date" style={inputStyle} value={s.date} onChange={e => set({ date: e.target.value })} /></Field>
          </ThreeCol>
          <TwoCol>
            <Field label="Valid / due"><input type="date" style={inputStyle} value={s.due} onChange={e => set({ due: e.target.value })} /></Field>
            <Field label="Sales person">
              <select style={selStyle} value={s.salesPerson} onChange={e => set({ salesPerson: e.target.value })}>
                {['Ruds', 'Rahul', 'Punit', 'Snehal'].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
          </TwoCol>

          <SectionHead>Client &amp; event</SectionHead>
          <TwoCol>
            <Field label="Client name"><input style={inputStyle} value={s.client} onChange={e => set({ client: e.target.value })} /></Field>
            <Field label="Event type">
              <select style={selStyle} value={s.etype} onChange={e => set({ etype: e.target.value })}>
                {['Wedding Reception', 'Mendhi/Sangeet', 'Engagement', 'Birthday Party', 'Corporate', 'House Party', 'Other'].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
          </TwoCol>
          <TwoCol>
            <Field label="Venue"><input style={inputStyle} value={s.venue} onChange={e => set({ venue: e.target.value })} /></Field>
            <Field label="Event date"><input type="date" style={inputStyle} value={s.edate} onChange={e => set({ edate: e.target.value })} /></Field>
          </TwoCol>
          <ThreeCol>
            <Field label="Time (start–end)"><input style={inputStyle} value={s.etime} onChange={e => set({ etime: e.target.value })} placeholder="4:30pm – 11:30pm" /></Field>
            <Field label="Guests"><input type="number" style={inputStyle} value={s.guests} onChange={e => set({ guests: e.target.value })} /></Field>
            <Field label="Package">
              <select style={selStyle} value={s.pkg} onChange={e => set({ pkg: e.target.value })}>
                {['Unlimited Service', 'Welcome Drinks Only', 'Bar Only (client supplies alcohol)', 'Cocktail Experience', 'Custom'].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
          </ThreeCol>
          <TwoCol>
            <Field label="Duration"><input style={inputStyle} value={s.duration} onChange={e => set({ duration: e.target.value })} placeholder="7 hours" /></Field>
            <Field label="Setup access time"><input style={inputStyle} value={s.setup} onChange={e => set({ setup: e.target.value })} placeholder="3:00pm" /></Field>
          </TwoCol>

          <SectionHead>Welcome drinks</SectionHead>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
            <input type="checkbox" checked={s.wdOn} onChange={e => set({ wdOn: e.target.checked })} />
            <label style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>Include welcome drinks</label>
            <select style={{ ...selStyle, width: 110 }} value={s.wdDur} onChange={e => set({ wdDur: e.target.value })}>
              {['1 hour', '1.5 hours', '2 hours', '2.5 hours', '3 hours'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <EditableList items={s.wdItems} onChange={items => set({ wdItems: items })} addLabel="+ Add item" />

          <SectionHead>Inclusions</SectionHead>
          <EditableList items={s.inclItems} onChange={items => set({ inclItems: items })} addLabel="+ Add inclusion" />

          <SectionHead>Spirits &amp; alcohol</SectionHead>
          <SpiritEditor rows={s.spiritRows} onChange={rows => set({ spiritRows: rows })} />

          <SectionHead>Soft drinks &amp; mixers</SectionHead>
          <EditableList items={s.softItems} onChange={items => set({ softItems: items })} addLabel="+ Add item" />

          <SectionHead>Cocktails &amp; mocktails</SectionHead>
          <TwoCol>
            <Field label="Cocktails">
              <select style={selStyle} value={s.nct} onChange={e => {
                const n = parseInt(e.target.value);
                const names = [...s.cocktailNames]; while (names.length < n) names.push('');
                set({ nct: n, cocktailNames: names });
              }}>
                <option value={0}>None</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Mocktails">
              <select style={selStyle} value={s.nmt} onChange={e => {
                const n = parseInt(e.target.value);
                const names = [...s.mocktailNames]; while (names.length < n) names.push('');
                set({ nmt: n, mocktailNames: names });
              }}>
                <option value={0}>None</option>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          </TwoCol>
          {s.nct > 0 && <NameList label="Cocktail names" names={s.cocktailNames.slice(0, s.nct)} onChange={names => set({ cocktailNames: names })} />}
          {s.nmt > 0 && <NameList label="Mocktail names" names={s.mocktailNames.slice(0, s.nmt)} onChange={names => set({ mocktailNames: names })} />}

          <SectionHead>Add-ons &amp; extras</SectionHead>
          <AddonEditor addons={s.addons} onChange={addons => set({ addons })} />

          <SectionHead>Complimentary</SectionHead>
          <EditableList items={s.compItems} onChange={items => set({ compItems: items })} addLabel="+ Add item" />

          <SectionHead>Notes</SectionHead>
          <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={s.notes} onChange={e => set({ notes: e.target.value })} placeholder="Any notes or conditions…" />

          <SectionHead>Pricing</SectionHead>
          <ThreeCol>
            <Field label="Base price (£)"><input type="number" style={inputStyle} value={s.base} onChange={e => set({ base: e.target.value })} step="50" /></Field>
            <Field label="Discount (£)"><input type="number" style={inputStyle} value={s.disc} onChange={e => set({ disc: e.target.value })} step="10" /></Field>
            <Field label="Total"><input style={{ ...inputStyle, background: 'var(--off)', color: 'var(--muted)' }} value={gbp(total)} disabled /></Field>
          </ThreeCol>

          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <button onClick={saveToNotion} disabled={saving} style={btnBlack}>{saving ? 'Saving…' : 'Save to Notion'}</button>
            <button onClick={() => window.print()} style={btnGold}>🖨 Download PDF</button>
            <button onClick={resetAll} style={btnOutline}>Reset</button>
          </div>
          {saveMsg && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--success)' }}>{saveMsg}</div>}
        </div>

        <QuotePreview s={s} addonTotal={addonTotal} total={total} dep={dep} />
      </div>
    </div>
  );
}

// ---- Reusable editors ------------------------------------------------------
function EditableList({ items, onChange, addLabel }) {
  function update(id, patch) { onChange(items.map(i => i.id === id ? { ...i, ...patch } : i)); }
  function remove(id) { onChange(items.filter(i => i.id !== id)); }
  function add() { onChange([...items, { id: uid(), text: '', on: true }]); }
  return (
    <div>
      {items.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--off)' }}>
          <input type="checkbox" checked={item.on} onChange={e => update(item.id, { on: e.target.checked })} />
          <input style={{ ...miniInput, flex: 1 }} value={item.text} onChange={e => update(item.id, { text: e.target.value })} />
          <button onClick={() => remove(item.id)} style={rmBtn}>✕</button>
        </div>
      ))}
      <button onClick={add} style={addLinkStyle}>{addLabel}</button>
    </div>
  );
}

function SpiritEditor({ rows, onChange }) {
  function updateRow(id, patch) { onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r)); }
  function removeRow(id) { onChange(rows.filter(r => r.id !== id)); }
  function addRow() { onChange([...rows, { id: uid(), cat: 'New category', on: true, items: [{ id: uid(), text: '', on: true }] }]); }
  function updateItem(rowId, itemId, patch) {
    onChange(rows.map(r => r.id === rowId ? { ...r, items: r.items.map(i => i.id === itemId ? { ...i, ...patch } : i) } : r));
  }
  function removeItem(rowId, itemId) {
    onChange(rows.map(r => r.id === rowId ? { ...r, items: r.items.filter(i => i.id !== itemId) } : r));
  }
  function addItem(rowId) {
    onChange(rows.map(r => r.id === rowId ? { ...r, items: [...r.items, { id: uid(), text: '', on: true }] } : r));
  }
  return (
    <div>
      {rows.map(row => (
        <div key={row.id} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <input type="checkbox" checked={row.on} onChange={e => updateRow(row.id, { on: e.target.checked })} />
            <input style={{ ...miniInput, fontWeight: 500, maxWidth: 110 }} value={row.cat} onChange={e => updateRow(row.id, { cat: e.target.value })} />
            <button onClick={() => removeRow(row.id)} style={rmBtn}>✕</button>
          </div>
          <div style={{ paddingLeft: 22 }}>
            {row.items.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--off)' }}>
                <input type="checkbox" checked={item.on} onChange={e => updateItem(row.id, item.id, { on: e.target.checked })} />
                <input style={{ ...miniInput, flex: 1 }} value={item.text} onChange={e => updateItem(row.id, item.id, { text: e.target.value })} />
                <button onClick={() => removeItem(row.id, item.id)} style={rmBtn}>✕</button>
              </div>
            ))}
            <button onClick={() => addItem(row.id)} style={{ ...addLinkStyle, fontSize: 11 }}>+ Add</button>
          </div>
        </div>
      ))}
      <button onClick={addRow} style={addLinkStyle}>+ Add category</button>
    </div>
  );
}

function AddonEditor({ addons, onChange }) {
  function update(id, patch) { onChange(addons.map(a => a.id === id ? { ...a, ...patch } : a)); }
  function remove(id) { onChange(addons.filter(a => a.id !== id)); }
  function add() { onChange([...addons, { id: uid(), label: 'Custom add-on', desc: '', price: '', on: true }]); }
  return (
    <div>
      {addons.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--off)' }}>
          <input type="checkbox" checked={a.on} onChange={e => update(a.id, { on: e.target.checked })} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{a.label}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.desc}</div>
          </div>
          <input style={{ ...miniInput, width: 70, textAlign: 'right' }} value={a.price} onChange={e => update(a.id, { price: e.target.value })} placeholder="£" />
          <button onClick={() => remove(a.id)} style={rmBtn}>✕</button>
        </div>
      ))}
      <button onClick={add} style={addLinkStyle}>+ Add custom extra</button>
    </div>
  );
}

function NameList({ label, names, onChange }) {
  function update(i, val) { const copy = [...names]; copy[i] = val; onChange(copy); }
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', margin: '8px 0 4px' }}>{label}</div>
      {names.map((n, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', width: 18 }}>{i + 1}.</span>
          <input style={{ ...miniInput, flex: 1 }} value={n} onChange={e => update(i, e.target.value)} placeholder="TBC" />
        </div>
      ))}
    </div>
  );
}

// ---- Small layout helpers ---------------------------------------------------
function SectionHead({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', padding: '12px 0 7px', borderBottom: '1px solid var(--border)', marginBottom: 10, marginTop: 16 }}>{children}</div>;
}
function TwoCol({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>{children}</div>; }
function ThreeCol({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>{children}</div>; }
function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = { width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 };
const selStyle = { ...inputStyle, cursor: 'pointer' };
const miniInput = { padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12 };
const rmBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, padding: '2px 4px', lineHeight: 1 };
const addLinkStyle = { fontSize: 12, color: 'var(--gold)', cursor: 'pointer', marginTop: 5, display: 'inline-block', background: 'none', border: 'none' };
const btnBlack = { background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13 };
const btnGold = { background: 'var(--gold)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13 };
const btnOutline = { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', fontSize: 13 };

function fmtDate(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }
function fmtDatePretty(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; } }
function fmtDateLong(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } }
function gbp(n) { return '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ---- Printable preview ------------------------------------------------------
function QuotePreview({ s, addonTotal, total, dep }) {
  const docLabels = { quote: 'Quotation', deposit: 'Deposit Invoice', balance: 'Balance Invoice' };
  const wdActive = s.wdItems.filter(i => i.on && i.text.trim());
  const inclActive = s.inclItems.filter(i => i.on && i.text.trim());
  const softActive = s.softItems.filter(i => i.on && i.text.trim());
  const compActive = s.compItems.filter(i => i.on && i.text.trim());
  const activeSpirits = s.spiritRows.filter(r => r.on).map(r => ({ cat: r.cat, items: r.items.filter(i => i.on && i.text.trim()) })).filter(r => r.items.length);
  const activeAddons = s.addons.filter(a => a.on && parseFloat(a.price) > 0);

  if (!s.client && !s.venue) {
    return <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'center', padding: '60px 40px', color: 'var(--muted)', fontSize: 13 }}>Fill in the builder to preview the quote</div>;
  }

  return (
    <div className="inv-preview-doc" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', fontFamily: 'var(--sans)' }}>
      <div className="print-avoid-break" style={{ background: 'var(--black)', padding: '24px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 700, letterSpacing: '.18em', color: '#fff' }}>ORPI</div>
          <div style={{ fontSize: 10, letterSpacing: '.2em', color: '#555', marginTop: 2 }}>EVENTS</div>
          <div style={{ marginTop: 10, fontSize: 11, color: '#888', lineHeight: 1.8 }}>
            Unit 5 Clements Court, Clements Lane, Ilford, IG1 2QY<br />
            Rudhra: +44 7424 505763 &nbsp;|&nbsp; Rahul: +44 7405 812971
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: '#888', lineHeight: 1.8 }}>
          <p>Hello@Orpi.Events</p><p>@Orpi.Events</p>
          <div style={{ marginTop: 12, border: '1px solid #2a2a2a', padding: '10px 14px', borderRadius: 4, textAlign: 'left' }}>
            <div style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: '.08em' }}>Sort code</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>04-06-05</div>
            <div style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 6 }}>Account no</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>27534338</div>
          </div>
        </div>
      </div>
      <div style={{ height: 3, background: 'var(--gold)' }} />
      <div style={{ background: 'var(--off)', borderBottom: '1px solid var(--border)', padding: '12px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600 }}>{docLabels[s.doctype]}</div>
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--muted)', lineHeight: 1.9 }}>
          {s.date && <div><strong>{fmtDatePretty(s.date)}</strong> Date</div>}
          {s.invNum && <div><strong>{s.invNum}</strong> Invoice no.</div>}
          {s.due && <div><strong>{fmtDatePretty(s.due)}</strong> {s.doctype === 'quote' ? 'Valid until' : 'Due'}</div>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '14px 28px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--muted)', marginBottom: 8 }}>Client details</div>
          <p style={{ fontSize: 13, fontWeight: 600 }}>{s.client || '—'}</p>
        </div>
        <div style={{ padding: '14px 28px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--muted)', marginBottom: 8 }}>Payment details</div>
          <p style={{ fontSize: 12, lineHeight: 2 }}>ORPI Events LTD<br />Sort Code: 04-06-05 | Account: 27534338<br /><em style={{ color: 'var(--muted)' }}>Ref: [Surname + Event Date]</em><br />50% deposit on confirmation. Balance 14 days before.</p>
        </div>
      </div>
      <div style={{ padding: '16px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 2, marginBottom: 14 }}>
          <DL label="Event type" value={s.etype} />
          <DL label="Venue" value={s.venue} />
          <DL label="Event date" value={s.edate ? fmtDateLong(s.edate) : '—'} />
          <DL label="Service time" value={s.etime} />
          <DL label="Guests" value={s.guests} />
          <DL label="Package" value={s.pkg} />
          <DL label="Duration" value={s.duration} />
          {s.setup && <DL label="Setup access" value={s.setup} />}
        </div>

        {inclActive.length > 0 && (
          <Section title="What's included">
            <ul style={{ listStyle: 'none', padding: 0, fontSize: 12, lineHeight: 1.9 }}>
              {inclActive.map(i => <li key={i.id}>✓ {i.text}</li>)}
            </ul>
          </Section>
        )}
        {s.wdOn && wdActive.length > 0 && (
          <Section title={`${s.wdDur} welcome drinks`}>
            <div style={{ fontSize: 12 }}>{wdActive.map(i => i.text).join(', ')}</div>
          </Section>
        )}
        {activeSpirits.length > 0 && (
          <Section title="Spirits & alcohol">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {activeSpirits.map(row => (
                <div key={row.cat}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 3 }}>{row.cat}</div>
                  <div style={{ fontSize: 11, lineHeight: 1.9 }}>{row.items.map(i => <div key={i.id}>{i.text}</div>)}</div>
                </div>
              ))}
            </div>
          </Section>
        )}
        {softActive.length > 0 && (
          <Section title="Soft drinks & mixers">
            <div style={{ fontSize: 12 }}>{softActive.map(i => i.text).join(', ')}</div>
          </Section>
        )}
        {(s.nct > 0 || s.nmt > 0) && (
          <Section title="Cocktails & mocktails">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {s.nct > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 4 }}>Cocktails ×{s.nct}</div>
                  {s.cocktailNames.slice(0, s.nct).map((n, i) => <div key={i} style={{ fontSize: 12, padding: '2px 0' }}>{i + 1}. {n || 'TBC'}</div>)}
                </div>
              )}
              {s.nmt > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 4 }}>Mocktails ×{s.nmt}</div>
                  {s.mocktailNames.slice(0, s.nmt).map((n, i) => <div key={i} style={{ fontSize: 12, padding: '2px 0' }}>{i + 1}. {n || 'TBC'}</div>)}
                </div>
              )}
            </div>
          </Section>
        )}
        {activeAddons.length > 0 && (
          <Section title="Extras & add-ons">
            {activeAddons.map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--off)' }}>
                <span>{a.label}</span><span style={{ fontWeight: 500 }}>{gbp(parseFloat(a.price))}</span>
              </div>
            ))}
          </Section>
        )}
        {compActive.length > 0 && (
          <Section title="Complimentary"><div style={{ fontSize: 12 }}>{compActive.map(i => i.text).join(', ')}</div></Section>
        )}
        {s.notes && (
          <div style={{ background: 'var(--gold-bg)', borderLeft: '3px solid var(--gold)', padding: '10px 14px', fontSize: 12, borderRadius: '0 4px 4px 0', marginBottom: 10 }}>{s.notes}</div>
        )}
      </div>
      <div className="print-avoid-break" style={{ background: 'var(--black)', padding: '16px 28px' }}>
        <PriceRow label="Base package" value={gbp(parseFloat(s.base) || 0)} />
        {addonTotal > 0 && <PriceRow label="Extras / add-ons" value={gbp(addonTotal)} />}
        {parseFloat(s.disc) > 0 && <PriceRow label="Discount" value={`−${gbp(parseFloat(s.disc))}`} />}
        <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 700, color: '#fff', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
          <span>{s.doctype === 'quote' ? 'Total' : s.doctype === 'deposit' ? 'Deposit due (50%)' : 'Balance due'}</span>
          <span>{gbp(s.doctype === 'quote' ? total : dep)}</span>
        </div>
        {s.doctype === 'quote' && (
          <>
            <PriceRow label="50% deposit on booking confirmation" value={gbp(dep)} muted />
            <PriceRow label="Balance due 14 days before event" value={gbp(dep)} muted />
          </>
        )}
      </div>
      <div style={{ padding: '14px 28px', background: 'var(--off)', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.8 }}>
        Thank you for booking with ORPI Events. We look forward to making your day special.<br />
        <strong>Hello@Orpi.Events &nbsp;|&nbsp; @Orpi.Events &nbsp;|&nbsp; orpi.events</strong>
      </div>
    </div>
  );
}

function DL({ label, value }) {
  return (<><div style={{ fontSize: 11, color: 'var(--muted)', padding: '3px 0' }}>{label}</div><div style={{ fontSize: 11, padding: '3px 0' }}>{value || '—'}</div></>);
}
function Section({ title, children }) {
  return (<div className="print-avoid-break" style={{ marginBottom: 10 }}><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', margin: '12px 0 6px' }}>{title}</div>{children}</div>);
}
function PriceRow({ label, value, muted }) {
  return (<div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: muted ? 11 : 12, color: muted ? '#555' : '#888', borderBottom: '1px solid #1a1a1a' }}><span>{label}</span><span>{value}</span></div>);
}
