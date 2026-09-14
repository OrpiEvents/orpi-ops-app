'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseBrowser';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/enquiries', label: 'Enquiries' },
  { href: '/quotes', label: 'Quote builder' },
  { href: '/bookings', label: 'Confirmed bookings' },
  { href: '/runsheet', label: 'Event run sheet' },
  { href: '/stock', label: 'Stock tracker' },
  { href: '/stocktake', label: 'Stock take' },
  { href: '/purchases', label: 'Purchases' },
  { href: '/activity', label: 'Activity log' },
];

// The run sheet gets used on a phone, in a van, at a venue. A 230px fixed
// sidebar and a 1200px content column make that unusable, so below 900px the
// sidebar becomes a top bar with a drawer. Desktop is unchanged.
const MOBILE_AT = 900;

export default function AppShell({ active, userEmail, children, bleed = false }) {
  const router = useRouter();
  const [mobile, setMobile] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_AT}px)`);
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Never leave the drawer open behind a page the user has navigated to.
  useEffect(() => { setDrawer(false); }, [active]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const wordmark = (
    <>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 700, letterSpacing: '.16em', color: '#fff' }}>ORPI</div>
      <div style={{ fontSize: 10, color: '#555', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 2 }}>
        Events — Internal Ops
      </div>
    </>
  );

  const navLinks = (big = false) => NAV.map(item => (
    <a key={item.href} href={item.href} style={{
      display: 'block', padding: big ? '13px 22px' : '9px 20px', fontSize: big ? 15 : 13, textDecoration: 'none',
      color: active === item.href ? '#fff' : '#777',
      borderLeft: active === item.href ? '2px solid var(--gold)' : '2px solid transparent',
      background: active === item.href ? '#0f0f0f' : 'transparent',
    }}>{item.label}</a>
  ));

  const signOutBtn = (
    <button onClick={signOut} style={{
      background: 'none', border: '1px solid #333', color: '#999', fontSize: 12,
      padding: '6px 10px', borderRadius: 6, width: '100%',
    }}>Sign out</button>
  );

  if (mobile) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <header style={{
          position: 'sticky', top: 0, zIndex: 50, background: 'var(--black)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid #1f1f1f',
        }}>
          <div>{wordmark}</div>
          <button onClick={() => setDrawer(d => !d)} aria-label="Menu" style={{
            background: 'none', border: '1px solid #333', borderRadius: 6,
            color: '#ccc', fontSize: 18, lineHeight: 1, padding: '8px 12px',
          }}>{drawer ? '✕' : '☰'}</button>
        </header>

        {drawer && (
          <nav style={{
            position: 'fixed', top: 61, left: 0, right: 0, bottom: 0, zIndex: 49,
            background: 'var(--black)', overflowY: 'auto', paddingTop: 8,
          }}>
            {navLinks(true)}
            <div style={{ padding: '18px 22px', borderTop: '1px solid #1a1a1a', marginTop: 10 }}>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 8, wordBreak: 'break-all' }}>{userEmail}</div>
              {signOutBtn}
            </div>
          </nav>
        )}

        <main style={{ padding: bleed ? 0 : '18px 16px' }}>{children}</main>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 230, background: 'var(--black)', flexShrink: 0, position: 'fixed',
        top: 0, left: 0, height: '100vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid #1f1f1f' }}>{wordmark}</div>
        <nav style={{ padding: '10px 0', flex: 1, overflowY: 'auto' }}>{navLinks()}</nav>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 8, wordBreak: 'break-all' }}>{userEmail}</div>
          {signOutBtn}
        </div>
      </aside>
      <main style={{
        marginLeft: 230, flex: 1,
        padding: bleed ? 0 : '28px 32px',
        maxWidth: bleed ? 'none' : 1200,
      }}>
        {children}
      </main>
    </div>
  );
}
