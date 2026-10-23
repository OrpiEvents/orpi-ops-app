'use client';
import { useEffect, useState } from 'react';
import AppShell from '../AppShell';
import { EVENT_TYPES, SERVICE_TYPES, HEARD_OPTIONS } from '@/lib/tracking';

// The Sales Pipeline's Source options, in the order the enquiry forms ask
// "How did you hear about us?".
const SOURCES = HEARD_OPTIONS.map(o => o.source);

const EMPTY = {
  name: '', email: '', phone: '', eventDate: '', venue: '', guestCount: '',
  eventType: 'Wedding Reception', serviceTypes: [],
  source: '', referredBy: '', internalNotes: '',
  status: 'New', followUpDate: '', lostReason: '',
};

// What a save sends: only what the panel edits. Sending the whole enquiry back
// used to overwrite things other screens own with whatever was loaded (a
// newer saved quote, the quote/decision dates the app stamps, the marketing
// flags), and turned a blank Quote Sent into £0.
const EDITABLE = Object.keys(EMPTY);

const LOST_REASONS = ['Price', 'Date unavailable', 'Went with another supplier',
  'No response', 'Event cancelled', 'Not a fit'];
const STATUSES = ['New', 'Contacted', 'Quote Sent', 'Won', 'Lost'];

const SERVICE_SHORT = {
  'Full Bar (ORPI supplies alcohol)': 'Full bar',
  'Bar Only (Client supplies alcohol)': 'Bar only',
  'Cocktail Experience': 'Cocktails',
  'Welcome Drinks': 'Welcome drinks',
  'Mocktails Only': 'Mocktails',
};
const shortService = s => SERVICE_SHORT[s] || s;

const gbp = n => '£' + Math.round(Number(n) || 0).toLocaleString('en-GB');

