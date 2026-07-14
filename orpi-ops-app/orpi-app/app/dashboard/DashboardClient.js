'use client';
import { useEffect, useState } from 'react';
import AppShell from '../AppShell';

// ORPI KPI Dashboard.
//
// Rules of the road:
//   - Marketing/promo events are excluded from every commercial average.
//   - Historical CPH only counts events flagged Status = "Completed", so a
//     confirmed-but-not-yet-happened event never distorts averages.
//   - Alcohol CPH uses only stock-linked cost lines (real reconciled cost);
//     Operational CPH uses only non-stock-linked lines (staff/logistics/
//     equipment/etc). This mirrors how the Notion dashboard is set up.
//   - Averages are only shown when there's a real sample — we render "—"
//     when there aren't enough completed events to be meaningful.

const MIN_SAMPLE_FOR_AVERAGE = 1;

export default function DashboardClient({ userEmail }) {
  const [data, setData] = useState({ enquiries: [], bookings: [], costs: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/kpi').then(r => r.json()).then(res => {
      if (res.error) setError(res.error);
      else setData({ enquiries: res.enquiries || [], bookings: res.bookings || [], costs: res.costs || [] });
      setLoading(false);
    });
  }, []);

  const { enquiries, bookings, costs } = data;

  if (loading) {
    return (
      <AppShell active="/dashboard" userEmail={userEmail}>
        <PageHead />
        <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center' }}>Loading live data from Notion…</div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell active="/dashboard" userEmail={userEmail}>
        <PageHead />
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
          Couldn't load live data: {error}
        </div>
      </AppShell>
    );
  }

  // ─── Segment bookings ─────────────────────────────────────────
  const commercialBookings = bookings.filter(b => !b.marketingEvent);
  const confirmed = commercialBookings.filter(b => b.status === 'Confirmed Booking');
  const completed = commercialBookings.filter(b => b.status === 'Completed');

  // ─── Pipeline / top-of-funnel ────────────────────────────────
  const newEnq = enquiries.filter(e => e.status === 'New').length;
  const contactedEnq = enquiries.filter(e => e.status === 'Contacted').length;
  const quotedEnq = enquiries.filter(e => e.status === 'Quote Sent').length;
  const wonCount = enquiries.filter(e => e.status === 'Won').length;
  const lostCount = enquiries.filter(e => e.status === 'Lost').length;
  const closedTotal = wonCount + lostCount;
  const conversionRate = closedTotal > 0 ? Math.round((wonCount / closedTotal) * 100) : null;

  const today = new Date().toISOString().split('T')[0];
  const overdueFollowUps = enquiries.filter(e =>
    e.followUpDate && e.followUpDate < today && !['Won', 'Lost'].includes(e.status)
  );

  // ─── Forward-looking (confirmed) ──────────────────────────────
  const forwardRevenue = confirmed.reduce((s, b) => s + (b.finalQuoteAmount ?? b.quoteAmount ?? 0), 0);
  const sortedUpcoming = [...confirmed].sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
  const next = sortedUpcoming.find(b => b.eventDate && new Date(b.eventDate) >= new Date());
  const daysNext = next ? Math.ceil((new Date(next.eventDate) - new Date()) / 86400000) : null;

  // ─── Historical (completed) — CPH by alcohol provider ─────────
  const costByBooking = groupCostsByBooking(costs);
  const orpiEvents = completed.filter(b => b.alcoholProvidedBy === 'ORPI');
  const clientEvents = completed.filter(b => b.alcoholProvidedBy && b.alcoholProvidedBy !== 'ORPI');

  const orpiCph = computeCph(orpiEvents, costByBooking);
  const clientCph = computeCph(clientEvents, costByBooking);

  // ─── Revenue by event type (completed + confirmed) ────────────
  const byType = {};
  commercialBookings.forEach(b => {
    const t = b.eventType || 'Unspecified';
    const rev = b.finalQuoteAmount ?? b.quoteAmount ?? 0;
    if (!byType[t]) byType[t] = { revenue: 0, count: 0 };
    byType[t].revenue += rev;
    byType[t].count += 1;
  });
  const typeEntries = Object.entries(byType).sort((a, b) => b[1].revenue - a[1].revenue);

  // ─── Top row headline stats ───────────────────────────────────
  return (
    <AppShell active="/dashboard" userEmail={userEmail}>
      <PageHead />

      {overdueFollowUps.length > 0 && (
        <div style={{ background: '#fef6e4', color: '#b8720a', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          ⚠ {overdueFollowUps.length} overdue follow-up{overdueFollowUps.length > 1 ? 's' : ''}: {overdueFollowUps.slice(0, 4).map(e => e.name).join(', ')}{overdueFollowUps.length > 4 ? '…' : ''}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <Stat label="Confirmed events" value={confirmed.length} sub={completed.length > 0 ? `${completed.length} completed to date` : null} />
        <Stat label="Next event" value={daysNext != null ? `${daysNext} days` : '—'} sub={next?.name} />
        <Stat label="Forward revenue" value={gbp(forwardRevenue)} sub="from confirmed events" />
        <Stat label="Pipeline" value={newEnq + contactedEnq + quotedEnq} sub={`${newEnq} new · ${quotedEnq} quoted`} />
      </div>

      {/* Historical performance */}
      <SectionHead>Historical performance</SectionHead>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        From {completed.length} completed event{completed.length === 1 ? '' : 's'}. Marketing/promo events excluded.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <ProviderCard title="🟠 ORPI provides alcohol" cph={orpiCph} events={orpiEvents.length} />
        <ProviderCard title="🟢 Client provides alcohol" cph={clientCph} events={clientEvents.length} />
      </div>

      {/* Sales funnel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div>
          <SectionHead>Sales funnel</SectionHead>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 20px' }}>
            {[
              ['New', newEnq], ['Contacted', contactedEnq], ['Quote sent', quotedEnq],
              ['Won', wonCount], ['Lost', lostCount],
            ].map(([label, count]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--off)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>{label}</span>
                <span style={{ fontWeight: 500 }}>{count}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 8px', fontSize: 13, fontWeight: 600 }}>
              <span>Conversion rate</span>
              <span>{conversionRate == null ? '—' : `${conversionRate}%`}</span>
            </div>
          </div>
        </div>

        <div>
          <SectionHead>Revenue by event type</SectionHead>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 20px' }}>
            {typeEntries.length === 0 ? (
              <div style={{ padding: '14px 0', fontSize: 13, color: 'var(--muted)' }}>No commercial events yet</div>
            ) : typeEntries.map(([type, { revenue, count }]) => (
              <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--off)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>{type} <span style={{ fontSize: 11 }}>× {count}</span></span>
                <span style={{ fontWeight: 500 }}>{gbp(revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// Helpers

function PageHead() {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Dashboard</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>Live from Notion</p>
    </div>
  );
}

function SectionHead({ children }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, marginTop: 4 }}>{children}</div>
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

function ProviderCard({ title, cph, events }) {
  const hasData = events >= MIN_SAMPLE_FOR_AVERAGE;
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{title}</div>
      {!hasData ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>No completed events yet in this category.</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Based on {events} completed event{events === 1 ? '' : 's'}</div>
          <CphRow label="Alcohol CPH" value={cph.alcoholCph} sub="stock-linked costs only" />
          <CphRow label="Operational CPH" value={cph.opsCph} sub="staff, logistics, etc." />
          <CphRow label="Total CPH" value={cph.totalCph} bold />
          <div style={{ height: 1, background: 'var(--off)', margin: '10px 0' }} />
          <CphRow label="Avg revenue" value={cph.avgRevenue} muted />
          <CphRow label="Avg margin per event" value={cph.avgMargin} muted bold />
        </>
      )}
    </div>
  );
}

function CphRow({ label, value, sub, bold, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0' }}>
      <div>
        <div style={{ fontSize: 12, color: muted ? 'var(--muted)' : 'var(--text)', fontWeight: bold ? 600 : 400 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 13, fontWeight: bold ? 600 : 500 }}>{value ?? '—'}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Computation

function groupCostsByBooking(costs) {
  const map = new Map();
  costs.forEach(c => {
    if (!c.bookingId) return;
    if (!map.has(c.bookingId)) map.set(c.bookingId, { alcohol: 0, ops: 0 });
    const bucket = map.get(c.bookingId);
    const value = c.finalCost ?? c.cost ?? 0;
    if (c.isStockLinked) bucket.alcohol += value;
    else bucket.ops += value;
  });
  return map;
}

function computeCph(events, costByBooking) {
  if (!events.length) return null;
  let totalGuests = 0, totalAlcohol = 0, totalOps = 0, totalRev = 0;
  events.forEach(b => {
    const guests = b.guestCount || 0;
    const b2 = costByBooking.get(b.id) || { alcohol: 0, ops: 0 };
    totalGuests += guests;
    totalAlcohol += b2.alcohol;
    totalOps += b2.ops;
    totalRev += b.finalQuoteAmount ?? b.quoteAmount ?? 0;
  });
  const alcCph = totalGuests > 0 ? totalAlcohol / totalGuests : null;
  const opsCph = totalGuests > 0 ? totalOps / totalGuests : null;
  const totCph = totalGuests > 0 ? (totalAlcohol + totalOps) / totalGuests : null;
  return {
    alcoholCph: alcCph != null ? gbp(alcCph) : '—',
    opsCph: opsCph != null ? gbp(opsCph) : '—',
    totalCph: totCph != null ? gbp(totCph) : '—',
    avgRevenue: gbp(totalRev / events.length),
    avgMargin: gbp((totalRev - totalAlcohol - totalOps) / events.length),
  };
}

function gbp(n) { return '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
