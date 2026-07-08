'use client';
import { useEffect, useState, cloneElement } from 'react';
import AppShell from '../AppShell';

const EMPTY = {
  name: '', email: '', phone: '', eventDate: '', venue: '', guestCount: '',
  eventType: 'Wedding Reception', serviceType: 'Full Bar (ORPI supplies alcohol)',
  source: 'Instagram', referredBy: '', status: 'New', followUpDate: '', internalNotes: '',
};

export default function EnquiriesClient({ userEmail }) {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/enquiries').then(r => r.json());
      if (res.error) throw new Error(res.error);
      setEnquiries(res.enquiries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openNew() { setForm(EMPTY); setEditingId(null); setModalOpen(true); }
  function openEdit(e) {
    setForm({ ...EMPTY, ...e, guestCount: e.guestCount ?? '', phone: e.phone ?? '' });
    setEditingId(e.id);
    setModalOpen(true);
  }

  async function save() {
    if (!form.name.trim()) { alert('Client name is required.'); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/enquiries/${editingId}` : '/api/enquiries';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        .then(r => r.json());
      if (res.error) throw new Error(res.error);
      setModalOpen(false);
      await load();
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function markWon(e) {
    if (!confirm(`Mark ${e.name} as won and create a confirmed booking?`)) return;
    try {
      const bookingRes = await fetch('/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enquiry: e }),
      }).then(r => r.json());
      if (bookingRes.error) throw new Error(bookingRes.error);
      alert(`✓ ${e.name} added to Confirmed Bookings.`);
      await load();
    } catch (err) {
      alert('Failed: ' + err.message);
    }
  }

  const today = new Date().toISOString().split('T')[0];
  const overdue = enquiries.filter(e => e.followUpDate && e.followUpDate < today && !['Won', 'Lost'].includes(e.status));

  return (
    <AppShell active="/enquiries" userEmail={userEmail}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Enquiries</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>Live from Notion Sales Pipeline</p>
        </div>
        <button onClick={openNew} style={{ background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13 }}>+ New enquiry</button>
      </div>

      {error && <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>Couldn't load enquiries: {error}</div>}
      {overdue.length > 0 && <div style={{ background: '#fef6e4', color: '#b8720a', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>⚠ {overdue.length} overdue follow-up{overdue.length > 1 ? 's' : ''}: {overdue.map(e => e.name).join(', ')}</div>}

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center' }}>Loading…</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--off)' }}>
                {['Name', 'Event', 'Date', 'Venue', 'Guests', 'Source', 'Status', 'Follow-up', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 14px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enquiries.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No enquiries yet</td></tr>
              ) : enquiries.map(e => (
                <tr key={e.id}>
                  <Td><a onClick={() => openEdit(e)} style={{ cursor: 'pointer', fontWeight: 600 }}>{e.name}</a>{e.referredBy && <div style={{ fontSize: 11, color: 'var(--muted)' }}>via {e.referredBy}</div>}</Td>
                  <Td muted>{e.eventType}</Td>
                  <Td>{fmtDate(e.eventDate)}</Td>
                  <Td muted>{e.venue}</Td>
                  <Td>{e.guestCount ?? '—'}</Td>
                  <Td muted>{e.source}</Td>
                  <Td><StatusBadge status={e.status} /></Td>
                  <Td muted={!(e.followUpDate < today)}>{fmtDate(e.followUpDate)}</Td>
                  <Td>{e.status !== 'Won' && e.status !== 'Lost' && (
                    <button onClick={() => markWon(e)} style={{ background: 'var(--gold)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11 }}>Won ✓</button>
                  )}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{editingId ? 'Edit enquiry' : 'New enquiry'}</h2>
          <Field label="Client name *"><input style={inputStyle} value={form.name} onChange={v => setForm({ ...form, name: v })} /></Field>
          <Row>
            <Field label="Phone"><input style={inputStyle} value={form.phone} onChange={v => setForm({ ...form, phone: v })} /></Field>
            <Field label="Email"><input style={inputStyle} value={form.email} onChange={v => setForm({ ...form, email: v })} /></Field>
          </Row>
          <Row>
            <Field label="Event date"><input type="date" style={inputStyle} value={form.eventDate} onChange={v => setForm({ ...form, eventDate: v })} /></Field>
            <Field label="Venue"><input style={inputStyle} value={form.venue} onChange={v => setForm({ ...form, venue: v })} /></Field>
          </Row>
          <Row>
            <Field label="Guest count"><input type="number" style={inputStyle} value={form.guestCount} onChange={v => setForm({ ...form, guestCount: v })} /></Field>
            <Field label="Event type">
              <select style={inputStyle} value={form.eventType} onChange={v => setForm({ ...form, eventType: v })}>
                {['Wedding Reception', 'Mendhi/Sangeet', 'Birthday', 'Corporate', 'Other'].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Source">
              <select style={inputStyle} value={form.source} onChange={v => setForm({ ...form, source: v })}>
                {['Instagram', 'Referral', 'Venue', 'Planner', 'Google', 'Wedding Show', 'Other'].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Referred by"><input style={inputStyle} value={form.referredBy} onChange={v => setForm({ ...form, referredBy: v })} /></Field>
          </Row>
          <Row>
            <Field label="Status">
              <select style={inputStyle} value={form.status} onChange={v => setForm({ ...form, status: v })}>
                {['New', 'Contacted', 'Quote Sent', 'Won', 'Lost'].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Follow-up date"><input type="date" style={inputStyle} value={form.followUpDate} onChange={v => setForm({ ...form, followUpDate: v })} /></Field>
          </Row>
          <Field label="Internal notes"><textarea style={{ ...inputStyle, resize: 'vertical' }} rows={3} value={form.internalNotes} onChange={v => setForm({ ...form, internalNotes: v })} /></Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={save} disabled={saving} style={{ background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13 }}>{saving ? 'Saving…' : 'Save to Notion'}</button>
            <button onClick={() => setModalOpen(false)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 18px', fontSize: 13 }}>Cancel</button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}

function Td({ children, muted }) { return <td style={{ padding: '10px 14px', fontSize: 13, borderBottom: '1px solid var(--off)', color: muted ? 'var(--muted)' : 'inherit' }}>{children}</td>; }
function Row({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>; }
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 4 }}>{label}</label>
      {typeof children.props.onChange === 'function'
        ? cloneElement(children, { onChange: e => children.props.onChange(e.target.value) })
        : children}
    </div>
  );
}
function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 560, maxWidth: '95vw', padding: 24, marginBottom: 40 }}>
        {children}
      </div>
    </div>
  );
}
function StatusBadge({ status }) {
  const colors = {
    New: ['#f0eeea', '#5a5850'], Contacted: ['#fff3e0', '#b8720a'], 'Quote Sent': ['#fff8e0', '#9a7500'],
    Won: ['var(--success-bg)', 'var(--success)'], Lost: ['var(--danger-bg)', 'var(--danger)'],
  };
  const [bg, fg] = colors[status] || colors.New;
  return <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20 }}>{status}</span>;
}
const inputStyle = { width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 };
function fmtDate(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }
