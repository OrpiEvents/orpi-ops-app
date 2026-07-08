'use client';
import { useEffect, useState } from 'react';
import AppShell from '../AppShell';

export default function BookingsClient({ userEmail }) {
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/bookings').then(r => r.json());
      if (res.error) throw new Error(res.error);
      setBookings(res.bookings || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <AppShell active="/bookings" userEmail={userEmail}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Confirmed bookings</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
            Live from Notion Booking &amp; Quotes Tracker — Status = Confirmed Booking
          </p>
        </div>
        <button onClick={load} style={{
          background: 'transparent', border: '1px solid var(--border)', borderRadius: 8,
          padding: '6px 14px', fontSize: 12,
        }}>↻ Refresh</button>
      </div>

      {error && (
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          Couldn't load bookings: {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center' }}>Loading from Notion…</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--off)' }}>
                {['Event', 'Client', 'Date', 'Venue', 'Guests', 'Service', 'Quote', 'Deposit', 'Balance', 'Cocktails', 'Staff'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 14px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No confirmed bookings in Notion yet</td></tr>
              ) : bookings.map(b => (
                <tr key={b.id}>
                  <Td><strong>{b.name}</strong></Td>
                  <Td muted>{b.clientName}</Td>
                  <Td>{fmtDate(b.eventDate)}</Td>
                  <Td muted>{b.venue}</Td>
                  <Td>{b.guestCount ?? '—'}</Td>
                  <Td muted>{b.typeOfService}</Td>
                  <Td>{gbp(b.finalQuoteAmount ?? b.quoteAmount)}</Td>
                  <Td>{check(b.depositReceived)}</Td>
                  <Td>{check(b.balanceReceived)}</Td>
                  <Td>{check(b.cocktailsConfirmed)}</Td>
                  <Td>{check(b.staffConfirmed)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

function Td({ children, muted }) {
  return <td style={{ padding: '10px 14px', fontSize: 13, borderBottom: '1px solid var(--off)', color: muted ? 'var(--muted)' : 'inherit' }}>{children}</td>;
}
function check(v) { return v ? <span style={{ color: 'var(--success)' }}>✓</span> : <span style={{ color: 'var(--mid)' }}>—</span>; }
function fmtDate(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }
function gbp(n) { return '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
