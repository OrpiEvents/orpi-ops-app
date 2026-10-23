'use client';
// app/quotes/QuotePreview.jsx
//
// The printable client-facing document. Rendered in the internal builder's
// preview pane AND on the public /i/[token] sign-and-pay page, from the same
// quote state, so what the client signs is exactly what the builder showed.
// Pure presentation — all the numbers come in as props or from quoteModel.

import { buildInclusions, pkgShows, fmtDatePretty, fmtDateLong, gbp, addonName } from '@/lib/quoteModel';

// The "(client supplied)" tag shown next to a client-provided item on the quote.
function clientMark(item) {
  return (item && item.by === 'client')
    ? <span style={{ color: '#8a8880', fontStyle: 'italic', fontWeight: 400 }}> (client supplied)</span>
    : null;
}

export default function QuotePreview({ s, addonTotal, total, dep }) {
  const docLabels = { quote: 'Quotation', deposit: 'Deposit Invoice', balance: 'Balance Invoice' };
  const wdActive = s.wdItems.filter(i => i.on && i.text.trim());
  const inclusions = buildInclusions(s);
  const shows = pkgShows(s.pkg);
  const softActive = s.softItems.filter(i => i.on && i.text.trim());
  const compActive = s.compItems.filter(i => i.on && i.text.trim());
  const activeSpirits = s.spiritRows.filter(r => r.on).map(r => ({ cat: r.cat, items: r.items.filter(i => i.on && i.text.trim()) })).filter(r => r.items.length);
  const activeAddons = s.addons.filter(a => a.on && parseFloat(a.price) > 0);
  // Every ticked extra, named on the quote (price folded into the total, never
  // itemised) — so the headline figure has visible value behind it.
  const selectedAddons = s.addons.filter(a => a.on);
  // A chosen ORPI bar rides along in the package extras; the venue's own bar is
  // only an event-details note, so it never appears here.
  const barExtra = (s.barUsed && s.barUsed !== "Venue's own bar") ? [{ id: 'bar', label: s.barUsed, desc: '' }] : [];
  const packageExtras = [...barExtra, ...selectedAddons];

  if (!s.client && !s.venue) {
    return <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'center', padding: '60px 40px', color: 'var(--muted)', fontSize: 13 }}>Fill in the builder to preview the quote</div>;
  }

  const rowMuted = { color: '#8a8880', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', padding: '4px 0' };
  const rowValue = { color: '#1c1b18', fontSize: 12, padding: '4px 0' };
  const sectionHead = { fontSize: 10, letterSpacing: '.28em', textTransform: 'uppercase', color: '#0a0a0a', margin: '22px 0 12px', fontWeight: 500, borderBottom: '1px solid #e8e6e0', paddingBottom: 8 };
  const goldLabelSmall = { fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase', color: '#b8953a', marginBottom: 5, fontWeight: 500 };

  return (
    <div className="inv-preview-doc" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', fontFamily: 'var(--sans)' }}>
      {/* ── White header with brand + Ref number ── */}
      <div className="print-avoid-break" style={{ background: '#fff', color: '#0a0a0a', padding: '36px 44px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 30, borderBottom: '1px solid #e8e6e0' }}>
        <div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 30, letterSpacing: '.3em', fontWeight: 500, lineHeight: 1, color: '#0a0a0a' }}>ORPI</div>
          <div style={{ fontSize: 9.5, letterSpacing: '.38em', color: 'var(--gold)', marginTop: 6, fontWeight: 500 }}>MOBILE BAR &amp; EVENTS</div>
          <div style={{ marginTop: 22, fontSize: 10.5, color: '#555', lineHeight: 1.8, letterSpacing: '.02em' }}>
            Unit 5 Clements Court, Clements Lane, Ilford, IG1 2QY<br />
            Rudhra: +44 7424 505763 &nbsp;|&nbsp; Rahul: +44 7405 812971
          </div>
        </div>
        {s.invNum && (
          <div style={{ textAlign: 'right', fontSize: 9.5, letterSpacing: '.16em', color: '#8a8880', lineHeight: 1.8, textTransform: 'uppercase' }}>
            Reference<br />
            <strong style={{ color: '#0a0a0a', fontWeight: 500, letterSpacing: '.2em', fontSize: 12 }}>{s.invNum}</strong>
          </div>
        )}
      </div>
      {/* Gold band */}
      <div style={{ height: 2, background: 'var(--gold)' }} />

      {/* ── Doctype bar ── */}
      <div style={{ padding: '18px 44px', background: '#faf9f6', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #e8e6e0' }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 22, letterSpacing: '.04em', fontStyle: 'italic' }}>{docLabels[s.doctype]}</div>
        <div style={{ fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#666' }}>
          {s.date && <>Issued <strong style={{ color: '#0a0a0a', fontWeight: 500 }}>{fmtDatePretty(s.date)}</strong></>}
          {s.due && <> &nbsp;·&nbsp; {s.doctype === 'quote' ? 'Valid' : 'Due'} <strong style={{ color: '#0a0a0a', fontWeight: 500 }}>{fmtDatePretty(s.due)}</strong></>}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '28px 44px' }}>
        {/* Client + preparer row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, padding: '4px 0 22px', borderBottom: '1px solid #f0eee8' }}>
          <div>
            <div style={goldLabelSmall}>Prepared for</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 20, color: '#0a0a0a' }}>{s.client || '—'}</div>
          </div>
          <div>
            <div style={goldLabelSmall}>Prepared by</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 20, color: '#0a0a0a' }}>{s.salesPerson}</div>
          </div>
        </div>

        {/* Event details */}
        <div style={sectionHead}>Event details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '2px 20px' }}>
          <div style={rowMuted}>Event type</div><div style={rowValue}>{s.etype || '—'}</div>
          <div style={rowMuted}>Venue</div><div style={rowValue}>{s.venue || '—'}</div>
          <div style={rowMuted}>Date</div><div style={rowValue}>{s.edate ? fmtDateLong(s.edate) : '—'}</div>
          <div style={rowMuted}>Service time</div><div style={rowValue}>{s.etime || '—'}</div>
          <div style={rowMuted}>Guests</div><div style={rowValue}>{s.guests || '—'}</div>
          <div style={rowMuted}>Package</div><div style={rowValue}>{s.pkg}</div>
          <div style={rowMuted}>Duration</div><div style={rowValue}>{s.duration || '—'}</div>
          {s.barUsed === "Venue's own bar" && <><div style={rowMuted}>Bar</div><div style={rowValue}>{s.barUsed}</div></>}
          {s.setup && <><div style={rowMuted}>Setup access</div><div style={rowValue}>{s.setup}</div></>}
        </div>

        {/* Package summary — what this specific package includes. */}
        {s.pkg !== 'Custom' && (
          <div style={{ background: '#faf9f6', border: '1px solid #e8e6e0', borderLeft: '3px solid var(--gold)', padding: '14px 18px', borderRadius: '0 6px 6px 0', marginTop: 22 }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 500, marginBottom: 8, letterSpacing: '.02em' }}>
              The <em style={{ color: 'var(--gold)' }}>{s.pkg}</em> Package
            </div>
            <div style={{ fontSize: 12, color: '#333', lineHeight: 1.6 }}>
              {shows.cocktails && (s.nct > 0 || s.nmt > 0) && (
                <div><strong>{s.nct} cocktail{s.nct!==1?'s':''} &amp; {s.nmt} mocktail{s.nmt!==1?'s':''}</strong> — chosen from our menu at your tasting</div>
              )}
              {s.pkg === 'Premium' && (
                <div><strong>Open bar with a 2-hour cocktail &amp; mocktail service</strong> — house spirits, beer &amp; wine through the evening, plus bespoke drinks from your chosen menu</div>
              )}
              {s.pkg === 'Ultimate' && (
                <div><strong>Unlimited cocktail &amp; mocktail service all evening</strong> — no time limit on your bar</div>
              )}
              {s.pkg === 'Full Bar' && (
                <div><strong>Full open bar</strong> — house spirits, beers, wines and soft drinks throughout your event</div>
              )}
              {s.pkg === 'Cocktail Experience' && (
                <div><strong>Cocktail &amp; mocktail service</strong> — a curated menu for your event</div>
              )}
              {s.pkg === 'Welcome Drinks Only' && (
                <div><strong>Reception drinks service</strong> — welcome cocktails and mocktails on arrival</div>
              )}
              {s.pkg === 'Bar Only (client supplies alcohol)' && (
                <div><strong>Professional bar service</strong> — our team, bar and expertise; you supply the alcohol</div>
              )}
            </div>
          </div>
        )}
        {/* ── Included in your package ── */}
        {inclusions.length > 0 && (
          <div className="print-avoid-break" style={{ background: '#faf9f6', border: '1px solid #e8e6e0', borderRadius: 8, padding: '18px 22px', marginTop: 24 }}>
            <div style={{ fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 600, marginBottom: 12 }}>
              Included in your package
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2px 22px' }}>
              {inclusions.map((text, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '4px 0', fontSize: 11.5, color: '#333', lineHeight: 1.45 }}>
                  <span style={{ color: 'var(--gold)', fontSize: 11, lineHeight: 1.45, flexShrink: 0 }}>✓</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Added to your package ── */}
        {packageExtras.length > 0 && (
          <div className="print-avoid-break" style={{ background: '#faf9f6', border: '1px solid #e8e6e0', borderRadius: 8, padding: '18px 22px', marginTop: 24 }}>
            <div style={{ fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 600, marginBottom: 12 }}>
              Added to your package
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 22px' }}>
              {packageExtras.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '2px 0' }}>
                  <span style={{ color: 'var(--gold)', fontSize: 11, lineHeight: 1.45, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 11.5, color: '#333', lineHeight: 1.45 }}>
                    <span style={{ fontWeight: 500 }}>{addonName(a)}</span>
                    {a.desc ? <span style={{ color: '#8a8880' }}> — {a.desc}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Welcome drinks */}
        {shows.welcome && s.wdOn && wdActive.length > 0 && (
          <>
            <div style={sectionHead}>{s.wdDur} welcome drinks</div>
            <div style={{ fontSize: 12, color: '#333' }}>{wdActive.map((i, idx) => <span key={i.id}>{idx > 0 ? ' · ' : ''}{i.text}{clientMark(i)}</span>)}</div>
          </>
        )}

        {/* Spirits & alcohol */}
        {shows.alcohol && activeSpirits.length > 0 && (
          <>
            <div style={sectionHead}>Spirits &amp; alcohol</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {activeSpirits.map(row => (
                <div key={row.cat}>
                  <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gold)', marginBottom: 5 }}>{row.cat}</div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.85, color: '#333' }}>{row.items.map(i => <div key={i.id}>{i.text}{clientMark(i)}</div>)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Soft drinks */}
        {shows.softs && softActive.length > 0 && (
          <>
            <div style={sectionHead}>Soft drinks &amp; mixers</div>
            <div style={{ fontSize: 12, color: '#333' }}>{softActive.map((i, idx) => <span key={i.id}>{idx > 0 ? ' · ' : ''}{i.text}{clientMark(i)}</span>)}</div>
          </>
        )}

        {/* Cocktails & mocktails */}
        {shows.cocktails && (s.nct > 0 || s.nmt > 0) && (
          <>
            <div style={sectionHead}>Cocktails &amp; mocktails</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {s.nct > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gold)', marginBottom: 6 }}>Cocktails ×{s.nct}</div>
                  {s.cocktailNames.slice(0, s.nct).map((n, i) => <div key={i} style={{ fontSize: 12, padding: '2px 0', color: '#333' }}>{i + 1}. {n || 'TBC'}</div>)}
                </div>
              )}
              {s.nmt > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gold)', marginBottom: 6 }}>Mocktails ×{s.nmt}</div>
                  {s.mocktailNames.slice(0, s.nmt).map((n, i) => <div key={i} style={{ fontSize: 12, padding: '2px 0', color: '#333' }}>{i + 1}. {n || 'TBC'}</div>)}
                </div>
              )}
            </div>
          </>
        )}

        {/* Add-ons are folded into the package total — not itemised on the client quote */}

        {/* Complimentary */}
        {compActive.length > 0 && (
          <>
            <div style={sectionHead}>Complimentary</div>
            <div style={{ fontSize: 12, color: '#333' }}>{compActive.map(i => i.text).join(' · ')}</div>
          </>
        )}

        {/* Notes */}
        {s.notes && (
          <div style={{ background: 'var(--gold-bg)', borderLeft: '3px solid var(--gold)', padding: '10px 14px', fontSize: 12, borderRadius: '0 4px 4px 0', marginTop: 18, color: '#555' }}>{s.notes}</div>
        )}
      </div>

      {/* ── Pricing block ──
          No bank details and no terms on the quote itself: the client gets both
          on their booking link (/i/[token]), where the payment details only show
          once they've read and accepted the full T&Cs. */}
      <div className="print-avoid-break" style={{ background: '#faf9f6', color: '#1c1b18', padding: '26px 44px', borderTop: '1px solid #e8e6e0' }}>
        {parseFloat(s.disc) > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: '#666' }}>
              <span>Package total</span><span>{gbp((parseFloat(s.base) || 0) + addonTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: '#666' }}>
              <span>Discount</span><span>−{gbp(parseFloat(s.disc))}</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 14, marginTop: 10, borderTop: '1px solid #d9d5c8', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 500 }}>
            {s.doctype === 'quote' ? 'Total' : s.doctype === 'deposit' ? 'Deposit due (50%)' : 'Balance due'}
          </span>
          <span style={{ fontFamily: 'var(--serif)', fontSize: 32, color: '#0a0a0a', fontWeight: 500 }}>
            {gbp(s.doctype === 'quote' ? total : dep)}
          </span>
        </div>
        {s.doctype === 'quote' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11, color: '#555', marginTop: 10 }}>
              <span>50% deposit on confirmation</span><span>{gbp(dep)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11, color: '#555' }}>
              <span>Balance due 14 days before</span><span>{gbp(dep)}</span>
            </div>
          </>
        )}
      </div>

      {/* ── Enhancements you might like (unselected add-ons) ── */}
      {(() => {
        const unselectedAddons = s.addons.filter(a => !a.on);
        if (unselectedAddons.length === 0) return null;
        return (
          <div className="print-avoid-break" style={{ padding: '20px 44px', background: '#fff', borderTop: '1px solid #e8e6e0' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 500, marginBottom: 4, letterSpacing: '.02em', fontStyle: 'italic', color: '#0a0a0a' }}>
              Enhancements you might like
            </div>
            <div style={{ fontSize: 10.5, color: '#8a8880', marginBottom: 14, fontStyle: 'italic' }}>
              Not included in this quote — let us know if you'd like to add any.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
              {unselectedAddons.map(a => (
                <div key={a.id} style={{ opacity: 0.72, borderLeft: '1px solid #e8e6e0', paddingLeft: 12, minHeight: 34 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 500, color: '#333' }}>{a.label}</div>
                  {a.desc && <div style={{ fontSize: 10, color: '#8a8880', marginTop: 2, lineHeight: 1.45 }}>{a.desc}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Footer ── */}
      <div style={{ padding: '16px 44px', background: '#faf9f6', borderTop: '1px solid #e8e6e0', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8a8880', textAlign: 'center' }}>
        hello@orpi.events &nbsp;·&nbsp; @orpi.events &nbsp;·&nbsp; orpi.events
      </div>
    </div>
  );
}
