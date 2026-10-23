'use client';
import { useEffect, useState } from 'react';

const KEY = 'orpi_cookie_choice';

export default function CookieReset() {
  const [choice, setChoice] = useState('');
  useEffect(() => { try { setChoice(localStorage.getItem(KEY) || ''); } catch { /* blocked */ } }, []);
  const set = v => {
    try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* blocked */ }
    if (v === 'no') {
      // Clear Meta's cookies if they were set by an earlier "Accept".
      const host = window.location.hostname;
      for (const name of ['_fbp', '_fbc']) {
        for (const domain of ['', host, `.${host.split('.').slice(-2).join('.')}`]) {
          document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
        }
      }
    }
    setChoice(v);
  };
  const label = choice === 'yes' ? 'You’ve accepted advertising cookies.' : choice === 'no' ? 'You’ve said no to advertising cookies.' : 'You haven’t made a choice yet.';
  const btn = { background: 'transparent', color: '#fff', border: '.5px solid rgba(255,255,255,.4)', padding: '9px 14px', font: 'inherit', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', marginRight: 10, marginTop: 8 };
  return (
    <div style={{ margin: '6px 0 14px' }}>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,.6)' }}>{label}</div>
      {choice !== 'no' && <button type="button" style={btn} onClick={() => set('no')}>Say no to advertising cookies</button>}
      {choice && <button type="button" style={btn} onClick={() => set('')}>Ask me again</button>}
    </div>
  );
}
