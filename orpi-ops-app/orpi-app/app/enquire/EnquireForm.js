'use client';
import { useEffect, useRef, useState } from 'react';
import { HEARD_OPTIONS, EVENT_TYPES, SERVICE_TYPES } from '@/lib/tracking';

// Matches the website: black, white, Cormorant Garamond + Outfit, underlined
// fields. Mobile first — most visitors arrive from Instagram on a phone.

const CONSENT_KEY = 'orpi_cookie_choice';
const WHATSAPP = 'https://wa.me/447424505763?text=Hi%20ORPI%20Events%2C%20I%27d%20like%20to%20enquire%20about%20your%20mobile%20bar%20services.';
const THANK_WHO = { referral: 'Who recommended us?', previous: 'Which event did we do for you?', venue: 'Which venue?', planner: 'Which planner?', event: 'Which event did you see us at?' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function readConsent() { try { return localStorage.getItem(CONSENT_KEY) || ''; } catch { return ''; } }
function writeConsent(v) { try { localStorage.setItem(CONSENT_KEY, v); } catch { /* private mode */ } }
function cookie(name) {
  try { return document.cookie.split('; ').find(c => c.startsWith(`${name}=`))?.split('=')[1] || ''; } catch { return ''; }
}
function loadPixel(pixelId) {
  if (!pixelId || typeof window === 'undefined' || window.fbq) return;
  /* eslint-disable */
  !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s) }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  window.fbq('init', pixelId);
  window.fbq('track', 'PageView');
}
function beacon(body) {
  try {
    const blob = new Blob([JSON.stringify(body)], { type: 'text/plain' });
    if (!navigator.sendBeacon?.('/api/public/event', blob)) fetch('/api/public/event', { method: 'POST', body: JSON.stringify(body), keepalive: true });
  } catch { /* counts are best-effort */ }
}
const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export default function EnquireForm({ attribution, pixelId }) {
  const [f, setF] = useState({
    name: '', email: '', phone: '', eventDate: '', noDate: false, month: '', year: '',
    eventType: '', guests: '', venue: '', services: [], heard: '', referredBy: '', notes: '', optOut: false, company: '',
  });
  const [state, setState] = useState({ status: 'idle', error: '', first: '' });
  const [consent, setConsent] = useState('pending');
  const started = useRef(false);
  const shownAt = useRef(Date.now());
  const attr = useRef(attribution);
  const today = new Date().toISOString().slice(0, 10);
  const thisYear = new Date().getFullYear();

  useEffect(() => {
    const c = readConsent();
    setConsent(c || 'ask');
    if (c === 'yes') loadPixel(pixelId);
    attr.current = { ...attribution, landing: window.location.href.slice(0, 500), referrer: document.referrer || '' };
    beacon({ kind: 'form_view', page: 'enquire', attribution: attr.current });
  }, [attribution, pixelId]);

  const set = (k, v) => {
    if (!started.current) { started.current = true; beacon({ kind: 'form_start', page: 'enquire', attribution: attr.current }); }
    setF(p => ({ ...p, [k]: v }));
  };
  const toggleService = s => set('services', f.services.includes(s) ? f.services.filter(x => x !== s) : [...f.services, s]);
  const choose = v => { writeConsent(v); setConsent(v); if (v === 'yes') loadPixel(pixelId); };

  async function submit(e) {
    e.preventDefault();
    if (state.status === 'sending') return;
    if (!f.noDate && !f.eventDate) return setState({ status: 'idle', error: 'Please add your event date, or tick “We haven’t fixed a date yet”.' });
    if (f.noDate && (!f.month || !f.year)) return setState({ status: 'idle', error: 'Roughly when is it? Pick a month and year.' });
    if (!f.heard) return setState({ status: 'idle', error: 'Please tell us how you heard about us. It really helps.' });
    setState({ status: 'sending', error: '' });
    const eventId = uuid();
    const consentAds = consent === 'yes' && !!pixelId;
    if (consentAds && window.fbq) window.fbq('track', 'Lead', { content_name: f.eventType || 'Event' }, { eventID: eventId });
    try {
      const res = await fetch('/api/public/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.name, email: f.email, phone: f.phone,
          eventDate: f.noDate ? '' : f.eventDate,
          approxMonth: f.noDate && f.month && f.year ? `${f.year}-${String(f.month).padStart(2, '0')}` : '',
          eventType: f.eventType, guests: f.guests, venue: f.venue, services: f.services,
          heard: f.heard, referredBy: THANK_WHO[f.heard] ? f.referredBy : '', notes: f.notes,
          marketingOptOut: f.optOut, consentAds,
          fbp: consentAds ? cookie('_fbp') : '', fbc: consentAds ? cookie('_fbc') : '',
          eventId, elapsedMs: Date.now() - shownAt.current,
          attribution: attr.current, company: f.company, channel: 'enquire',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || 'Something went wrong.');
      setState({ status: 'done', error: '', first: json.first || f.name.split(' ')[0] });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setState({ status: 'idle', error: err.message || 'Something went wrong. Please email hello@orpi.events.' });
    }
  }

  return (
    <div className="eq">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Outfit:wght@300;400;500&display=swap" />
      {/* Injected raw: as a text child React escapes the quotes differently on
          the server and the client, which breaks hydration. */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="eq-head">
        <div className="eq-mark">ORPI</div>
        <div className="eq-sub">Mobile bar · weddings &amp; celebrations</div>
      </header>

      {state.status === 'done' ? (
        <main className="eq-main">
          <p className="eq-label">Enquiry received</p>
          <h1 className="eq-h1">Thank you, <em>{state.first}</em>.</h1>
          <p className="eq-lead">We’ve got your details and we’ll come back with a quote built around your event, usually within 24 hours.</p>
          <p className="eq-lead">If anything’s urgent, message us and we’ll pick it up straight away.</p>
          <div className="eq-actions">
            <a className="eq-btn" href={WHATSAPP}>Message us on WhatsApp</a>
            <a className="eq-ghost" href="https://instagram.com/orpi.events">See our latest events on Instagram →</a>
          </div>
        </main>
      ) : (
        <main className="eq-main">
          <p className="eq-label">Request a quote</p>
          <h1 className="eq-h1">Let’s make your <em>celebration</em> one to remember.</h1>
          <p className="eq-lead">Tell us a little about your event and we’ll come back with a tailored quote, usually within 24 hours.</p>

          <form onSubmit={submit} noValidate={false}>
            <input className="eq-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.company} onChange={e => set('company', e.target.value)} name="company" />

            <div className="eq-row">
              <Field label="Your name"><input required autoComplete="name" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Full name" /></Field>
              <Field label="Phone"><input required type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="07700 000000" /></Field>
            </div>
            <Field label="Email"><input required type="email" autoComplete="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="your@email.com" /></Field>

            <div className="eq-row">
              <Field label="Event type">
                <select required value={f.eventType} onChange={e => set('eventType', e.target.value)}>
                  <option value="" disabled>Choose one</option>
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Event date">
                {f.noDate ? (
                  <div className="eq-split">
                    <select value={f.month} onChange={e => set('month', e.target.value)} aria-label="Month">
                      <option value="">Month</option>
                      {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <select value={f.year} onChange={e => set('year', e.target.value)} aria-label="Year">
                      <option value="">Year</option>
                      {[0, 1, 2, 3].map(n => <option key={n} value={thisYear + n}>{thisYear + n}</option>)}
                    </select>
                  </div>
                ) : (
                  <input type="date" min={today} value={f.eventDate} onChange={e => set('eventDate', e.target.value)} />
                )}
                <label className="eq-check small">
                  <input type="checkbox" checked={f.noDate} onChange={e => set('noDate', e.target.checked)} />
                  <span>We haven’t fixed a date yet</span>
                </label>
              </Field>
            </div>

            <div className="eq-row">
              <Field label="Roughly how many guests?"><input type="number" min="1" inputMode="numeric" value={f.guests} onChange={e => set('guests', e.target.value)} placeholder="e.g. 150" /></Field>
              <Field label="Venue or town"><input value={f.venue} onChange={e => set('venue', e.target.value)} placeholder="Venue name, or where it is" /></Field>
            </div>

            <Field label="What are you after? (pick any)">
              <div className="eq-chips">
                {SERVICE_TYPES.map(s => (
                  <button type="button" key={s} className={`eq-chip${f.services.includes(s) ? ' on' : ''}`} onClick={() => toggleService(s)} aria-pressed={f.services.includes(s)}>
                    {s === 'Custom' ? 'Not sure yet' : s}
                  </button>
                ))}
              </div>
            </Field>

            <div className="eq-row">
              <Field label="How did you hear about us?">
                <select required value={f.heard} onChange={e => set('heard', e.target.value)}>
                  <option value="" disabled>Choose one</option>
                  {HEARD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              {THANK_WHO[f.heard] ? (
                <Field label={THANK_WHO[f.heard]}><input value={f.referredBy} onChange={e => set('referredBy', e.target.value)} placeholder="So we can say thank you" /></Field>
              ) : <div className="eq-spacer" />}
            </div>

            <Field label="Anything else?"><textarea rows={4} maxLength={1500} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Theme, drinks you love, how long you’d like the bar open, questions…" /></Field>

            <label className="eq-check">
              <input type="checkbox" checked={f.optOut} onChange={e => set('optOut', e.target.checked)} />
              <span>Please don’t send me occasional planning tips and offers from ORPI.</span>
            </label>
            <p className="eq-fine">We use your details to reply and prepare your quote{f.optOut ? '' : ', and now and then to share planning tips and offers (you can opt out any time)'}. See our <a href="/privacy">privacy notice</a>.</p>

            {state.error && <p className="eq-error" role="alert">{state.error}</p>}
            <button className="eq-btn wide" type="submit" disabled={state.status === 'sending'}>{state.status === 'sending' ? 'Sending…' : 'Send enquiry'}</button>
            <p className="eq-fine center">Prefer to chat? <a href={WHATSAPP}>Message us on WhatsApp</a> or email <a href="mailto:hello@orpi.events">hello@orpi.events</a>.</p>
          </form>
        </main>
      )}

      {pixelId && consent === 'ask' && (
        <div className="eq-consent" role="dialog" aria-label="Cookie choice">
          <p>Can we use cookies to see which of our posts and ads bring people here? It helps us spend less on advertising. <a href="/privacy#cookies">More info</a></p>
          <div className="eq-consent-btns">
            <button type="button" onClick={() => choose('no')}>No thanks</button>
            <button type="button" onClick={() => choose('yes')}>Accept</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="eq-field">
      <span className="eq-flabel">{label}</span>
      {children}
    </div>
  );
}

const CSS = `
html,body{background:#080808}
.eq{min-height:100vh;background:#080808;color:#fff;font-family:'Outfit',system-ui,sans-serif;font-weight:300;line-height:1.6;padding:0 20px 120px}
.eq a{color:#fff}
.eq-head{max-width:720px;margin:0 auto;padding:28px 0 8px;display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:.5px solid rgba(255,255,255,.08)}
.eq-mark{font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;letter-spacing:.22em}
.eq-sub{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.45);text-align:right}
.eq-main{max-width:720px;margin:0 auto;padding:44px 0 0}
.eq-label{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.45);display:flex;align-items:center;gap:14px;margin-bottom:22px}
.eq-label:before{content:'';width:24px;height:.5px;background:rgba(255,255,255,.3)}
.eq-h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;font-size:clamp(34px,8vw,54px);line-height:1.08;letter-spacing:-.01em;margin-bottom:18px}
.eq-h1 em{font-style:italic}
.eq-lead{color:rgba(255,255,255,.7);font-size:15.5px;max-width:560px;margin-bottom:14px}
.eq form{margin-top:28px}
.eq-row{display:grid;grid-template-columns:1fr 1fr;gap:0 32px}
.eq-field{display:block;margin:0 0 26px}
.eq-flabel{display:block;font-size:11px;font-weight:400;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.42);margin-bottom:8px}
.eq input:not([type=checkbox]),.eq select,.eq textarea{width:100%;background:transparent;border:none;border-bottom:.5px solid rgba(255,255,255,.22);color:#fff;font-family:inherit;font-size:16px;font-weight:300;padding:8px 0 10px;border-radius:0;outline:none;transition:border-color .2s;-webkit-appearance:none;appearance:none}
.eq select{background-image:linear-gradient(45deg,transparent 50%,rgba(255,255,255,.5) 50%),linear-gradient(135deg,rgba(255,255,255,.5) 50%,transparent 50%);background-position:calc(100% - 12px) 55%,calc(100% - 7px) 55%;background-size:5px 5px;background-repeat:no-repeat;padding-right:24px}
.eq select option{background:#111;color:#fff}
.eq input::placeholder,.eq textarea::placeholder{color:rgba(255,255,255,.25)}
.eq input:focus,.eq select:focus,.eq textarea:focus{border-bottom-color:#fff}
.eq input[type=date]{color-scheme:dark;min-height:40px}
.eq textarea{resize:vertical;min-height:96px}
.eq-split{display:grid;grid-template-columns:1.4fr 1fr;gap:14px}
.eq-check{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;color:rgba(255,255,255,.72);margin:6px 0 10px;cursor:pointer}
.eq-check.small{font-size:12.5px;color:rgba(255,255,255,.5);margin-top:10px}
.eq-check input{margin-top:4px;accent-color:#fff;width:15px;height:15px;flex-shrink:0}
.eq-chips{display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}
.eq-chip{background:transparent;color:rgba(255,255,255,.75);border:.5px solid rgba(255,255,255,.25);border-radius:999px;padding:8px 14px;font:inherit;font-size:13px;cursor:pointer;transition:all .15s}
.eq-chip.on{background:#fff;color:#080808;border-color:#fff}
.eq-fine{font-size:12px;color:rgba(255,255,255,.45);margin:4px 0 20px}
.eq-fine.center{text-align:center;margin-top:18px}
.eq-error{background:rgba(255,90,70,.1);border-left:2px solid rgba(255,120,100,.8);color:#ffb4a8;font-size:13.5px;padding:10px 14px;margin:0 0 16px}
.eq-btn{display:inline-block;background:#fff;color:#080808!important;text-decoration:none;font-family:inherit;font-size:12px;font-weight:400;letter-spacing:.12em;text-transform:uppercase;padding:16px 30px;border:none;cursor:pointer;transition:opacity .2s;text-align:center}
.eq-btn.wide{width:100%}
.eq-btn:disabled{opacity:.6}
.eq-ghost{display:inline-block;font-size:13px;color:rgba(255,255,255,.7)!important;text-decoration:none;padding:14px 0}
.eq-actions{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:26px}
.eq-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.eq-spacer{display:block}
.eq-consent{position:fixed;left:12px;right:12px;bottom:12px;max-width:560px;margin:0 auto;background:#141414;border:.5px solid rgba(255,255,255,.18);padding:16px 18px;z-index:50;font-size:13px;color:rgba(255,255,255,.8)}
.eq-consent p{margin-bottom:12px}
.eq-consent-btns{display:flex;gap:10px}
.eq-consent-btns button{flex:1;padding:11px;font:inherit;font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border:.5px solid rgba(255,255,255,.4);background:transparent;color:#fff}
.eq-consent-btns button:last-child{background:#fff;color:#080808;border-color:#fff}
@media (max-width:640px){.eq-row{grid-template-columns:1fr}.eq-spacer{display:none}.eq-main{padding-top:32px}.eq-sub{display:none}}
`;
