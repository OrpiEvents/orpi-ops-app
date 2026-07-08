'use client';
import { useEffect, useState } from 'react';
import AppShell from '../AppShell';

export default function DashboardClient({ userEmail }) {
  const [enquiries, setEnquiries] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [eRes, bRes] = await Promise.all([
          fetch('/api/enquiries').then(r => r.json()),
          fetch('/api/bookings').then(r => r.json()),
        ]);
        if (eRes.error) throw new Error(`Enquiries: ${eRes.error}`);
        if (bRes.error) throw new Error(`Bookings: ${bRes.error}`);
        setEnquiries(eRes.enquiries || []);
        setBookings(bRes.bookings || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const newCount = enquiries.filter(e => e.status === 'New').length;
  const fwdRevenue = bookings.reduce((s, b) => s + (b.quoteAmount || 0), 0);
  const sorted = [...bookings].sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
  const next = sorted[0];
  const daysNext = next ? Math.ceil((new Date(next.eventDate) - new Date()) / 86400000) : null;

  // Revenue by event type — excludes marketing/promo events so they don't
  // distort the commercial picture.
  const byType = {};
  bookings.filter(b => !b.marketingEvent).forEach(b => {
    const t = b.eventType || 'Unspecified';
    byType[t] = (byType[t] || 0) + (b.quoteAmount || 0);
  });
  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]);

  return (
    <AppShell active="/dashboard" userEmail={userEmail}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Dashboard</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>Live from Notion</p>
      </div>

      {error && (
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          Couldn't load live data: {error}. Check NOTION_TOKEN and database IDs in your environment variables.
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center' }}>Loading from Notion…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Stat label="Confirmed events" value={bookings.length} />
          <Stat label="Next event" value={daysNext != null ? `${daysNext} days` : '—'} sub={next?.name} />
          <Stat label="Forward revenue" value={gbp(fwdRevenue)} />
          <Stat label="New enquiries" value={newCount} sub="need follow-up" />
        </div>
      )}

      {!loading && typeEntries.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Revenue by event type</div>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 20px', maxWidth: 480 }}>
            {typeEntries.map(([type, rev]) => (
              <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--off)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>{type}</span>
                <span style={{ fontWeight: 500 }}>{gbp(rev)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function gbp(n) { return '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
