import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { createBookingCost, updateInventoryStock, createPurchase, createInventoryItem } from '@/lib/notion';
import { logActivity } from '@/lib/activityLog';

const CATEGORY_TO_COST_TYPE = {
  Spirit: 'Alcohol', Beer: 'Alcohol', Wine: 'Alcohol', Prosecco: 'Alcohol', Champagne: 'Alcohol', Liqueur: 'Alcohol',
  Mixer: 'Mixers', 'Soft Drink': 'Mixers', Ice: 'Ice', Garnish: 'Other/Misc', Other: 'Other/Misc',
};
const costTypeFor = cat => CATEGORY_TO_COST_TYPE[cat] || 'Other/Misc';
const n = v => Number(v) || 0;

// POST { loaded:[...], bought:[...], garnish:[...] } — the run sheet's three buckets.
//
//  loaded  { inventoryItemId, itemName, category, currentStock, averageUnitCost, takenOut, returned }
//          Stock we already owned. used = takenOut − returned. The event is
//          charged for the used portion (used × locked avg cost) and that item's
//          Current Stock drops by what was used; sealed bottles just stay in stock.
//
//  bought  { inventoryItemId|null, itemName, category, currentStock, unitCost, boughtQty, returned, addToLibrary }
//          Stock bought specifically for this event. The purchase is logged
//          (which bumps stock by the full amount bought), the event is charged
//          only for what was used (used × price paid), and the net effect on
//          stock is +returned — i.e. leftover bottles come back into inventory.
//          A typed, off-catalogue item joins the library only if addToLibrary.
//
//  garnish { name, cost }
//          Per-event actual, all consumed — a flat cost line, no stock movement.
export async function POST(request, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json();
  const loaded = Array.isArray(body.loaded) ? body.loaded : [];
  const bought = Array.isArray(body.bought) ? body.bought : [];
  const garnish = Array.isArray(body.garnish) ? body.garnish : [];

  const today = new Date().toISOString().slice(0, 10);
  const summary = { loaded: 0, bought: 0, garnish: 0, newItems: 0, backToStock: 0 };
  const notes = [];

  try {
    // 1. LOADED FROM STOCK — cost the used portion, drop stock by what was used.
    for (const e of loaded) {
      const used = n(e.takenOut) - n(e.returned);
      if (used <= 0) continue;
      await createBookingCost(params.id, {
        name: e.itemName, costType: costTypeFor(e.category),
        inventoryItemId: e.inventoryItemId, quantityUsed: used, lockedUnitCost: n(e.averageUnitCost),
      });
      await updateInventoryStock(e.inventoryItemId, Math.max(0, n(e.currentStock) - used));
      summary.loaded++;
      summary.backToStock += n(e.returned);
      notes.push(`${e.itemName}: ${used} used`);
    }

    // 2. BOUGHT FOR THE EVENT — log the buy, charge the used portion, return the rest to stock.
    for (const b of bought) {
      const boughtQty = n(b.boughtQty);
      if (boughtQty <= 0) continue;
      const used = Math.max(0, boughtQty - n(b.returned));
      let itemId = b.inventoryItemId || null;

      // A typed, off-catalogue item joins the library only when the user ticked it.
      if (!itemId && b.addToLibrary) {
        const created = await createInventoryItem({ name: b.itemName, category: b.category || 'Other', currentStock: 0 });
        itemId = created.id;
        summary.newItems++;
      }

      if (itemId) {
        // createPurchase bumps stock by the full amount bought; then set the
        // absolute level to (start + bought − used) so the net is +returned.
        await createPurchase({ inventoryItemId: itemId, itemName: b.itemName, quantity: boughtQty, unitCost: n(b.unitCost), dateBought: today, ownedBy: 'ORPI' });
        await updateInventoryStock(itemId, Math.max(0, n(b.currentStock) + boughtQty - used));
        summary.backToStock += n(b.returned);
      }
      if (used > 0) {
        await createBookingCost(params.id, {
          name: itemId ? b.itemName : `${b.itemName} (bought)`,
          costType: costTypeFor(b.category),
          inventoryItemId: itemId || undefined,
          quantityUsed: used, lockedUnitCost: n(b.unitCost),
        });
      }
      summary.bought++;
      notes.push(`${b.itemName}: bought ${boughtQty}, ${used} used${itemId ? '' : ' (one-off)'}`);
    }

    // 3. GARNISH — flat per-event cost line (qty 1 × the £ entered), no stock.
    for (const g of garnish) {
      const cost = n(g.cost);
      if (cost <= 0) continue;
      await createBookingCost(params.id, {
        name: `Garnish — ${g.name}`, costType: 'Other/Misc', quantityUsed: 1, lockedUnitCost: cost,
      });
      summary.garnish++;
    }

    if (!summary.loaded && !summary.bought && !summary.garnish) {
      return NextResponse.json({ error: 'Nothing to save — enter some usage, a purchase, or a garnish cost first.' }, { status: 400 });
    }

    await logActivity({
      userEmail: user.email, action: 'booking.runsheet',
      target: `${summary.loaded + summary.bought + summary.garnish} line(s)`,
      detail: notes.join(', ').slice(0, 500),
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
