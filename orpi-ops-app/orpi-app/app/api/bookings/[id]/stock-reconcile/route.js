import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { createBookingCost, updateInventoryStock } from '@/lib/notion';
import { logActivity } from '@/lib/activityLog';

const CATEGORY_TO_COST_TYPE = {
  Spirit: 'Alcohol', Beer: 'Alcohol', Wine: 'Alcohol', Prosecco: 'Alcohol', Champagne: 'Alcohol', Liqueur: 'Alcohol',
  Mixer: 'Mixers', 'Soft Drink': 'Mixers', Ice: 'Ice', Garnish: 'Other/Misc', Other: 'Other/Misc',
};

// POST { entries: [{ inventoryItemId, itemName, category, currentStock, averageUnitCost, takenOut, returned }] }
//
// For each entry where takenOut > returned: creates an Event Costing line
// (quantity used × today's average unit cost, locked in) linked to both this
// booking and the inventory item, AND deducts the used amount from that
// item's Current Stock — one action, two systems updated, no separate stock
// take needed for what was used at this specific event.
export async function POST(request, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { entries } = await request.json();
  if (!Array.isArray(entries) || !entries.length) {
    return NextResponse.json({ error: 'entries array is required' }, { status: 400 });
  }

  const toProcess = entries
    .map(e => ({ ...e, used: (Number(e.takenOut) || 0) - (Number(e.returned) || 0) }))
    .filter(e => e.used > 0);

  if (!toProcess.length) {
    return NextResponse.json({ error: 'No net stock usage entered (taken out must exceed returned for at least one item).' }, { status: 400 });
  }

  try {
    await Promise.all(toProcess.map(async e => {
      await createBookingCost(params.id, {
        name: e.itemName,
        costType: CATEGORY_TO_COST_TYPE[e.category] || 'Other/Misc',
        inventoryItemId: e.inventoryItemId,
        quantityUsed: e.used,
        lockedUnitCost: e.averageUnitCost || 0,
      });
      await updateInventoryStock(e.inventoryItemId, Math.max(0, (e.currentStock || 0) - e.used));
    }));

    await logActivity({
      userEmail: user.email,
      action: 'booking.stock_reconcile',
      target: `${toProcess.length} item(s)`,
      detail: toProcess.map(e => `${e.itemName}: ${e.used} used`).join(', ').slice(0, 500),
    });

    return NextResponse.json({ ok: true, processed: toProcess.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
