'use client';
import AppShell from '../../../AppShell';

const STANDARD_CHECKLIST = {
  'Admin & Booking': [
    'Deposit received', 'Balance received', 'Final guest count confirmed',
    'Cocktail & mocktail selection signed off by client', 'Drinks tasting scheduled & completed',
    'Venue contact and access time confirmed', 'Internal notes reviewed by whole team',
  ],
  'Staffing & Logistics': [
    'Staff count confirmed', 'Lead bartender assigned', 'Staff briefed on run of show & drink specs',
    'Staff travel / arrival time confirmed', 'Uniform / dress code confirmed', 'Transport to venue booked',
  ],
  'Bar Kit & Stock': [
    'All spirits for menu ordered/packed', 'All soft drinks & mixers packed', 'Garnishes packed',
    'Ice supply confirmed', 'Glassware confirmed (venue or ORPI backup)', 'Boston shakers, strainers, jiggers packed',
    'Bar mats, spill trays, waste bags packed', 'Dry ice / smoke gun / extras tested if included',
  ],
  'Event Day': [
    'Arrived on time, venue access confirmed', 'Bar set up and dressed', 'Glassware checked and racked',
    'Back bar laid out', 'Soft drinks chilled and stocked', 'Bar menus displayed', 'Mid-event stock check',
    'Bar closed on time', 'All equipment packed and venue left clean', 'Leftover stock counted',
    'Client / planner sign-off obtained', 'Post-event debrief notes filed',
  ],
};

