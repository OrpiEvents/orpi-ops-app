'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabaseBrowser';

// Where an invite or password link lands. Verifies the one-time token, then
// the person chooses their own password. Also works for a signed-in person
// who just wants to change theirs.
const ALLOWED = ['invite', 'recovery', 'magiclink', 'signup'];

export default function WelcomePage() {
  const [stage, setStage] = useState('checking');   // checking | password | expired | done
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const q = new URLSearchParams(window.location.search);
    const tokenHash = q.get('token_hash');
    const type = ALLOWED.includes(q.get('type')) ? q.get('type') : 'recovery';
    (async () => {
      if (tokenHash) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        // Don't leave a used token sitting in the address bar.
        window.history.replaceState(null, '', '/welcome');
        if (error || !data?.user) return setStage('expired');
        setEmail(data.user.email || '');
        return setStage('password');
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) { setEmail(user.email || ''); setStage('password'); } else setStage('expired');
    })();
  }, []);

  async function save(e) {
    e.preventDefault();
    setError('');
    if (pw.length < 10) return setError('Use at least 10 characters.');
    if (pw !== pw2) return setError('The two passwords don’t match.');
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(error.message);
    setStage('done');
    setTimeout(() => { window.location.href = '/'; }, 900);
  }

  const box = { background: '#111', border: '1px solid #222', borderRadius: 12, padding: 28 };
  const input = { width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #333', background: '#0a0a0a', color: '#fff', fontSize: 13, marginBottom: 14 };
  const label = { display: 'block', fontSize: 11, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--black)', padding: 16 }}>
      <div style={{ width: 380, maxWidth: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 32, fontWeight: 700, letterSpacing: '.16em', color: '#fff' }}>ORPI</div>
          <div style={{ fontSize: 11, color: '#666', letterSpacing: '.1em', textTransform: 'uppercase', marginTop: 4 }}>Events — Ops</div>
        </div>
        {stage === 'checking' && <div style={{ ...box, color: '#999', textAlign: 'center' }}>Checking your link…</div>}
        {stage === 'expired' && (
          <div style={{ ...box, color: '#ccc', fontSize: 13.5, lineHeight: 1.6 }}>
            This link has expired or has already been used. Links work once and only for about an hour.
            <div style={{ marginTop: 10, color: '#888' }}>Ask Ruds to send a new one from the Team page.</div>
            <a href="/login" style={{ display: 'inline-block', marginTop: 16, color: 'var(--gold)', fontSize: 13 }}>Go to sign in →</a>
          </div>
        )}
        {stage === 'password' && (
          <form onSubmit={save} style={box}>
            <div style={{ color: '#fff', fontSize: 15, marginBottom: 4 }}>Choose your password</div>
            <div style={{ color: '#777', fontSize: 12.5, marginBottom: 18 }}>{email}</div>
            <label style={label}>New password</label>
            <input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} style={input} />
            <label style={label}>Same again</label>
            <input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} style={input} />
            {error && <div style={{ background: '#2a1614', color: '#e0897d', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 14 }}>{error}</div>}
            <button disabled={busy} style={{ width: '100%', padding: 11, borderRadius: 6, border: 'none', background: 'var(--gold)', color: '#fff', fontWeight: 500, fontSize: 13, opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Saving…' : 'Save and sign in'}
            </button>
          </form>
        )}
        {stage === 'done' && <div style={{ ...box, color: '#cde8d6', textAlign: 'center' }}>Password saved. Taking you in…</div>}
      </div>
    </div>
  );
}
