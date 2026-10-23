import { NextResponse } from 'next/server';
import { authorize } from '@/lib/apiAuth';
import { getSettings, saveSettings, getMetaConfig, saveMetaConfig, readGrowthData, securityStatus } from '@/lib/growthStore';
import { listContentCalendar } from '@/lib/notion';
import { hasMeta, discoverAssets, GRAPH_VERSION, webhookVerifyToken, subscribePageToLeads } from '@/lib/meta';
import { runGrowthSync } from '@/lib/growthSync';
import { canEmail } from '@/lib/mailer';
import { logActivity } from '@/lib/activityLog';

// Connections: what's linked, what's missing, and the switches a director
// controls. Shows whether secrets are SET — never their values.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ENV_KEYS = ['META_ACCESS_TOKEN', 'META_APP_SECRET', 'META_CAPI_TOKEN', 'CRON_SECRET', 'RESEND_API_KEY', 'NOTION_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY'];

export async function GET(request) {
  const { role, deny } = await authorize(['director', 'marketing']);
  if (deny) return deny;
  const director = role === 'director';
  try {
    const [settings, meta, store, security, calendar] = await Promise.all([
      getSettings(), getMetaConfig(), readGrowthData({ days: 30 }), securityStatus(),
      listContentCalendar().then(items => ({ ok: true, count: items.length })).catch(e => ({ ok: false, error: e.message })),
    ]);
    const discover = director && hasMeta() && request.nextUrl.searchParams.get('discover') === '1';
    const origin = request.nextUrl.origin;
    return NextResponse.json({
      role,
      env: Object.fromEntries(ENV_KEYS.map(k => [k, !!process.env[k]])),
      canEmail: canEmail(),
      graphVersion: GRAPH_VERSION(),
      meta,
      discovery: discover ? await discoverAssets() : null,
      calendar,
      security,
      settings: director ? settings : { autoAcknowledge: settings.autoAcknowledge, monthlyAdBudget: settings.monthlyAdBudget, boostCeiling: settings.boostCeiling },
      syncLog: store.syncLog.slice(0, 12),
      counts: { links: store.links.length, igDays: store.igDaily.length, igPosts: store.igMedia.length, adRows: store.ads.length, leads: store.leads.length },
      urls: {
        enquire: `${origin}/enquire`,
        privacy: `${origin}/privacy`,
        ...(director ? { webhook: `${origin}/api/meta/webhook`, webhookVerifyToken: webhookVerifyToken() } : {}),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(request) {
  const { user, deny } = await authorize(['director']);
  if (deny) return deny;
  const b = await request.json().catch(() => ({}));
  try {
    if (b.action === 'saveMeta') {
      const cfg = await saveMetaConfig(b.meta || {});
      await logActivity({ userEmail: user.email, action: 'growth.meta.config', target: 'Meta assets', detail: JSON.stringify(cfg) });
      return NextResponse.json({ ok: true, meta: cfg });
    }
    if (b.action === 'saveSettings') {
      const s = b.settings || {};
      const clean = {};
      if (typeof s.autoAcknowledge === 'boolean') clean.autoAcknowledge = s.autoAcknowledge;
      for (const k of ['monthlyAdBudget', 'boostCeiling']) {
        if (s[k] === null || s[k] === '') clean[k] = null;
        else if (s[k] !== undefined && !Number.isNaN(Number(s[k]))) clean[k] = Math.max(0, Number(s[k]));
      }
      if (s.acquisitionShare !== undefined && Number(s.acquisitionShare) > 0 && Number(s.acquisitionShare) <= 0.5) clean.acquisitionShare = Number(s.acquisitionShare);
      const settings = await saveSettings(clean);
      await logActivity({ userEmail: user.email, action: 'growth.settings', target: 'Growth settings', detail: JSON.stringify(clean) });
      return NextResponse.json({ ok: true, settings });
    }
    if (b.action === 'syncNow') {
      const report = await runGrowthSync({ backfillDays: b.backfill ? 28 : undefined });
      return NextResponse.json({ ok: true, report });
    }
    if (b.action === 'subscribeLeads') {
      // Connects the Facebook Page's lead forms to the app's webhook. Only on a
      // director's click, and only after they've set up the webhook in Meta.
      const meta = await getMetaConfig();
      if (!meta.pageId) return NextResponse.json({ error: 'Choose the Facebook Page first.' }, { status: 400 });
      const r = await subscribePageToLeads(meta.pageId);
      await saveMetaConfig({ leadFormsSubscribed: !!r?.success });
      await logActivity({ userEmail: user.email, action: 'growth.meta.leads-subscribe', target: meta.pageName || meta.pageId, detail: JSON.stringify(r) });
      return NextResponse.json({ ok: true, result: r });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