export default function ChecklistClient({ userEmail, booking, costs, cocktails, mocktails, error }) {
  if (error || !booking) {
    return (
      <AppShell active="/bookings" userEmail={userEmail}>
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '14px 18px', borderRadius: 8 }}>
          Couldn't load this booking: {error || 'not found'}
        </div>
      </AppShell>
    );
  }

  const flags = buildFlags(booking, cocktails, mocktails);
  const totalCost = costs.reduce((s, c) => s + (c.finalCost ?? c.cost ?? 0), 0);
  const staffNeeded = (booking.guestCount || 0) > 150 ? '6+' : '4+';

  return (
    <AppShell active="/bookings" userEmail={userEmail}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Event checklist</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>{booking.name}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={`/bookings`} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', fontSize: 13, textDecoration: 'none', color: 'var(--text)' }}>← Back</a>
          <button onClick={() => window.print()} style={{ background: 'var(--black)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13 }}>🖨 Print checklist</button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxWidth: 820 }}>
        {/* Header */}
        <div style={{ background: 'var(--black)', padding: '22px 32px' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 700, letterSpacing: '.16em', color: '#fff' }}>ORPI</div>
          <div style={{ fontSize: 11, letterSpacing: '.14em', color: '#888', marginTop: 2, textTransform: 'uppercase' }}>Event Brief &amp; Checklist</div>
          <div style={{ fontSize: 13, color: '#ccc', marginTop: 10 }}>
            {booking.name} &nbsp;|&nbsp; {booking.venue || 'Venue TBC'} &nbsp;|&nbsp; {fmtDateLong(booking.eventDate)} &nbsp;|&nbsp; {booking.guestCount || '?'} guests
          </div>
        </div>
        <div style={{ height: 3, background: 'var(--gold)' }} />

        <div style={{ padding: '20px 32px' }}>
          {/* Flags */}
          {flags.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              {flags.map((f, i) => (
                <div key={i} style={{ background: 'var(--gold-bg)', borderLeft: '3px solid var(--gold)', padding: '8px 14px', fontSize: 13, marginBottom: 6, borderRadius: '0 4px 4px 0' }}>⚠️ {f}</div>
              ))}
            </div>
          )}

          {/* Event overview */}
          <SectionHead icon="📋">Event overview</SectionHead>
          <Grid>
            <GridRow label="Venue" value={booking.venue} />
            <GridRow label="Event date" value={fmtDateLong(booking.eventDate)} />
            <GridRow label="Guest count" value={booking.guestCount} />
            <GridRow label="Service" value={booking.typeOfService} />
            <GridRow label="Alcohol provided by" value={booking.alcoholProvidedBy} />
            <GridRow label="Staff required" value={`Minimum ${staffNeeded} ORPI staff`} />
            <GridRow label="Quote value" value={gbp(booking.finalQuoteAmount ?? booking.quoteAmount)} />
            <GridRow label="Deposit / Balance" value={`${booking.depositReceived ? '✓' : '✗'} deposit, ${booking.balanceReceived ? '✓' : '✗'} balance`} />
            <GridRow label="Client" value={booking.clientName} />
            <GridRow label="Client contact" value={[booking.clientPhone, booking.clientEmail].filter(Boolean).join(' · ')} />
            {booking.referredBy && <GridRow label="Referred by" value={booking.referredBy} />}
            {booking.drinksTastingDate && <GridRow label="Drinks tasting" value={fmtDateLong(booking.drinksTastingDate)} />}
          </Grid>

          {/* Drinks menu */}
          {(cocktails.length > 0 || mocktails.length > 0) && (
            <>
              <SectionHead icon="🍹">Drinks menu &amp; recipes</SectionHead>
              {cocktails.length > 0 && <DrinkGroup title={`Cocktails (${cocktails.length})`} drinks={cocktails} />}
              {mocktails.length > 0 && <DrinkGroup title={`Mocktails (${mocktails.length})`} drinks={mocktails} />}
            </>
          )}

          {/* Notes */}
          {(booking.internalNotes || booking.tastingNotes) && (
            <>
              <SectionHead icon="📝">Notes</SectionHead>
              {booking.tastingNotes && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 4 }}>Tasting notes</div>
                  <div style={{ fontSize: 13, background: 'var(--off)', padding: '10px 14px', borderRadius: 6, whiteSpace: 'pre-wrap' }}>{booking.tastingNotes}</div>
                </div>
              )}
              {booking.internalNotes && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 4 }}>Internal notes</div>
                  <div style={{ fontSize: 13, background: 'var(--off)', padding: '10px 14px', borderRadius: 6, whiteSpace: 'pre-wrap' }}>{booking.internalNotes}</div>
                </div>
              )}
            </>
          )}

          {/* Costs on file */}
          {costs.length > 0 && (
            <>
              <SectionHead icon="💷">Costs on file</SectionHead>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                <tbody>
                  {costs.map(c => (
                    <tr key={c.id}>
                      <td style={{ padding: '4px 0', fontSize: 12 }}>{c.name}</td>
                      <td style={{ padding: '4px 0', fontSize: 11, color: 'var(--muted)' }}>{c.costType}</td>
                      <td style={{ padding: '4px 0', fontSize: 12, textAlign: 'right' }}>{gbp(c.finalCost ?? c.cost)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 0', fontSize: 13, fontWeight: 600 }} colSpan={2}>Total</td>
                    <td style={{ padding: '6px 0', fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{gbp(totalCost)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* Standard checklist */}
          <SectionHead icon="✅">Pre-event &amp; day-of checklist</SectionHead>
          {Object.entries(STANDARD_CHECKLIST).map(([section, checkItems]) => (
            <div key={section} style={{ marginBottom: 14, breakInside: 'avoid' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{section}</div>
              {checkItems.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12.5, borderBottom: '1px solid var(--off)' }}>
                  <span style={{ width: 14, height: 14, border: '1.5px solid var(--muted)', borderRadius: 3, flexShrink: 0, display: 'inline-block' }} />
                  {item}
                </div>
              ))}
            </div>
          ))}

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
            ORPI Events LTD &nbsp;|&nbsp; Unit 5 Clements Court, Clements Lane, Ilford, IG1 2QY &nbsp;|&nbsp; Hello@Orpi.Events
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function buildFlags(booking, cocktails, mocktails) {
  const flags = [];
  if (!booking.depositReceived) flags.push('Deposit not yet received');
  if (!booking.balanceReceived) flags.push('Balance not yet received');
  if (!booking.cocktailsConfirmed && cocktails.length) flags.push('Cocktail menu not yet confirmed with client');
  if (!booking.mocktailsConfirmed && mocktails.length) flags.push('Mocktail menu not yet confirmed with client');
  if (!booking.staffConfirmed) flags.push('Staff not yet confirmed');
  if (!booking.venueAccessConfirmed) flags.push('Venue access & setup time not yet confirmed');
  if (!booking.drinksTastingDate) flags.push('Drinks tasting not yet scheduled');
  [...cocktails, ...mocktails].forEach(d => {
    if (!d.isTbc && !d.found) flags.push(`"${d.name}" not found in ORPI Drinks Library — add recipe or confirm spelling`);
  });
  return flags;
}

function SectionHead({ icon, children }) {
  return (
    <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 10px', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
      <span>{icon}</span>{children}
    </div>
  );
}
function Grid({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 2, marginBottom: 8 }}>{children}</div>; }
function GridRow({ label, value }) {
  return (<><div style={{ fontSize: 11, color: 'var(--muted)', padding: '3px 0' }}>{label}</div><div style={{ fontSize: 12, padding: '3px 0' }}>{value || '—'}</div></>);
}

function DrinkGroup({ title, drinks }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>{title}</div>
      {drinks.map((d, i) => <DrinkCard key={i} drink={d} />)}
    </div>
  );
}

function DrinkCard({ drink }) {
  if (drink.isTbc) return null;
  if (!drink.found) {
    return (
      <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
        <strong>{drink.name}</strong> — not found in ORPI Drinks Library. Confirm recipe with the team before the event.
      </div>
    );
  }
  const d = drink.drink;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '12px 16px', marginBottom: 8, breakInside: 'avoid' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{drink.name}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          {[d.method, d.glassware, d.ice ? `${d.ice} ice` : null].filter(Boolean).join(' · ')}
        </div>
      </div>
      {drink.ingredients?.length > 0 && (
        <div style={{ fontSize: 12, marginBottom: 6 }}>
          {drink.ingredients.map((ing, i) => <div key={i}>• {ing}</div>)}
        </div>
      )}
      {drink.methodText && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{drink.methodText}</div>}
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
        {d.garnish && <>Garnish: {d.garnish}{d.rim ? ' · ' : ''}</>}
        {d.rim && <>Rim: {d.rim}</>}
        {d.batchable && <span style={{ marginLeft: 8 }}>· Batchable</span>}
        {d.prepRequired && <span style={{ marginLeft: 8 }}>· Prep required</span>}
      </div>
    </div>
  );
}

function fmtDateLong(d) { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } }
function gbp(n) { return '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
