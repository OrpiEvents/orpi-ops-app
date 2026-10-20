'use client';
// The read-the-terms-then-accept flow, shown under the invoice on the public
// page. Before acceptance: the full Terms + a type-your-name confirmation.
// After acceptance: a logged confirmation + the deposit payment details.
import { useState } from 'react';
import { TERMS_INTRO, TERMS_CLAUSES, TERMS_TITLE, TERMS_VERSION } from '@/lib/terms';

// Render **bold** segments inside an otherwise plain string.
function RichText({ text }) {
  const parts = String(text).split('**');
  return <>{parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>))}</>;
}
function gbp0(n) { return '£' + Math.round(Number(n) || 0).toLocaleString('en-GB'); }
function fmtWhen(iso) {
  try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

const card = { background: '#fff', border: '1px solid var(--border)', borderRadius: 10, marginTop: 20, overflow: 'hidden' };
const cardPad = { padding: '26px 30px' };
const bankGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 14 };
const bankLabel = { fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase', color: '#8a8880', marginBottom: 4 };
const bankVal = { fontSize: 14, color: '#0a0a0a', fontWeight: 500, letterSpacing: '.04em' };

export default function SignAccept({ token, dep, eventRef, agreement }) {
  const [agreed, setAgreed] = useState(agreement || null);
  const [name, setName] = useState('');
  const [tick, setTick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    if (name.trim().length < 2) { setErr('Please type your full name.'); return; }
    if (!tick) { setErr('Please tick the box to confirm you accept the terms.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${token}/accept`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), agree: true }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Something went wrong — please try again.'); setBusy(false); return; }
      setAgreed(data.invoice.agreement);
      if (typeof window !== 'undefined') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } catch {
      setErr('Network error — please try again.');
    }
    setBusy(false);
  }

  const Payment = () => (
    <div style={{ ...cardPad, background: 'var(--gold-bg)', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 600 }}>Secure your date</div>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 24, color: '#0a0a0a', marginTop: 6 }}>
        Pay your 50% deposit — <strong>{gbp0(dep)}</strong>
      </div>
      <p style={{ fontSize: 13, color: '#555', marginTop: 6, lineHeight: 1.6 }}>
        Please transfer the deposit to the account below. Your date is held once the deposit reaches us; the balance is due no later than 14 days before your event.
      </p>
      <div style={bankGrid}>
        <div><div style={bankLabel}>Payee</div><div style={bankVal}>ORPI Events LTD</div></div>
        <div><div style={bankLabel}>Sort code</div><div style={bankVal}>04-06-05</div></div>
        <div><div style={bankLabel}>Account no.</div><div style={bankVal}>27534338</div></div>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={bankLabel}>Payment reference</div>
        <div style={bankVal}>{eventRef}</div>
      </div>
    </div>
  );

  return (
    <div style={card}>
      {/* Full terms */}
      <div style={cardPad}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: '#0a0a0a', letterSpacing: '.02em' }}>{TERMS_TITLE}</div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4, letterSpacing: '.04em' }}>Version {TERMS_VERSION} · please read in full before accepting</div>
        <p style={{ fontSize: 12.5, color: '#333', lineHeight: 1.7, marginTop: 16 }}><RichText text={TERMS_INTRO} /></p>
        {TERMS_CLAUSES.map(cl => (
          <div key={cl.n} style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0a0a0a' }}>{cl.n}. {cl.title}</div>
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {cl.items.map((it, i) => (
                <li key={i} style={{ fontSize: 12.5, color: '#333', lineHeight: 1.65, marginBottom: 5 }}><RichText text={it} /></li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {agreed ? (
        <>
          <div style={{ ...cardPad, background: 'var(--success-bg)', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, color: 'var(--success)', fontWeight: 600 }}>✓ Terms accepted</div>
            <div style={{ fontSize: 13, color: '#1c1b18', marginTop: 6, lineHeight: 1.6 }}>
              Accepted by <strong>{agreed.name}</strong> on {fmtWhen(agreed.acceptedAt)}.
              A record of this acceptance has been logged with ORPI Events.
            </div>
          </div>
          <Payment />
        </>
      ) : (
        <div style={{ ...cardPad, background: '#faf9f6', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 600 }}>Accept &amp; confirm</div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: '#0a0a0a', marginTop: 6 }}>Accept the terms to continue</div>
          <p style={{ fontSize: 13, color: '#555', marginTop: 6, lineHeight: 1.6 }}>
            Once you accept, we&rsquo;ll show your deposit payment details. Your date is confirmed when the deposit reaches us.
          </p>

          <label style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', margin: '18px 0 5px' }}>Your full name</label>
          <input
            value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya Sharma"
            style={{ width: '100%', maxWidth: 360, padding: '10px 13px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
          />

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={tick} onChange={e => setTick(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: '#333', lineHeight: 1.6 }}>
              I confirm I have read and agree to ORPI Events&rsquo; Terms &amp; Conditions (and Privacy Notice) above, together with the quotation/invoice shown, and that I&rsquo;m authorised to book this event.
            </span>
          </label>

          {err && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 12 }}>{err}</div>}

          <button
            onClick={submit} disabled={busy}
            style={{ marginTop: 18, background: busy ? '#bbb' : 'var(--gold)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 26px', fontSize: 14, fontWeight: 500, letterSpacing: '.02em' }}
          >
            {busy ? 'Confirming…' : 'Confirm & accept terms'}
          </button>
        </div>
      )}
    </div>
  );
}
