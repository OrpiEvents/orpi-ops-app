import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { updateInventoryStock } from '@/lib/notion';
import { logActivity } from '@/lib/activityLog';

// POST { counts: [{ id, name, currentStock }, ...] }
// Bulk-applies a full stock take in one request, and logs a single
// activity entry summarising how many items were updated (rather than one
// log line per item, which would flood the activity feed).
export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { counts } = await request.json();
  if (!Array.isArray(counts) || !counts.length) {
    return NextResponse.json({ error: 'counts array is required' }, { status: 400 });
  }

  try {
    await Promise.all(counts.map(c => updateInventoryStock(c.id, Number(c.currentStock))));
    await logActivity({
      userEmail: user.email,
      action: 'stock.stocktake',
      target: `${counts.length} item(s)`,
      detail: counts.map(c => `${c.name}: ${c.currentStock}`).join(', ').slice(0, 500),
    });
    return NextResponse.json({ ok: true, updated: counts.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
