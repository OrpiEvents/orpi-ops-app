'use client';
import { useEffect, useState } from 'react';
import AppShell from '../../AppShell';
import { useJson, PageHead, SectionHead, Card, Grid, Loading, ErrorBox, Pill, Note, btn, inputStyle, labelStyle } from '../ui';

const PERMISSIONS = 'instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement, business_management, ads_read, ads_management, leads_retrieval, pages_manage_metadata, pages_manage_ads';

export default function SetupClient({ userEmail, role }) {
  const [url, setUrl] = useState('/api/growth/setup');
  const { data, error, loading, reload } = useJson(url);
  const director = role === 'director';
  return (
    <AppShell active="/growth/setup" userEmail={userEmail} role={role}>
      <PageHead
        title="Connections"
        sub="Everything the growth system plugs into, what’s connected, and what’s left. Secrets live in Vercel and are only ever shown here as set or not set."
      />
      {loading && !data && <Loading what="connections" />}
      {error && <ErrorBox error={error} />}
      {data && <Body d={data} director={director} reload={reload} discover={() => setUrl(`/api/growth/setup?discover=1&t=${Date.now()}`)} discovering={loading && url.includes('discover')} />}
    </AppShell>
  );
}

function Step({ ok, title, children, optional }) {
  const state = ok === true ? ['✓', 'Done', 'var(--success)', 'var(--success-bg)'] : ok === 'n/a' ? ['–', 'Later', '#9a988f', 'var(--mid)'] : ['○', optional ? 'Optional' : 'To do', 'var(--gold)', 'var(--gold-bg)'];
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--off)' }}>
      <span aria-hidden style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 11, background: state[3], color: state[2], border: `1px solid ${state[2]}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{state[0]}</span>
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.55 }}>
        <div><span style={{ fontWeight: 600 }}>{title}</span> <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: state[2], marginLeft: 4 }}>{state[1]}</span></div>
        <div style={{ color: '#52514e', marginTop: 2 }}>{children}</div>
      </div>
    </div>
  );
}

const Code = ({ children }) => <code style={{ background: 'var(--mid)', padding: '1px 5px', borderRadius: 4, fontSize: 12, wordBreak: 'break-all' }}>{children}</code>;

function Body({ d, director, reload, discover, discovering }) {
  const e = d.env, m = d.meta || {};
  const secure = d.security?.app_state_director_only && d.security?.activity_log_director_only;
  return (
    <>
      <SectionHead>1 · The app itself</SectionHead>
      <Card pad="2px 18px">
        <Step ok={secure} title="Directors-only data">
          {secure ? 'Quotes, invoices, overheads, run sheets and the activity log are directors-only at the database level.'
            : 'Any login can still read quotes, invoices, overheads and run sheets from the browser. A one-off database change fixes it (prepared, waiting for Ruds’s OK). The Team page won’t create a marketing login until it’s done.'}
        </Step>
        <Step ok={d.calendar?.ok} title="Content Calendar readable">
          {d.calendar?.ok ? `${d.calendar.count} posts readable.` : <>In Notion, open the Content Calendar (inside “ORPI Growth Agent”) → ••• → Connections → add the same integration the Sales Pipeline uses.</>}
        </Step>
        <Step ok={e.CRON_SECRET} title="Daily sync switched on">
          {e.CRON_SECRET ? 'The daily job runs once a day (on Vercel’s free plan the exact time varies within the hour).' : <>In Vercel → orpi-app → Settings → Environment Variables, add <Code>CRON_SECRET</Code> with a long random value, then redeploy. Without it the daily sync is switched off.</>}
        </Step>
        <Step ok={e.RESEND_API_KEY} title="Email sending">
          {e.RESEND_API_KEY ? 'New-enquiry alerts go to the inbox.' : <>Add <Code>RESEND_API_KEY</Code> in Vercel so new-enquiry alerts reach the inbox.</>}
        </Step>
        <Step ok={false} title="Vercel Pro plan">
          Vercel’s free Hobby plan is for non-commercial use only, so a trading business should be on Pro ($20/month plus VAT, as of Sep 2026). Pro also lets scheduled jobs run more than once a day, e.g. the enquiry auto-reply. Upgrade in Vercel → Settings → Billing.
        </Step>
      </Card>

      <SectionHead>2 · Meta: accounts (Ruds, in Meta Business)</SectionHead>
      <Card pad="2px 18px">
        <Step ok={!!m.pageId || null} title="Business portfolio owns the Page and Instagram">At business.facebook.com, create (or open) ORPI’s business portfolio. Add the ORPI Facebook Page and the Instagram account, and make sure Instagram is a professional (Business) account linked to that Page.</Step>
        <Step ok={!!m.adAccountId || null} title="Ad account: GBP, Europe/London">Create the ad account inside the portfolio. <strong>Currency and time zone can’t be changed later</strong>: pick GBP and Europe/London. Add the payment method yourself in Billing.</Step>
        <Step ok={!!m.pixelId || null} optional title="Pixel (dataset)">Events Manager → Connect data → Web. Name it “ORPI Events”. Then Settings → Conversions API → Generate access token, and add it in Vercel as <Code>META_CAPI_TOKEN</Code>. This is Meta’s recommended route; no app review needed.</Step>
        <Step ok="n/a" title="Verify orpi.events">When the website launches: Brand safety → Domains → add orpi.events and verify it with the DNS record or HTML file Meta gives.</Step>
      </Card>

      <SectionHead>3 · Meta: the app’s access (Ruds, one-off)</SectionHead>
      <Card pad="2px 18px">
        <Step ok={e.META_ACCESS_TOKEN} title="Meta app + system user token">
          {e.META_ACCESS_TOKEN ? 'Token is set in Vercel.' : (
            <>
              developers.facebook.com → Create app → connect it to ORPI’s business portfolio, with the use cases “Measure ad performance data with Marketing API”, “Capture &amp; manage ad leads with Marketing API” and Instagram “Manage messaging and content” (Facebook Login). Then in Business settings → Users → System users → Add (Admin) → Add assets: the app, the Page, the Instagram account, the ad account and the pixel → Generate new token for the app with: <Code>{PERMISSIONS}</Code>. Choose “never expires” (or 60 days, and renew it). <strong>It’s shown once</strong>: paste it straight into Vercel as <Code>META_ACCESS_TOKEN</Code> and redeploy. The app only ever reads with it; it never creates, edits or pays for ads.
            </>
          )}
        </Step>
        <Step ok={e.META_APP_SECRET} optional title="App secret (for lead forms)">From the Meta app: App settings → Basic → App secret. Add it in Vercel as <Code>META_APP_SECRET</Code>. It’s needed to check that lead-form notifications really come from Meta.</Step>
      </Card>

      <SectionHead>4 · Choose what the app reads</SectionHead>
      <Card>
        {!d.env.META_ACCESS_TOKEN ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Once the token is in Vercel, find your Page, Instagram account, ad account and pixel here.</p>
        ) : director ? (
          <Assets d={d} discover={discover} discovering={discovering} saved={reload} />
        ) : (
          <p style={{ fontSize: 13 }}>Connected to: {[m.pageName, m.igUsername && `@${m.igUsername}`, m.adAccountName, m.pixelName].filter(Boolean).join(' · ') || 'not chosen yet (a director picks these)'}</p>
        )}
      </Card>

      {director && (
        <>
          <SectionHead>5 · Lead forms into the Sales Pipeline</SectionHead>
          <Card pad="2px 18px">
            <Step ok={!!m.leadFormsSubscribed} optional title="Instant Form leads arrive in seconds">
              In the Meta app → Webhooks → Page → subscribe to <Code>leadgen</Code> with callback URL <Code>{d.urls.webhook}</Code> and verify token <Code>{d.urls.webhookVerifyToken || 'set CRON_SECRET or META_APP_SECRET first'}</Code>. Publish the app (no review needed). Then press:
              <div style={{ marginTop: 8 }}><SubscribeButton disabled={!e.META_ACCESS_TOKEN || !e.META_APP_SECRET || !m.pageId} done={reload} /></div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Test with a real lead from someone who isn’t on the Meta app, not just Meta’s testing tool.</div>
            </Step>
          </Card>

          <SectionHead>6 · Your controls</SectionHead>
          <Settings d={d} saved={reload} />

          <SectionHead>Sync</SectionHead>
          <SyncPanel d={d} done={reload} />
        </>
      )}

      <SectionHead>Useful links</SectionHead>
      <Card pad="4px 18px">
        <Note compact text={<>Enquiry page: <Code>{d.urls.enquire}</Code> (point the Instagram bio at a tracked link to it, not this address directly)</>} />
        <Note compact text={<>Privacy notice: <Code>{d.urls.privacy}</Code></>} />
        <Note compact text={<>Meta API version in use: <Code>{d.graphVersion}</Code></>} />
        {director && <Note compact text={<>Team and logins: <a href="/team" style={{ color: 'var(--gold)' }}>Team page</a></>} />}
      </Card>
    </>
  );
}

function Assets({ d, discover, discovering, saved }) {
  const m = d.meta || {};
  const disc = d.discovery;
  const [pick, setPick] = useState({ pageId: m.pageId || '', adAccountId: m.adAccountId || '', pixelId: m.pixelId || '' });
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!disc) return;
    setPick(p => ({
      pageId: p.pageId || (disc.pages.length === 1 ? disc.pages[0].id : ''),
      adAccountId: p.adAccountId || (disc.adAccounts.length === 1 ? disc.adAccounts[0].id : ''),
      pixelId: p.pixelId || (disc.pixels.length === 1 ? disc.pixels[0].id : ''),
    }));
  }, [disc]);

  async function save() {
    const page = disc.pages.find(p => p.id === pick.pageId);
    const acct = disc.adAccounts.find(a => a.id === pick.adAccountId);
    const px = disc.pixels.find(p => p.id === pick.pixelId);
    const res = await fetch('/api/growth/setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveMeta', meta: {
        pageId: page?.id || '', pageName: page?.name || '', igUserId: page?.ig?.id || '', igUsername: page?.ig?.username || '',
        adAccountId: acct?.id || '', adAccountName: acct?.name || '', adAccountCurrency: acct?.currency || '',
        pixelId: px?.id || '', pixelName: px?.name || '',
      } }),
    });
    setMsg(res.ok ? 'Saved. Press “Sync now (4 weeks)” below to pull the history.' : 'Could not save.');
    saved();
  }

  return (
    <div>
      <p style={{ fontSize: 13, marginBottom: 10 }}>
        Now reading: {[m.pageName, m.igUsername && `@${m.igUsername}`, m.adAccountName, m.pixelName].filter(Boolean).join(' · ') || 'nothing chosen yet'}.
      </p>
      <button onClick={discover} style={btn(true)}>{discovering ? 'Looking…' : 'Find my accounts'}</button>
      {disc && (
        <div style={{ marginTop: 14 }}>
          {disc.errors.length > 0 && disc.errors.map(x => <Note key={x} tone="warn" text={x} compact />)}
          {disc.permissions.length > 0 && <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '6px 0 10px' }}>Token permissions: {disc.permissions.join(', ')}</p>}
          <Grid min={220} gap={12}>
            <div>
              <label style={labelStyle}>Facebook Page + Instagram</label>
              <select value={pick.pageId} onChange={e => setPick(p => ({ ...p, pageId: e.target.value }))} style={inputStyle}>
                <option value="">—</option>
                {disc.pages.map(p => <option key={p.id} value={p.id}>{p.name}{p.ig ? ` · @${p.ig.username}` : ' · no Instagram linked'}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Ad account</label>
              <select value={pick.adAccountId} onChange={e => setPick(p => ({ ...p, adAccountId: e.target.value }))} style={inputStyle}>
                <option value="">—</option>
                {disc.adAccounts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}{a.currency !== 'GBP' ? ' (not GBP!)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Pixel</label>
              <select value={pick.pixelId} onChange={e => setPick(p => ({ ...p, pixelId: e.target.value }))} style={inputStyle}>
                <option value="">—</option>
                {disc.pixels.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </Grid>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={save} style={btn(true)}>Save</button>
            {msg && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Settings({ d, saved }) {
  const s = d.settings || {};
  const [f, setF] = useState({ autoAcknowledge: !!s.autoAcknowledge, monthlyAdBudget: s.monthlyAdBudget ?? '', boostCeiling: s.boostCeiling ?? '', acquisitionShare: Math.round((s.acquisitionShare ?? 0.1) * 100) });
  const [msg, setMsg] = useState('');
  async function save() {
    const res = await fetch('/api/growth/setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveSettings', settings: { autoAcknowledge: f.autoAcknowledge, monthlyAdBudget: f.monthlyAdBudget === '' ? null : Number(f.monthlyAdBudget), boostCeiling: f.boostCeiling === '' ? null : Number(f.boostCeiling), acquisitionShare: Number(f.acquisitionShare) / 100 } }),
    });
    setMsg(res.ok ? 'Saved.' : 'Could not save.');
    saved();
  }
  return (
    <Card>
      <Grid min={200} gap={14}>
        <div>
          <label style={labelStyle}>Monthly ad ceiling (£)</label>
          <input type="number" min="0" value={f.monthlyAdBudget} onChange={e => setF(p => ({ ...p, monthlyAdBudget: e.target.value }))} placeholder="e.g. 300" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Most per boost without asking (£)</label>
          <input type="number" min="0" value={f.boostCeiling} onChange={e => setF(p => ({ ...p, boostCeiling: e.target.value }))} placeholder="e.g. 30" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Share of a booking we’ll spend to win it (%)</label>
          <input type="number" min="1" max="50" value={f.acquisitionShare} onChange={e => setF(p => ({ ...p, acquisitionShare: e.target.value }))} style={inputStyle} />
        </div>
      </Grid>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, fontSize: 13, lineHeight: 1.5 }}>
        <input type="checkbox" checked={f.autoAcknowledge} onChange={e => setF(p => ({ ...p, autoAcknowledge: e.target.checked }))} style={{ marginTop: 3 }} />
        <span><strong style={{ fontWeight: 600 }}>Email new enquiries an acknowledgement automatically.</strong> Applies to the enquiry page (and the website form when it launches): a short “we’ve got your enquiry” email from hello@orpi.events, same wording as before. Off until you switch it on. The inbox alert to you always goes.</span>
      </label>
      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={save} style={btn(true)}>Save controls</button>
        {msg && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{msg}</span>}
      </div>
    </Card>
  );
}

function SubscribeButton({ disabled, done }) {
  const [msg, setMsg] = useState('');
  async function go() {
    setMsg('…');
    const res = await fetch('/api/growth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'subscribeLeads' }) });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? 'Connected ✓' : j.error || 'Failed');
    done();
  }
  return (
    <span>
      <button disabled={disabled} onClick={go} style={{ ...btn(true), opacity: disabled ? 0.5 : 1 }}>Connect the Page’s lead forms</button>
      {msg && <span style={{ fontSize: 12.5, color: 'var(--muted)', marginLeft: 10 }}>{msg}</span>}
    </span>
  );
}

function SyncPanel({ d, done }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  async function run(backfill) {
    setBusy(true);
    const res = await fetch('/api/growth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'syncNow', backfill }) });
    const j = await res.json().catch(() => ({}));
    setReport(j.report || { ok: false, steps: { error: { ok: false, error: j.error } } });
    setBusy(false);
    done();
  }
  return (
    <Card>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button disabled={busy} onClick={() => run(false)} style={btn(true)}>{busy ? 'Syncing…' : 'Sync now'}</button>
        <button disabled={busy} onClick={() => run(true)} style={btn()}>Sync now (4 weeks)</button>
      </div>
      {report && Object.entries(report.steps).map(([k, s]) => <Note key={k} compact tone={s.ok ? 'good' : 'warn'} text={`${k}: ${s.ok ? s.detail : s.error}`} />)}
      <div style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 4px' }}>Recent runs</div>
      {d.syncLog.length ? d.syncLog.map(r => (
        <div key={r.id} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--off)' }}>
          <span style={{ color: 'var(--muted)', width: 130, flexShrink: 0 }}>{new Date(r.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
          <Pill tone={r.ok ? 'good' : 'warn'}>{r.job}</Pill>
          <span style={{ color: '#52514e' }}>{r.detail}</span>
        </div>
      )) : <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No runs yet.</div>}
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>Stored so far: {d.counts.igDays} Instagram days, {d.counts.igPosts} posts, {d.counts.adRows} ad-days, {d.counts.links} links, {d.counts.leads} tracked enquiries.</div>
    </Card>
  );
}
