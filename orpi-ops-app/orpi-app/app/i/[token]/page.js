// Public, unauthenticated: the client's final deposit invoice. They read the
// invoice + full Terms, type their name to accept, and then get the deposit
// payment details. Reached only via the unguessable token link ORPI sends.
import { getInvoice, publicView } from '@/lib/invoices';
import { fmtDatePretty } from '@/lib/quoteModel';
import QuotePreview from '../../quotes/QuotePreview';
import SignAccept from './SignAccept';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'ORPI Events — Your booking',
  robots: { index: false, follow: false },
};

function Shell({ children }) {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--off)' }}>
      <div style={{ maxWidth: 840, margin: '0 auto', padding: '24px 16px 72px' }}>{children}</div>
    </main>
  );
}

function Notice({ children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '48px 32px', textAlign: 'center', marginTop: 40 }}>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 26, letterSpacing: '.25em', color: '#0a0a0a' }}>ORPI</div>
      <div style={{ fontSize: 9.5, letterSpacing: '.38em', color: 'var(--gold)', marginTop: 6, fontWeight: 500 }}>MOBILE BAR &amp; EVENTS</div>
      <p style={{ marginTop: 24, color: 'var(--muted)', fontSize: 14, lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}

export default async function InvoicePage({ params }) {
  let record = null;
  try { record = await getInvoice(params.token); } catch { record = null; }
  const inv = publicView(record);

  if (!inv) {
    return <Shell><Notice>This booking link isn&rsquo;t valid. Please check the link, or contact us at <strong>hello@orpi.events</strong>.</Notice></Shell>;
  }
  if (inv.status === 'revoked') {
    return <Shell><Notice>This booking link has been replaced by a newer version. Please use the most recent link we sent you, or contact us at <strong>hello@orpi.events</strong>.</Notice></Shell>;
  }
  if (inv.status === 'expired') {
    return <Shell><Notice>This booking link has expired. Please contact us at <strong>hello@orpi.events</strong> and we&rsquo;ll send an up-to-date one.</Notice></Shell>;
  }

  const s = inv.snapshot.s;
  const surname = (inv.client || '').trim();
  const eventRef = `${surname || 'Your surname'}${s.edate ? ' + ' + fmtDatePretty(s.edate) : ' + event date'}`;

  return (
    <Shell>
      <QuotePreview s={s} addonTotal={inv.snapshot.addonTotal} total={inv.snapshot.total} dep={inv.snapshot.dep} />
      <SignAccept
        token={inv.token}
        dep={inv.snapshot.dep}
        eventRef={eventRef}
        agreement={inv.agreement}
      />
    </Shell>
  );
}
