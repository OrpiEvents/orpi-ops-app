'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseBrowser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [noAccess, setNoAccess] = useState(false);
  const router = useRouter();

  // Read ?e=noaccess without useSearchParams (which would need a Suspense
  // boundary for this static page).
  useEffect(() => {
    setNoAccess(new URLSearchParams(window.location.search).get('e') === 'noaccess');
  }, []);

  async function signOut() {
    await createClient().auth.signOut();
    setNoAccess(false);
    window.history.replaceState(null, '', '/login');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Incorrect email or password.'
        : error.message);
      return;
    }
    // "/" sends each role to its own home (directors → Dashboard,
    // marketing → Growth).
    router.push('/');
    router.refresh();
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--black)',
    }}>
      <div style={{ width: 360, maxWidth: '90vw' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            fontFamily: 'var(--serif)', fontSize: 32, fontWeight: 700,
            letterSpacing: '.16em', color: '#fff',
          }}>ORPI</div>
          <div style={{ fontSize: 11, color: '#666', letterSpacing: '.1em', textTransform: 'uppercase', marginTop: 4 }}>
            Events — Internal Ops
          </div>
        </div>
        {noAccess && (
          <div style={{
            background: '#2a1614', color: '#e0897d', padding: '12px 14px', borderRadius: 8,
            fontSize: 12.5, marginBottom: 16, lineHeight: 1.5,
          }}>
            This login doesn’t have access to the ops app. Ask Ruds to set your role on the Team page.
            <button onClick={signOut} style={{
              display: 'block', marginTop: 10, background: 'none', border: '1px solid #553', color: '#e0b9ad',
              fontSize: 12, padding: '5px 10px', borderRadius: 6,
            }}>Sign out</button>
          </div>
        )}
        <form onSubmit={handleSubmit} style={{
          background: '#111', border: '1px solid #222', borderRadius: 12, padding: 28,
        }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Email
            </label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #333',
                background: '#0a0a0a', color: '#fff', fontSize: 13,
              }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Password
            </label>
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #333',
                background: '#0a0a0a', color: '#fff', fontSize: 13,
              }}
            />
          </div>
          {error && (
            <div style={{
              background: '#2a1614', color: '#e0897d', padding: '8px 12px', borderRadius: 6,
              fontSize: 12, marginBottom: 16,
            }}>{error}</div>
          )}
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '11px', borderRadius: 6, border: 'none',
            background: 'var(--gold)', color: '#fff', fontWeight: 500, fontSize: 13,
            opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#444', marginTop: 16 }}>
          New here, or forgotten your password? Ask Ruds to send you a link from the Team page.
        </div>
      </div>
    </div>
  );
}