// The client's own words from the notes, minus the lines the app adds
// ("Came in through the enquiry page…", "Meta lead form…", dated follow-ups).
// Only used for the one-line preview in the list; the panel shows everything.
function clientWords(notes) {
  return String(notes || '').split('\n')
    .map(l => l.trim())
    .filter(l => l
      && !/^(came in through|meta lead form|created from enquiry|date not fixed yet|⚠)/i.test(l)
      && !/: follow-up sent \(/i.test(l))
    .map(l => l.replace(/^they said:\s*/i, ''))
    .join(' ');
}

function marketingLine(e) {
  if (e.marketingOptOut) return { text: 'Opted out: ticked “don’t send me planning tips and offers”', warn: true };
  if (e.marketing === 'Opted out') return { text: 'Opted out: no tips, offers or follow-ups', warn: true };
  if (e.marketing === 'OK') return { text: 'OK to send tips and offers' };
  return { text: 'Not opted out', muted: true };
}

function toForm(e) {
  if (!e) return { ...EMPTY, serviceTypes: [] };
  const f = { ...EMPTY };
  for (const k of EDITABLE) if (e[k] !== undefined && e[k] !== null) f[k] = e[k];
  f.guestCount = e.guestCount ?? '';
  f.phone = e.phone ?? '';
  f.serviceTypes = Array.isArray(e.serviceTypes) ? [...e.serviceTypes] : [];
  return f;
}

export default function EnquiriesClient({ userEmail }) {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // { id } shows that enquiry in the panel; { id: null } is a new one.
  const [panel, setPanel] = useState(null);

  async function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/enquiries').then(r => r.json());
      if (res.error) throw new Error(res.error);
      setEnquiries(res.enquiries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // A save hands back the enquiry as Notion now has it. Show that straight
  // away, then refresh the list quietly in case anything else moved.
  function onSaved(enq, isNew) {
    setEnquiries(list => isNew ? [enq, ...list] : list.map(x => (x.id === enq.id ? enq : x)));
    setPanel({ id: enq.id });
    load({ quiet: true });
  }

  async function markWon(e) {
    if (!confirm(`Mark ${e.name} as won and create a confirmed booking?`)) return;
    try {
      const bookingRes = await fetch('/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enquiry: e }),
      }).then(r => r.json());
      if (bookingRes.error) {
        if (bookingRes.gates?.length) {
          alert(`${bookingRes.error}\n\n${bookingRes.gates.map(g => `• ${g.label}\n   → ${g.fix}`).join('\n\n')}`);
        } else {
          alert(bookingRes.error);
        }
        return;
      }
      alert(`✓ ${e.name} added to Confirmed Bookings.`);
      await load({ quiet: true });
    } catch (err) {
      alert('Failed: ' + err.message);
    }
  }

  // A quote is only ever marked lost if doing so takes seconds. Asking for the
  // reason here — rather than hoping someone opens the panel later — is the
  // difference between having this data and not.
  async function markLost(e) {
    const list = LOST_REASONS.map((r, i) => `${i + 1}. ${r}`).join('\n');
    const answer = prompt(`Why did ${e.name} not convert?\n\n${list}\n\nEnter a number:`);
    if (answer === null) return;
    const reason = LOST_REASONS[parseInt(answer, 10) - 1];
    if (!reason) { alert('Pick a number from the list.'); return; }
    try {
      const res = await fetch(`/api/enquiries/${e.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Lost', lostReason: reason }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      await load({ quiet: true });
    } catch (err) {
      alert('Failed: ' + err.message);
    }
  }

  const today = new Date().toISOString().split('T')[0];
  // Sorted by value, because "11 overdue" is a shrug and "£44,195 overdue"
  // is a morning's work. Biggest first — those are the ones stalling.
  const overdue = enquiries
    .filter(e => e.followUpDate && e.followUpDate < today && !['Won', 'Lost'].includes(e.status))
    .sort((a, b) => (Number(b.quoteSent) || 0) - (Number(a.quoteSent) || 0));
  const overdueValue = overdue.reduce((t, e) => t + (Number(e.quoteSent) || 0), 0);
  const oldestDays = overdue.reduce((max, e) => {
    const d = Math.round((new Date(today) - new Date(e.followUpDate)) / 86400000);
    return d > max ? d : max;
  }, 0);

  const current = panel?.id ? enquiries.find(e => e.id === panel.id) : null;

  return (
    <AppShell active="/enquiries" userEmail={userEmail}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Enquiries</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>Live from Notion Sales Pipeline · click an enquiry for everything they told us</p>
        </div>
        <button onClick={() => setPanel({ id: null })} style={{ background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>+ New enquiry</button>
      </div>

      {error && <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>Couldn't load enquiries: {error}</div>}
      {overdue.length > 0 && (
        <div style={{ background: '#fef6e4', color: '#b8720a', padding: '12px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
          <strong>{gbp(overdueValue)} in {overdue.length} overdue follow-up{overdue.length > 1 ? 's' : ''}</strong>
          {oldestDays > 0 && <> · oldest {oldestDays} days past due</>}
          <div style={{ marginTop: 4, fontSize: 12 }}>
            {overdue.slice(0, 5).map(e => `${e.name}${e.quoteSent ? ` (${gbp(e.quoteSent)})` : ''}`).join(' · ')}
            {overdue.length > 5 && ` · +${overdue.length - 5} more`}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center' }}>Loading…</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--off)' }}>
                {['Name', 'Event', 'Date', 'Venue', 'Guests', 'Source', 'Status', 'Follow-up', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enquiries.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No enquiries yet</td></tr>
              ) : enquiries.map(e => {
                const words = clientWords(e.internalNotes);
                const services = e.serviceTypes || [];
                return (
                  <tr key={e.id} onClick={() => setPanel({ id: e.id })} style={{ cursor: 'pointer', background: panel?.id === e.id ? 'var(--gold-bg)' : undefined }}>
                    <Td minWidth={170}>
                      {/* A button so the row opens from the keyboard too; the
                          click carries on up to the row. */}
                      <button type="button" style={nameBtn}>{e.name || 'Unnamed'}</button>
                      {e.referredBy && <div style={{ fontSize: 11, color: 'var(--muted)' }}>via {e.referredBy}</div>}
                      {/* Zero-width flex child: the preview fills whatever
                          width the column already has instead of widening it
                          and pushing the buttons off the edge. */}
                      {words && (
                        <div title={words} style={{ display: 'flex' }}>
                          <span style={{ flex: '1 1 0', width: 0, fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>“{words}”</span>
                        </div>
                      )}
                    </Td>
                    <Td>
                      <span style={{ color: 'var(--muted)' }}>{e.eventType}</span>
                      {services.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 2 }}>{services.map(shortService).join(' · ')}</div>
                      )}
                    </Td>
                    <Td nowrap>{fmtDate(e.eventDate)}</Td>
                    <Td muted>{e.venue}</Td>
                    <Td>{e.guestCount ?? '—'}</Td>
                    <Td muted>{e.source}</Td>
                    <Td><StatusBadge status={e.status} /></Td>
                    <Td nowrap muted={!(e.followUpDate < today)}>{fmtDate(e.followUpDate)}</Td>
                    <Td>
                      <span onClick={ev => ev.stopPropagation()} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {e.status !== 'Lost' && (
                          <a href={`/quotes?enquiry=${e.id}`} style={quoteBtn}>Quote →</a>
                        )}
                        {e.status !== 'Won' && e.status !== 'Lost' && (
                          <>
                            <button onClick={() => markWon(e)} style={{ background: 'var(--gold)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>Won ✓</button>
                            <button onClick={() => markLost(e)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>Lost</button>
                          </>
                        )}
                        {e.status === 'Lost' && e.lostReason && (
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{e.lostReason}</span>
                        )}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {panel && (panel.id === null || current) && (
        <EnquiryPanel key={panel.id || 'new'} enquiry={current} onClose={() => setPanel(null)} onSaved={onSaved} />
      )}
    </AppShell>
  );
}

// ── The panel ──────────────────────────────────────────────────
// Reading first: every answer from the enquiry form, in the order the form
// asks, then where it stands. Edit switches the same panel to the fields.
function EnquiryPanel({ enquiry, onClose, onSaved }) {
  const isNew = !enquiry;
  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState(() => toForm(enquiry));
  const [saving, setSaving] = useState(false);
  const set = patch => setForm(f => ({ ...f, ...patch }));

  // Escape closes while reading; while editing it would throw changes away.
  useEffect(() => {
    if (editing) return undefined;
    const onKey = ev => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, onClose]);

  function startEditing() { setForm(toForm(enquiry)); setEditing(true); }

  async function save() {
    if (!form.name.trim()) { alert('Client name is required.'); return; }
    if (form.status === 'Lost' && !form.lostReason) {
      alert('Pick a lost reason — it is the only way to tell a pricing problem from a follow-up problem.');
      return;
    }
    setSaving(true);
    try {
      const body = {};
      for (const k of EDITABLE) body[k] = form[k];
      const res = await fetch(isNew ? '/api/enquiries' : `/api/enquiries/${enquiry.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      setEditing(false);
      onSaved(res.enquiry, isNew);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const sub = enquiry ? [enquiry.eventType, enquiry.eventDate && fmtDate(enquiry.eventDate), enquiry.venue].filter(Boolean).join(' · ') : '';

  return (
    <div onClick={editing ? undefined : onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={ev => ev.stopPropagation()} style={{ width: 540, maxWidth: '100vw', height: '100%', background: '#fff', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,.08)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>{isNew ? 'New enquiry' : enquiry.name}</h2>
            {sub && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sub}</p>}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0 }}>
            {!isNew && !editing && enquiry.status !== 'Lost' && (
              <a href={`/quotes?enquiry=${enquiry.id}`} style={{ fontSize: 12, background: 'var(--gold)', color: '#fff', padding: '7px 12px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}>Quote →</a>
            )}
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20, lineHeight: 1 }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {editing ? <EditFields form={form} set={set} /> : <Details e={enquiry} />}
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {editing ? (
            <>
              <button onClick={save} disabled={saving} style={btnBlack}>{saving ? 'Saving…' : 'Save to Notion'}</button>
              <button onClick={() => (isNew ? onClose() : setEditing(false))} disabled={saving} style={btnGhost}>Cancel</button>
            </>
          ) : (
            <>
              <button onClick={startEditing} style={btnBlack}>Edit details</button>
              {enquiry.url && (
                <a href={enquiry.url} target="_blank" rel="noopener noreferrer" style={{ ...btnGhost, textDecoration: 'none', color: 'var(--text)' }}>Open in Notion ↗</a>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Details({ e }) {
  const mk = marketingLine(e);
  const services = e.serviceTypes || [];
  const today = new Date().toISOString().split('T')[0];
  const overdue = e.followUpDate && e.followUpDate < today && !['Won', 'Lost'].includes(e.status);
  return (
    <>
      <Section title="What they told us">
        <Row label="Phone" value={e.phone ? <a href={`tel:${String(e.phone).replace(/[^\d+]/g, '')}`} style={linkStyle}>{e.phone}</a> : null} />
        <Row label="Email" value={e.email ? <a href={`mailto:${e.email}`} style={linkStyle}>{e.email}</a> : null} />
        <Row label="Event date" value={e.eventDate ? <>{fmtLongDate(e.eventDate)} <span style={{ color: 'var(--muted)' }}>· {fromNow(e.eventDate)}</span></> : null} />
        <Row label="Venue" value={e.venue} />
        <Row label="Guests" value={e.guestCount} />
        <Row label="Service" value={services.length ? (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {services.map(s => <span key={s} style={chipOn}>{s}</span>)}
          </span>
        ) : null} />
        <Row label="Event type" value={e.eventType} />
        <Row label="Heard about us" value={e.source} />
        <Row label="Recommended by" value={e.referredBy} />
        <Row label="Anything else?" value={e.internalNotes ? <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{e.internalNotes}</div> : null} />
        <Row label="Tips & offers" value={<span style={{ color: mk.warn ? 'var(--danger)' : mk.muted ? 'var(--muted)' : 'inherit' }}>{mk.text}</span>} />
      </Section>

      <Section title="Where it stands">
        <Row label="Status" value={<StatusBadge status={e.status} />} />
        {e.status === 'Lost' && <Row label="Lost reason" value={e.lostReason} />}
        <Row label="Follow-up" value={e.followUpDate ? <span style={{ color: overdue ? 'var(--danger)' : 'inherit' }}>{fmtDate(e.followUpDate)}{overdue ? ' · overdue' : ''}</span> : null} />
        <Row label="Enquired" value={[e.createdAt && fmtDate(String(e.createdAt).slice(0, 10)), e.channel && `via ${e.channel}`].filter(Boolean).join(' · ')} />
        {e.acknowledgedAt && <Row label="Acknowledged" value={`Emailed automatically ${fmtDate(e.acknowledgedAt)}`} />}
        {e.planningStage && <Row label="Planning stage" value={e.planningStage} />}
        {(e.campaign || e.adPost) && <Row label="Campaign / post" value={[e.campaign, e.adPost].filter(Boolean).join(' · ')} />}
      </Section>

      {(e.quoteSent || e.quotedExtras) && (
        <Section title="Latest quote">
          {e.quoteSent ? <Row label="Quoted" value={`${gbp(e.quoteSent)}${e.dateQuoted ? ` · sent ${fmtDate(e.dateQuoted)}` : ''}`} /> : null}
          {e.quotedExtras && <Row label="Extras" value={<div style={{ whiteSpace: 'pre-wrap' }}>{e.quotedExtras}</div>} />}
        </Section>
      )}
    </>
  );
}

function EditFields({ form, set }) {
  // A value Notion has that isn't on our list (renamed option, typed by hand)
  // still shows as itself rather than silently reading as the first option.
  const withCurrent = (list, v) => (v && !list.includes(v) ? [...list, v] : list);
  return (
    <>
      <Field label="Client name *"><input style={inputStyle} value={form.name} onChange={ev => set({ name: ev.target.value })} /></Field>
      <Grid>
        <Field label="Phone"><input style={inputStyle} type="tel" value={form.phone} onChange={ev => set({ phone: ev.target.value })} /></Field>
        <Field label="Email"><input style={inputStyle} type="email" value={form.email} onChange={ev => set({ email: ev.target.value })} /></Field>
      </Grid>
      <Grid>
        <Field label="Event date"><input type="date" style={inputStyle} value={form.eventDate} onChange={ev => set({ eventDate: ev.target.value })} /></Field>
        <Field label="Venue"><input style={inputStyle} value={form.venue} onChange={ev => set({ venue: ev.target.value })} /></Field>
      </Grid>
      <Grid>
        <Field label="Guest count"><input type="number" min="0" style={inputStyle} value={form.guestCount} onChange={ev => set({ guestCount: ev.target.value })} /></Field>
        <Field label="Event type">
          <select style={inputStyle} value={form.eventType} onChange={ev => set({ eventType: ev.target.value })}>
            <option value="">—</option>
            {withCurrent(EVENT_TYPES, form.eventType).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
      </Grid>
      <Field group label="Service — tick everything they asked for">
        <ServicePicker value={form.serviceTypes} onChange={serviceTypes => set({ serviceTypes })} />
      </Field>
      <Grid>
        <Field label="Heard about us">
          <select style={inputStyle} value={form.source} onChange={ev => set({ source: ev.target.value })}>
            <option value="">Not known yet</option>
            {withCurrent(SOURCES, form.source).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Recommended by"><input style={inputStyle} value={form.referredBy} onChange={ev => set({ referredBy: ev.target.value })} /></Field>
      </Grid>
      <Field label="Anything else? · their answer, plus your notes">
        <textarea style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} rows={6} value={form.internalNotes} onChange={ev => set({ internalNotes: ev.target.value })} />
      </Field>
      <Grid>
        <Field label="Status">
          <select style={inputStyle} value={form.status} onChange={ev => set({ status: ev.target.value })}>
            {withCurrent(STATUSES, form.status).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Follow-up date"><input type="date" style={inputStyle} value={form.followUpDate} onChange={ev => set({ followUpDate: ev.target.value })} /></Field>
      </Grid>
      {form.status === 'Lost' && (
        <Field label="Lost reason *">
          <select style={inputStyle} value={form.lostReason} onChange={ev => set({ lostReason: ev.target.value })}>
            <option value="">Choose one…</option>
            {LOST_REASONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
      )}
    </>
  );
}

function ServicePicker({ value, onChange }) {
  const list = Array.isArray(value) ? value : [];
  const options = [...SERVICE_TYPES, ...list.filter(s => !SERVICE_TYPES.includes(s))];
  // Newly ticked ones go on the end, so the first service (the one the quote
  // builder sets its package from) only changes if it's unticked.
  const toggle = s => onChange(list.includes(s) ? list.filter(x => x !== s) : [...list, s]);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(s => {
        const on = list.includes(s);
        return (
          <button key={s} type="button" aria-pressed={on} onClick={() => toggle(s)} style={{ ...(on ? chipOn : chipOff), cursor: 'pointer', fontFamily: 'inherit' }}>
            {on ? '✓ ' : ''}{s}
          </button>
        );
      })}
    </div>
  );
}

function Td({ children, muted, nowrap, minWidth }) {
  return <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--off)', color: muted ? 'var(--muted)' : 'inherit', verticalAlign: 'top', whiteSpace: nowrap ? 'nowrap' : undefined, minWidth }}>{children}</td>;
}
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid var(--off)' }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ label, value }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--off)' }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', width: 120, flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflowWrap: 'anywhere', color: empty ? 'var(--muted)' : 'inherit' }}>{empty ? '—' : value}</span>
    </div>
  );
}
function Grid({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', columnGap: 12 }}>{children}</div>; }
// A <label> so tapping the caption focuses the input. A group of buttons (the
// service chips) gets a plain wrapper instead: inside a label, tapping the
// caption would toggle the first chip.
function Field({ label, children, group = false }) {
  const Wrap = group ? 'div' : 'label';
  return (
    <Wrap style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 4 }}>{label}</span>
      {children}
    </Wrap>
  );
}
function StatusBadge({ status }) {
  const colors = {
    New: ['#f0eeea', '#5a5850'], Contacted: ['#fff3e0', '#b8720a'], 'Quote Sent': ['#fff8e0', '#9a7500'],
    Won: ['var(--success-bg)', 'var(--success)'], Lost: ['var(--danger-bg)', 'var(--danger)'],
  };
  const [bg, fg] = colors[status] || colors.New;
  return <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>{status || 'New'}</span>;
}

const inputStyle = { width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' };
const btnBlack = { background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer' };
const btnGhost = { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer', display: 'inline-block' };
const nameBtn = { background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: 'inherit', cursor: 'pointer', textAlign: 'left' };
const quoteBtn = { background: 'var(--gold-bg)', color: '#7a6300', border: '1px solid var(--gold)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' };
const chipOn = { background: 'var(--gold-bg)', color: '#7a6300', border: '1px solid var(--gold)', borderRadius: 20, padding: '3px 10px', fontSize: 12, lineHeight: 1.4 };
const chipOff = { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px', fontSize: 12, lineHeight: 1.4 };
const linkStyle = { color: 'var(--text)', textDecoration: 'underline', textDecorationColor: 'var(--border)', textUnderlineOffset: 3 };

function fmtDate(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }
function fmtLongDate(d) { try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(',', ''); } catch { return d; } }
// "in 8 months", "in 3 weeks" — how much runway there is, which shapes the
// quote (peak-season dates, whether there's time for a tasting).
function fromNow(d) {
  const today = new Date().toISOString().split('T')[0];
  const days = Math.round((new Date(d + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000);
  if (Number.isNaN(days)) return '';
  if (days < 0) return 'date has passed';
  if (days === 0) return 'today';
  if (days < 14) return `in ${days} day${days === 1 ? '' : 's'}`;
  if (days < 61) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30.44)} months`;
}
