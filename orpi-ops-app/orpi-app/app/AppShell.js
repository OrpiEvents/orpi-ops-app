'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseBrowser';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/enquiries', label: 'Enquiries' },
  { href: '/quotes', label: 'Quote builder' },
  { href: '/bookings', label: 'Confirmed bookings' },
  { href: '/stock', label: 'Stock tracker' },
  { href: '/stocktake', label: 'Stock take' },
  { href: '/purchases', label: 'Purchases' },
  { href: '/activity', label: 'Activity log' },
];

export default function AppShell({ active, userEmail, children }) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 230, background: 'var(--black)', flexShrink: 0, position: 'fixed',
        top: 0, left: 0, height: '100vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid #1f1f1f' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 700, letterSpacing: '.16em', color: '#fff' }}>ORPI</div>
          <div style={{ fontSize: 10, color: '#555', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 2 }}>
            Events — Internal Ops
          </div>
        </div>
        <nav style={{ padding: '10px 0', flex: 1 }}>
          {NAV.map(item => (
            <a key={item.href} href={item.href} style={{
              display: 'block', padding: '9px 20px', fontSize: 13, textDecoration: 'none',
              color: active === item.href ? '#fff' : '#777',
              borderLeft: active === item.href ? '2px solid var(--gold)' : '2px solid transparent',
              background: active === item.href ? '#0f0f0f' : 'transparent',
            }}>{item.label}</a>
          ))}
        </nav>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 8, wordBreak: 'break-all' }}>{userEmail}</div>
          <button onClick={signOut} style={{
            background: 'none', border: '1px solid #333', color: '#999', fontSize: 12,
            padding: '6px 10px', borderRadius: 6, width: '100%',
          }}>Sign out</button>
        </div>
      </aside>
      <main style={{ marginLeft: 230, flex: 1, padding: '28px 32px', maxWidth: 1200 }}>
        {children}
      </main>
    </div>
  );
}
