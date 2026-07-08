'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseBrowser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
    router.push('/dashboard');
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
          Accounts are created by an admin in Supabase — contact Ruds if you need one.
        </div>
      </div>
    </div>
  );
}
