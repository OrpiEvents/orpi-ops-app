// One-off inventory clean-up migration (names, archive, recategorise).
// POST { dryRun: true } to preview, { dryRun: false } to apply.
// Auth-gated (signed-in user). Remove this route after the migration is done.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import MIG from './migration-data.json';

export const dynamic = 'force-dynamic';

const TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
const DB = process.env.NOTION_DB_INVENTORY || '2e16ca9d054980cf978edf55d1d40efb';
const H = () => ({ Authorization: `Bearer ${TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' });
const pause = ms => new Promise(r => setTimeout(r, ms));
const titleOf = p => (p?.properties?.['Item Name']?.title || []).map(t => t.plain_text).join('').trim();

async function queryAll() {
  const rows = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
      method: 'POST', headers: H(), body: JSON.stringify({ page_size: 100, start_cursor: cursor }), cache: 'no-store',
    });
    if (!res.ok) throw new Error('inventory query ' + res.status);
    const j = await res.json();
    rows.push(...j.results);
    cursor = j.has_more ? j.next_cursor : undefined;
  } while (cursor);
  return rows;
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!TOKEN) return NextResponse.json({ error: 'NOTION_TOKEN missing' }, { status: 500 });

  let body = {};
  try { body = await request.json(); } catch { /* default */ }
  const dryRun = body.dryRun !== false; // default to dry run

  const pages = await queryAll();
  const byName = {};
  for (const p of pages) { const n = titleOf(p); if (n) byName[n.toLowerCase()] = p; }

  const out = { renamed: [], archived: [], recategorised: [], skipped: [], errors: [] };

  for (const [cur, nw] of Object.entries(MIG.renames || {})) {
    const p = byName[cur.toLowerCase()];
    if (!p) { out.skipped.push({ op: 'rename', item: cur, reason: 'not found' }); continue; }
    if (titleOf(p) === nw) continue; // already applied
    if (!dryRun) {
      const res = await fetch(`https://api.notion.com/v1/pages/${p.id}`, {
        method: 'PATCH', headers: H(),
        body: JSON.stringify({ properties: { 'Item Name': { title: [{ text: { content: nw } }] } } }),
      });
      if (!res.ok) { out.errors.push({ op: 'rename', item: cur, status: res.status, msg: (await res.text()).slice(0, 160) }); await pause(360); continue; }
      await pause(360);
    }
    out.renamed.push({ from: cur, to: nw });
  }

  for (const [name, cat] of Object.entries(MIG.recategorise || {})) {
    const p = byName[name.toLowerCase()];
    if (!p) { out.skipped.push({ op: 'recat', item: name, reason: 'not found' }); continue; }
    if (!dryRun) {
      const res = await fetch(`https://api.notion.com/v1/pages/${p.id}`, {
        method: 'PATCH', headers: H(),
        body: JSON.stringify({ properties: { Catagory: { select: { name: cat } } } }),
      });
      if (!res.ok) { out.errors.push({ op: 'recat', item: name, status: res.status, msg: (await res.text()).slice(0, 160) }); await pause(360); continue; }
      await pause(360);
    }
    out.recategorised.push({ name, cat });
  }

  for (const name of (MIG.archive || [])) {
    const p = byName[name.toLowerCase()];
    if (!p) { out.skipped.push({ op: 'archive', item: name, reason: 'not found' }); continue; }
    if (!dryRun) {
      const res = await fetch(`https://api.notion.com/v1/pages/${p.id}`, {
        method: 'PATCH', headers: H(), body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) { out.errors.push({ op: 'archive', item: name, status: res.status, msg: (await res.text()).slice(0, 160) }); await pause(360); continue; }
      await pause(360);
    }
    out.archived.push(name);
  }

  return NextResponse.json({
    dryRun,
    counts: {
      renamed: out.renamed.length, archived: out.archived.length,
      recategorised: out.recategorised.length, skipped: out.skipped.length, errors: out.errors.length,
    },
    skipped: out.skipped,
    errors: out.errors,
  });
}
